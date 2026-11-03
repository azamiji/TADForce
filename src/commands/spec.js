// `tadforce spec <id>` and `tadforce next`: what to write, with the facts to write it from.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { exists, readText, readYaml, walk, toPosix } from '../util/fsx.js';
import { loadWorkspace, sourceFlags } from '../util/config.js';
import { TEMPLATES } from '../util/paths.js';
import { loadFacts } from '../facts/index.js';
import { sectionFilter } from '../facts/outline.js';
import { resolveConditionals, get } from '../build/directives.js';
import { DOCS } from '../build/render.js';
import { log } from '../util/log.js';

const specs = () => readYaml(path.join(TEMPLATES, 'specs', 'sections.yml'), {}).sections || {};

/** Compact view of a facts path: arrays are summarised (count + first items), long strings cut. */
function excerpt(value, depth = 0) {
  if (Array.isArray(value)) {
    const items = value.slice(0, depth ? 8 : 25).map((v) => excerpt(v, depth + 1));
    return value.length > items.length ? { count: value.length, first: items } : items;
  }
  if (value && typeof value === 'object') {
    if (depth > 2) return '{…}';
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, excerpt(v, depth + 1)]));
  }
  if (typeof value === 'string' && value.length > 200) return value.slice(0, 199) + '…';
  return value;
}

export function specWithFacts(ctx, id) {
  const s = specs()[id];
  if (!s) return null;
  const facts = loadFacts(ctx.ws) || {};
  const out = { id, ...s, factsExcerpt: {} };
  for (const p of s.facts || []) {
    if (p.startsWith('knowledge/')) {
      // every file, sub-folders included (knowledge/inputs/specs/SFD.pdf), README excepted
      const dir = ctx.p(p);
      out.factsExcerpt[p] = exists(dir) ? walk(dir).map((x) => toPosix(path.relative(dir, x))).filter((x) => x !== 'README.md') : [];
      continue;
    }
    const v = get(facts, p) ?? get(facts.counts || {}, p);
    if (v !== undefined) out.factsExcerpt[p] = excerpt(v);
  }
  // Functional specifications given by the project: evidence P2/P3 for the chapters that explain the why.
  const projectSpecs = (ctx.cfg.inputs && ctx.cfg.inputs.specs) || [];
  if (projectSpecs.length && /^(summary|purpose|context|functional|general)\./.test(id)) {
    out.specifications = { read: projectSpecs.map((p) => toPosix(path.join('tadforce', p))), how: 'Read them before writing: they explain the purpose, the processes and the vocabulary. Cite them (« according to the specifications (DR-nn) ») — the metadata still decides what is actually built.' };
  }
  if (s.modules) {
    const refs = s.modules.includes('all detected') ? (facts.modules && facts.modules.references) || [] : s.modules.filter((m) => (facts.modules && facts.modules.references || []).includes(m) || s.modules.length === 1);
    out.readModules = refs.map((r) => `skills/tadforce/references/modules/${r}.md`);
  }
  return out;
}

export async function spec(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const id = args._[1];
  if (!id) { console.log(Object.keys(specs()).join('\n')); return 0; }
  const s = specWithFacts(ctx, id);
  if (!s) { log.fail(`Unknown section "${id}".`); return 1; }
  console.log(args.json ? JSON.stringify(s, null, 2) : YAML.stringify(s, { lineWidth: 120 }));
  return 0;
}

// The order that works: the facts-heavy chapters first, the summary last (it is written from all the others).
const ORDER = { tad: ['00', '06', '07', '08', '09', '10', '11', '12', '13', '05', '04', '03', '14', '15', '99', '02', '01'], axes: ['00', '03', '04', '05', '02', '99', '01'] };
export function writingOrder(doc, files) {
  const rank = (f) => { const i = (ORDER[doc] || []).indexOf(f.slice(0, 2)); return i < 0 ? 50 : i; };
  return [...files].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** First section still to write (in the recommended order), among the sections active for this org. */
export async function next(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const facts = loadFacts(ctx.ws);
  if (!facts) { log.fail('Run `tadforce facts` first.'); return 1; }
  const scope = { modules: facts.modules, counts: facts.counts, org: facts.org, cfg: ctx.cfg, facts, glossary: ctx.glossary(), source: sourceFlags(ctx.cfg) };
  const docs = !args.doc || args.doc === 'all' ? DOCS : [args.doc];
  // sections whose `when` is false describe something this org does not have: skipped
  const isActive = sectionFilter(facts);
  let remaining = 0, first = null;
  for (const doc of docs) {
    const dir = ctx.p('src', doc);
    if (!exists(dir)) continue;
    for (const f of writingOrder(doc, fs.readdirSync(dir).filter((x) => x.endsWith('.md')))) {
      const raw = readText(path.join(dir, f));
      const active = resolveConditionals(raw, scope);
      for (const m of active.matchAll(/<!--\s*tad:pending\s+([\w.-]+)\s*-->/g)) {
        if (!isActive(m[1])) continue;
        remaining++;
        if (!first) {
          const line = raw.split('\n').findIndex((l) => l.includes(m[0])) + 1;
          first = { doc, file: path.relative(ctx.project, path.join(dir, f)).split(path.sep).join('/'), line, marker: m[0] };
          first.spec = specWithFacts(ctx, m[1]) || { id: m[1] };
        }
      }
    }
  }
  const result = { remaining, next: first };
  if (args.json) { console.log(JSON.stringify(result, null, 2)); return 0; }
  if (!first) { log.ok('Every section is written. Run `tadforce build --pdf --docx`.'); return 0; }
  log.banner(`next · ${remaining} section(s) to write`);
  console.log(`${first.file}:${first.line}  ${first.marker}\n`);
  console.log(YAML.stringify(first.spec, { lineWidth: 120 }));
  return 0;
}
