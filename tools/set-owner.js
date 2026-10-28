#!/usr/bin/env node
// Replace the OWNER placeholder (GitHub user or organisation) in the files that link to the repository.
// Usage: npm run set-owner -- <github-user>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const owner = process.argv[2];
if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) {
  console.error('Usage: npm run set-owner -- <github-user>');
  process.exit(1);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['README.md', 'README.fr.md', 'package.json', 'CITATION.cff', '.claude-plugin/plugin.json', 'docs/index.html'];
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(/\bOWNER\b/g, owner);
  if (after !== before) { fs.writeFileSync(p, after); console.log(`updated ${f}`); }
}
