// `tadforce update`: a few months later, bring an existing document up to date. The previous facts are
// archived, the org is read again, and only the sections touched by what changed are handed back to the agent.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readJson, readText, readYaml, writeJson } from '../util/fsx.js';
import { AREAS, fingerprints } from '../facts/fingerprints.js';
import { loadWorkspace, sourceDirs } from '../util/config.js';
import { TEMPLATES } from '../util/paths.js';
import { log, c } from '../util/log.js';
import { templateLang } from '../util/i18n.js';
import * as org from './org.js';
import * as docs from './docs.js';

/** Component name from a metadata path: classes/Foo.cls → Foo, lwc/bar/bar.js → bar, objects/X/fields/Y… → X.Y. */
function component(rel) {
  const [folder, ...rest] = rel.split('/');
  const strip = (s) => s.replace(/(-meta)?\.xml$/, '').replace(/\.[^.]+$/, '');
  if (folder === 'objects' && rest.length > 2) return `${rest[0]}.${strip(rest[2])}`;
  if (rest.length > 1) return rest[0];
  return strip(rest[0] || folder);
}

export function diffFingerprints(before, after) {
  const changes = { added: new Map(), removed: new Map(), changed: new Map() };
  const put = (kind, rel) => { const key = `${rel.split('/')[0]}:${component(rel)}`; if (!changes[kind].has(key)) changes[kind].set(key, { folder: rel.split('/')[0], name: component(rel) }); };
  for (const [rel, h] of Object.entries(after)) { if (!(rel in before)) put('added', rel); else if (before[rel] !== h) put('changed', rel); }
  for (const rel of Object.keys(before)) if (!(rel in after)) put('removed', rel);
  // a component with some files added and others changed counts once, as changed
  for (const k of changes.changed.keys()) { changes.added.delete(k); changes.removed.delete(k); }
  for (const k of changes.added.keys()) if (changes.removed.has(k)) { changes.changed.set(k, changes.added.get(k)); changes.added.delete(k); changes.removed.delete(k); }
  return Object.fromEntries(Object.entries(changes).map(([k, m]) => [k, [...m.values()].sort((a, b) => (a.folder + a.name).localeCompare(b.folder + b.name))]));
}

/** Counts that moved: { 'apex.classes': [132, 140] }. */
export function diffCounts(a = {}, b = {}, prefix = '') {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k], key = prefix ? `${prefix}.${k}` : k;
    if (x && typeof x === 'object' || y && typeof y === 'object') Object.assign(out, diffCounts(x || {}, y || {}, key));
    else if (x !== y) out[key] = [x ?? 0, y ?? 0];
  }
  return out;
}

/** Where each section lives: spec id → chapter file and the heading anchor above its marker. */
function sectionLocations(lang) {
  const out = {};
  for (const doc of ['tad', 'axes']) {
    const dir = path.join(TEMPLATES, doc, lang);
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      let anchor = null;
      for (const line of readText(path.join(dir, f)).split('\n')) {
        const h = /^#{1,4} .*\{[^}]*#([\w-]+)[^}]*\}\s*$/.exec(line);
        if (h) anchor = h[1];
        const m = /<!--\s*tad:pending\s+([\w.-]+)\s*-->/.exec(line);
        if (m) out[m[1]] = { doc, file: `src/${doc}/${f}`, anchor };
      }
    }
  }
  return out;
}

/** Sections whose spec reads a facts area that changed. */
export function affectedSections(areas, specs, locations) {
  const hits = [];
  for (const [id, s] of Object.entries(specs)) {
    const reasons = [];
    for (const p of s.facts || []) {
      const fp = p.replace(/^counts\./, '');
      for (const [area, why] of Object.entries(areas)) {
        if (p === 'counts' || fp === area || fp.startsWith(area + '.') || area.startsWith(fp + '.') || (p === 'modules' && area === 'modules')) reasons.push(...why);
      }
    }
    if (reasons.length) hits.push({ id, ...(locations[id] || {}), reasons: [...new Set(reasons)].slice(0, 12) });
  }
  return hits;
}

const nextVersion = (v) => { const m = /^(\d+)\.(\d+)$/.exec(String(v)); return m ? `${m[1]}.${Number(m[2]) + 1}` : `${v}.1`; };

export async function run(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const say = (fn) => { if (!args.json) fn(); };
  const before = ctx.p('facts', 'facts.json');
  if (!exists(before)) throw new Error('No previous facts: run `tadforce doctor` and `tadforce build` first.');
  say(() => log.banner('update'));

  // 1. Archive what the current document was written from.
  const stamp = new Date().toISOString().slice(0, 10);
  const archive = ctx.p('facts', 'history', stamp);
  fs.mkdirSync(archive, { recursive: true });
  const oldFacts = readJson(before);
  const oldPrints = exists(ctx.p('facts', 'fingerprints.json')) ? readJson(ctx.p('facts', 'fingerprints.json')) : fingerprints(sourceDirs(ctx));
  writeJson(path.join(archive, 'facts.json'), oldFacts);
  writeJson(path.join(archive, 'fingerprints.json'), oldPrints);
  say(() => log.ok(`Previous facts archived in ${path.relative(ctx.project, archive)}`));

  // 2. Read the org again (a fresh snapshot: deleted components must disappear too).
  const mode = ctx.cfg.source.mode || 'org';
  const quiet = async (fn) => { if (!args.json) return fn(); const o = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = o; } };
  if (mode !== 'local' && !args.skipRetrieve) {
    const snap = ctx.p(ctx.cfg.source.dir);
    if (exists(snap)) fs.rmSync(snap, { recursive: true, force: true });
    for (const fn of [org.manifest, org.retrieve]) { const code = await quiet(() => fn({ ...args, cwd: ctx.project })); if (code) return code; }
  }
  await quiet(() => docs.facts({ ...args, cwd: ctx.project, org: mode === 'local' || args.skipRetrieve ? false : ctx.cfg.org.alias }));
  const ctx2 = loadWorkspace(ctx.project);
  const newPrints = fingerprints(sourceDirs(ctx2));
  writeJson(ctx2.p('facts', 'fingerprints.json'), newPrints);
  const newFacts = readJson(ctx2.p('facts', 'facts.json'));

  // 3. What changed, and which sections it touches.
  const diff = diffFingerprints(oldPrints, newPrints);
  const counts = diffCounts(oldFacts.counts, newFacts.counts);
  const areas = {};
  const note = (area, why) => { (areas[area] ||= []).push(why); };
  for (const [kind, list] of Object.entries(diff)) for (const x of list) note(AREAS[x.folder], `${kind} ${x.folder}:${x.name}`);
  const COUNT_AREAS = { objects: 'data', fields: 'data', recordTypes: 'data', validationRules: 'data', cmdt: 'data.cmdtTypes', flows: 'automation.flows', omni: 'automation.omnistudio' };
  for (const [k, [a, b]] of Object.entries(counts)) { const top = k.split('.')[0]; if (top !== 'exclusions') note(COUNT_AREAS[top] || top, `count ${k}: ${a} → ${b}`); }
  const modulesBefore = (oldFacts.modules?.clouds || []).map((x) => x.name), modulesAfter = (newFacts.modules?.clouds || []).map((x) => x.name);
  for (const m of modulesAfter.filter((x) => !modulesBefore.includes(x))) note('modules', `new product detected: ${m}`);
  for (const m of modulesBefore.filter((x) => !modulesAfter.includes(x))) note('modules', `product no longer detected: ${m}`);
  const specs = readYaml(path.join(TEMPLATES, 'specs', 'sections.yml'), {}).sections || {};
  const sections = affectedSections(areas, specs, sectionLocations(templateLang(ctx2.cfg.language)));

  // 4. New version in the document control.
  const cfg = ctx2.cfg;
  const total = diff.added.length + diff.changed.length + diff.removed.length;
  const from = cfg.document.version;
  if (total && args.bump !== false) {
    const by = [cfg.document.author, cfg.integrator.name].filter(Boolean).join(' — ') || cfg.client.name;
    const history = cfg.document.history && cfg.document.history.length ? cfg.document.history : [{ version: from, date: cfg.document.date, author: by, purpose: cfg.language === 'fr' ? 'Version initiale' : 'Initial version' }];
    cfg.document.version = nextVersion(from);
    cfg.document.date = stamp;
    const purpose = cfg.language === 'fr'
      ? `Mise à jour : ${diff.added.length} composant(s) ajouté(s), ${diff.changed.length} modifié(s), ${diff.removed.length} supprimé(s)`
      : `Update: ${diff.added.length} component(s) added, ${diff.changed.length} changed, ${diff.removed.length} removed`;
    cfg.document.history = [...history, { version: cfg.document.version, date: stamp, author: by, purpose }];
    ctx2.save(cfg);
  }
  const report = { from, to: cfg.document.version, changes: diff, counts, sections, next: sections.length ? 'rewrite each listed section from the new facts (keep its heading and anchor), then `tadforce build`' : 'tadforce build' };
  writeJson(ctx2.p('facts', 'update.json'), report);
  if (args.json) { console.log(JSON.stringify(report, null, 2)); return 0; }

  if (!total && !Object.keys(counts).length) { log.ok('Nothing changed since the last version. The document is up to date.'); return 0; }
  log.ok(`${diff.added.length} added · ${diff.changed.length} changed · ${diff.removed.length} removed · ${Object.keys(counts).length} count(s) moved`);
  for (const [kind, list] of Object.entries(diff)) if (list.length) console.log(`  ${c.bold(kind)}: ${list.slice(0, 15).map((x) => `${x.folder}/${x.name}`).join(', ')}${list.length > 15 ? c.dim(` … +${list.length - 15}`) : ''}`);
  if (total) log.ok(`Version ${from} → ${cfg.document.version} (history updated)`);
  log.step(`${sections.length} section(s) to review:`);
  for (const s of sections) console.log(`  ${c.cyan(s.id.padEnd(28))} ${c.dim((s.file || '') + (s.anchor ? '#' + s.anchor : ''))}  ${s.reasons.slice(0, 2).join('; ')}`);
  log.human('let your agent rewrite these sections (/tadforce-update), then `tadforce build`. Numbers and generated tables update by themselves.');
  return 0;
}
