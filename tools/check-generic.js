#!/usr/bin/env node
// Genericity guard: TADForce must never contain a client, integrator or project name.
// Every word of the tracked files, of the file names and of the commit messages is hashed (SHA-256)
// and compared with tools/forbidden-tokens.sha256 — the list itself names nothing.
// Local, plain-text terms (never committed) can be added in .forbidden-local.txt, one per line.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BINARY = /\.(png|jpe?g|gif|ico|webp|pdf|docx|xlsx|zip|woff2?|ttf)$/i;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashes = new Set(fs.readFileSync(path.join(ROOT, 'tools', 'forbidden-tokens.sha256'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[0-9a-f]{64}$/.test(l)));

function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch { return null; }
}

const listed = git(['ls-files', '--cached', '--others', '--exclude-standard']);
const files = (listed ? listed.split('\n') : []).filter(Boolean).filter((f) => fs.existsSync(path.join(ROOT, f)));

const local = fs.existsSync(path.join(ROOT, '.forbidden-local.txt'))
  ? fs.readFileSync(path.join(ROOT, '.forbidden-local.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : [];
const localRes = local.map((t) => [t, new RegExp(`(^|[^\\p{L}\\p{N}_])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}_])`, 'iu')]);

const hits = [];
function scanText(text, where) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const raw of line.match(/[\p{L}\p{N}_&]+/gu) || []) {
      // whole word, its _ / & parts, and its camelCase / digit-letter parts (Abc12Id → abc12, id)
      const pieces = raw.split(/[_&]/).flatMap((w) => [w, ...w.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=\d)(?=[A-Za-z])/)]);
      const parts = new Set([raw, ...pieces].map((p) => p.toLowerCase()));
      for (const p of parts) if (p && hashes.has(sha(p))) { hits.push({ where: `${where}:${i + 1}`, token: '‹hashed›', line: line.trim().slice(0, 140) }); break; }
    }
    for (const [t, re] of localRes) if (re.test(line)) hits.push({ where: `${where}:${i + 1}`, token: t, line: line.trim().slice(0, 140) });
  });
}

// Third-party bundles shipped unmodified (minified identifiers are not references): names checked, content skipped.
const VENDOR = /^templates\/vendor\/[^/]+\.js$/;

for (const f of files) {
  scanText(f, `(path) ${f}`);
  if (BINARY.test(f) || VENDOR.test(f)) continue;
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  scanText(text, f);
}
const log = git(['log', '--format=%H%n%B']);
if (log) scanText(log, '(commit messages)');

if (hits.length) {
  console.error(`✖ genericity guard: ${hits.length} forbidden reference(s)`);
  for (const h of hits.slice(0, 50)) console.error(`  ${h.where}  [${h.token}]  ${h.line}`);
  process.exit(1);
}
console.log(`✔ genericity guard: ${files.length} files, file names and commit messages are clean`);
