import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { readText, walk } from '../util/fsx.js';

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

/** Parse a metadata XML file and return its root element (attributes ignored, values as strings). */
export function readXml(file) {
  try {
    const obj = parser.parse(safeRead(file));
    const root = Object.keys(obj).find((k) => k !== '?xml');
    return (root && obj[root]) || {};
  } catch {
    return {};
  }
}

export const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
export const bool = (v) => v === true || v === 'true';
export const str = (v) => (v == null ? null : typeof v === 'object' ? null : String(v));
export const byName = (a, b) => String(a.name).localeCompare(String(b.name));
export const sortNames = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b));

export function host(url) {
  if (!url || typeof url !== 'string') return null;
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

/** Folders that identify a Salesforce source-format metadata root (e.g. force-app/main/default). */
const MARKERS = new Set(['classes', 'objects', 'lwc', 'aura', 'flows', 'triggers', 'permissionsets', 'layouts', 'flexipages', 'applications', 'customMetadata', 'profiles', 'tabs', 'labels']);

export function findMetadataRoots(dirs) {
  const roots = new Set();
  const scan = (d, depth) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    const sub = entries.filter((e) => e.isDirectory());
    if (sub.some((e) => MARKERS.has(e.name))) { roots.add(path.resolve(d)); return; }
    if (depth <= 0) return;
    for (const e of sub) if (!e.name.startsWith('.') && e.name !== 'node_modules') scan(path.join(d, e.name), depth - 1);
  };
  for (const d of dirs) scan(d, 5);
  return [...roots].sort();
}

/** Files of a metadata folder across roots. `suffix` filters by file ending. */
export function files(roots, folder, suffix, { recursive = false } = {}) {
  const out = [];
  for (const r of roots) {
    const dir = path.join(r, folder);
    if (!fs.existsSync(dir)) continue;
    const list = recursive ? walk(dir) : fs.readdirSync(dir).sort().map((f) => path.join(dir, f)).filter((f) => fs.statSync(f).isFile());
    out.push(...list.filter((f) => !suffix || f.endsWith(suffix)));
  }
  return out;
}

/** Sub-directories of a metadata folder across roots (LWC, Aura, objects…). */
export function bundles(roots, folder) {
  const out = [];
  for (const r of roots) {
    const dir = path.join(r, folder);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory()) out.push({ name: e.name, dir: path.join(dir, e.name) });
    }
  }
  return out;
}

export const baseName = (file, suffix) => path.basename(file).slice(0, suffix ? -suffix.length : undefined);
// Files are read several times (parsing, references, namespaces): keep their text for one extraction run.
const cache = new Map();
export const safeRead = (f) => {
  if (cache.has(f)) return cache.get(f);
  let s = '';
  try { s = readText(f); } catch { /* unreadable file: treated as empty */ }
  cache.set(f, s);
  return s;
};
export const clearReadCache = () => cache.clear();
export const hasFolder = (roots, folder) => roots.some((r) => fs.existsSync(path.join(r, folder)));
export const countFiles = (roots, folder, suffix) => files(roots, folder, suffix, { recursive: true }).length;
