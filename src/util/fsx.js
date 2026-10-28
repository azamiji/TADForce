import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const exists = (p) => fs.existsSync(p);
// BOM removed and line endings normalised: sources edited on Windows (CRLF) behave like the others.
export const readText = (p) => fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
export const readJson = (p) => JSON.parse(readText(p));
export const safeReadJson = (p) => { try { return readJson(p); } catch { return null; } };
export const readYaml =(p, fallback = {}) => (exists(p) ? YAML.parse(readText(p)) ?? fallback : fallback);

export function writeText(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, 'utf8');
}

/** Deterministic JSON: object keys sorted, two-space indent, trailing newline. */
export function stableStringify(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value), null, 2) + '\n';
}

export const writeJson = (p, v) => writeText(p, stableStringify(v));

/** Recursively list files under dir (sorted, forward-slash relative paths). */
export function walk(dir, { filter = () => true } = {}) {
  const out = [];
  if (!exists(dir)) return out;
  const visit = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
        visit(full);
      } else if (filter(full)) out.push(full);
    }
  };
  visit(dir);
  return out;
}

export const toPosix = (p) => p.split(path.sep).join('/');

export function copyDir(src, dst, { overwrite = false } = {}) {
  for (const f of walk(src)) {
    const rel = path.relative(src, f);
    const target = path.join(dst, rel);
    if (!overwrite && exists(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(f, target);
  }
}
