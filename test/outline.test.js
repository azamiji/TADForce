import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateWhen, parseWhen } from '../src/facts/when.js';
import { loadSectionSpecs, activeSections, requiredAnchors, filterSkeleton, syncSkeleton } from '../src/facts/outline.js';
import { buildDocument } from '../src/build/render.js';
import { writeJson, readJson } from '../src/util/fsx.js';
import { TEMPLATES } from '../src/util/paths.js';
import { makeWorkspace } from './helpers.js';

const facts = { counts: { omni: { scripts: 0, ips: 2 }, apex: { classes: 3 } }, modules: { experienceCloud: false, events: true }, apex: { triggers: [{ name: 'T' }] }, systems: { named: [] }, label: 'x' };

test('when: comparisons, logic, paths through counts, arrays as their length', () => {
  assert.equal(evaluateWhen('omni.scripts > 0 || omni.ips > 0', facts), true);
  assert.equal(evaluateWhen('omni.scripts > 0 && omni.ips > 0', facts), false);
  assert.equal(evaluateWhen('!modules.experienceCloud && modules.events', facts), true);
  assert.equal(evaluateWhen('(omni.scripts >= 1 || apex.classes == 3) && !(omni.ips < 2)', facts), true);
  assert.equal(evaluateWhen('apex.triggers > 0', facts), true, 'an array compares by its length');
  assert.equal(evaluateWhen('systems.named', facts), false, 'an empty array is false');
  assert.equal(evaluateWhen('nothing.here', facts), false, 'unknown paths are false');
  assert.equal(evaluateWhen('nothing.here == 0', facts), true, 'and 0 in comparisons');
  assert.equal(evaluateWhen("label == 'x' && label != \"y\"", facts), true);
  assert.equal(evaluateWhen('modules.events == true', facts), true);
  assert.equal(evaluateWhen('', facts), true);
  assert.equal(evaluateWhen(undefined, facts), true);
  for (const bad of ['a >', '(a', 'a b', 'a && || b', 'a; process.exit()', 'a = 1']) assert.throws(() => parseWhen(bad), /when:/, bad);
});

test('every when of sections.yml parses, and the fixture keeps its OmniStudio section, not its absent products', () => {
  const specs = loadSectionSpecs();
  for (const [id, s] of Object.entries(specs.sections)) if (s.when) assert.doesNotThrow(() => parseWhen(s.when), id);
  const w = makeWorkspace();
  try {
    assert.deepEqual(w.facts.outline, activeSections(w.facts, specs));
    assert.ok(w.facts.outline.includes('application.omnistudio'));
    for (const id of ['application.ai', 'ui.aura', 'ui.omnichannel', 'integration.commerce', 'security.shield']) assert.ok(!w.facts.outline.includes(id), id);
    const anchors = requiredAnchors('tad', w.facts, specs);
    assert.ok(anchors.includes('annex-lwc') && anchors.includes('annex-apex') && anchors.every((a) => typeof a === 'string'));
    assert.ok(!requiredAnchors('tad', { ...w.facts, counts: { ...w.facts.counts, ui: { ...w.facts.counts.ui, lwc: 0 } }, ui: { ...w.facts.ui, lwc: [] } }, specs).includes('annex-lwc'));
  } finally { w.cleanup(); }
});

const SKELETON = [
  '# Chapter {#ch}', '', '## Kept {#kept}', '', '<!-- tad:pending a.kept -->', '',
  '<!-- tad:if modules.x -->', '## Optional {#opt}', '', '@@ANNEX:opt@@', '', '<!-- tad:pending a.opt -->', '<!-- tad:endif -->', '',
  '## Parent {#parent}', '', '<!-- tad:pending a.parent -->', '', '### Child {#child}', '', '<!-- tad:pending a.child -->', '',
  '## Shared {#shared}', '', '<!-- tad:pending a.one -->', '', '<!-- tad:pending a.two -->', '',
  '## Last {#last}', '', '<!-- tad:pending a.last -->', '',
].join('\n');

test('skeleton: an inactive section leaves whole (heading, tables, empty conditional), a shared heading stays', () => {
  const off = new Set(['a.opt', 'a.parent', 'a.child', 'a.two']);
  const r = filterSkeleton(SKELETON, (id) => !off.has(id));
  assert.doesNotMatch(r.text, /#opt|ANNEX:opt|tad:if modules\.x|#parent|#child/);
  assert.match(r.text, /## Shared \{#shared\}\n\n<!-- tad:pending a\.one -->\n\n## Last/);
  assert.deepEqual(r.kept, []);
  // a parent stays while a child section is active
  const r2 = filterSkeleton(SKELETON, (id) => id !== 'a.parent');
  assert.match(r2.text, /## Parent \{#parent\}\n\n### Child/);
  assert.doesNotMatch(r2.text, /a\.parent/);
});

test('skeleton sync: what became active is added in place, pending inactive removed, written text never deleted', () => {
  const start = filterSkeleton(SKELETON, (id) => id !== 'a.opt').text;
  assert.doesNotMatch(start, /#opt/);
  const added = syncSkeleton(SKELETON, start, () => true);
  assert.deepEqual(added.added, ['a.opt']);
  assert.ok(added.text.indexOf('#opt') > added.text.indexOf('a.kept') && added.text.indexOf('#opt') < added.text.indexOf('#parent'), 'at its place in the template');
  // « Last » is written; then its subject disappears: kept and reported, never removed
  const written = added.text.replace('<!-- tad:pending a.last -->', 'The last section, written by the agent.');
  const gone = syncSkeleton(SKELETON, written, (id) => id !== 'a.last' && id !== 'a.opt');
  assert.match(gone.text, /The last section, written by the agent\./);
  assert.deepEqual(gone.kept, ['a.last']);
  assert.deepEqual(gone.removed, ['a.opt']);
  assert.doesNotMatch(gone.text, /#opt/);
  // nothing changed: nothing to do
  const same = syncSkeleton(SKELETON, added.text, () => true);
  assert.deepEqual([same.added, same.removed], [[], []]);
});

test('scaffold writes only the active outline; next and status skip inactive sections; the result builds', async () => {
  const w = makeWorkspace();
  try {
    fs.rmSync(path.join(w.ws, 'src'), { recursive: true, force: true });
    // an org without OmniStudio: the section and its appendix go
    const f = readJson(path.join(w.ws, 'facts', 'facts.json'));
    for (const k of Object.keys(f.automation.omnistudio)) f.automation.omnistudio[k] = [];
    for (const k of Object.keys(f.counts.omni)) f.counts.omni[k] = 0;
    for (const k of ['omniScripts', 'integrationProcedures', 'dataMappers']) f.annexes[k] = { count: 0, annex: false, mode: 'none', directive: k };
    f.modules.omnistudio = false;
    writeJson(path.join(w.ws, 'facts', 'facts.json'), f);
    const docs = await import('../src/commands/docs.js');
    const { setQuiet } = await import('../src/util/log.js');
    setQuiet(true);
    try { await docs.scaffold({ cwd: w.project }); } finally { setQuiet(false); }
    const app = fs.readFileSync(path.join(w.ws, 'src', 'tad', '07-application.md'), 'utf8');
    assert.doesNotMatch(app, /app-omnistudio|application\.omnistudio/);
    assert.match(app, /app-flows/);
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.doesNotMatch(html, /id="annex-omnistudio"/);
    assert.equal(r.problems.filter((p) => p.level === 'error').length, 0, JSON.stringify(r.problems));
    // the facts change: OmniStudio appears; the section comes back, at its place
    const g = readJson(path.join(w.ws, 'facts', 'facts.json'));
    g.counts.omni.scripts = 1;
    writeJson(path.join(w.ws, 'facts', 'facts.json'), g);
    const s = docs.syncOutline(w.ctx);
    assert.deepEqual(s.added.map((x) => x.id), ['application.omnistudio']);
    const app2 = fs.readFileSync(path.join(w.ws, 'src', 'tad', '07-application.md'), 'utf8');
    assert.ok(app2.indexOf('#app-omnistudio') > app2.indexOf('#app-flows'));
    // a section whose when is false is never handed to the writer
    const h = readJson(path.join(w.ws, 'facts', 'facts.json'));
    h.counts.omni.scripts = 0;
    writeJson(path.join(w.ws, 'facts', 'facts.json'), h);
    fs.writeFileSync(path.join(w.ws, 'src', 'tad', '07-application.md'), app2); // pending marker still there
    const { next } = await import('../src/commands/spec.js');
    const out = [];
    const orig = console.log;
    console.log = (x) => out.push(x);
    try { await next({ cwd: w.project, json: true, doc: 'tad' }); } finally { console.log = orig; }
    const before = JSON.parse(out.join('')).remaining;
    assert.ok(!JSON.stringify(out).includes('application.omnistudio'));
    h.counts.omni.scripts = 1;
    writeJson(path.join(w.ws, 'facts', 'facts.json'), h);
    out.length = 0;
    console.log = (x) => out.push(x);
    try { await next({ cwd: w.project, json: true, doc: 'tad' }); } finally { console.log = orig; }
    assert.equal(JSON.parse(out.join('')).remaining, before + 1);
  } finally { w.cleanup(); }
});

test('appendices: one structure in every language; large families go to the workbook', async () => {
  const strip = (lang) => fs.readFileSync(path.join(TEMPLATES, 'tad', lang, '99-appendices.md'), 'utf8').split('\n').filter((l) => /^<!-- tad:|^@@/.test(l));
  assert.deepEqual(strip('en'), strip('fr'));
  const w = makeWorkspace();
  try {
    const f = readJson(path.join(w.ws, 'facts', 'facts.json'));
    f.annexes.lwc = { count: 250, annex: false, mode: 'workbook', directive: 'lwc' };
    writeJson(path.join(w.ws, 'facts', 'facts.json'), f);
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.match(html, /id="annex-lwc"/, 'the anchor stays for references');
    assert.match(html, /250 items\) is in the inventory workbook/);
  } finally { w.cleanup(); }
});
