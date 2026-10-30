import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractFacts } from '../src/facts/index.js';
import { fingerprints } from '../src/facts/fingerprints.js';
import { diffFingerprints, diffCounts, affectedSections } from '../src/commands/update.js';
import { paletteFrom, contrast, orgThemeColors, findLogoCandidates } from '../src/build/brand.js';
import { serveDocument } from '../src/build/serve.js';
import { buildDocument, outputName } from '../src/build/render.js';
import { loadWorkspace } from '../src/util/config.js';
import { writeJson, readJson } from '../src/util/fsx.js';
import { makeWorkspace, FIXTURE } from './helpers.js';

const SRC = path.join(FIXTURE, 'force-app');

test('scope keeps the project components, standard objects and org-wide components', () => {
  const all = extractFacts([SRC], {}, { base: FIXTURE });
  const scoped = extractFacts([SRC], { scope: { include: ['Customer*'] } }, { base: FIXTURE });
  assert.ok(scoped.apex.classes.length < all.apex.classes.length);
  assert.ok(scoped.apex.classes.every((c) => /^Customer/i.test(c.name)));
  assert.ok(scoped.apex.classes.some((c) => c.test), 'tests of in-scope classes stay');
  const std = (f) => f.data.objects.filter((o) => !o.name.includes('__')).length;
  assert.equal(std(scoped), std(all), 'standard objects are never scoped out');
  assert.equal(scoped.security.profiles.length, all.security.profiles.length, 'profiles are org-wide');
  assert.deepEqual(scoped.scope.include, ['Customer*']);
  assert.equal(all.scope, undefined, 'no scope key without a scope (golden file unchanged)');
});

test('update: fingerprints diff names added, changed and removed components', () => {
  const before = fingerprints([SRC]);
  assert.ok(Object.keys(before).some((k) => k.startsWith('classes/')));
  const after = { ...before };
  const cls = Object.keys(before).find((k) => /^classes\/.*\.cls$/.test(k));
  after[cls] = 'changed';
  after['classes/NewService.cls'] = 'x';
  const lwc = Object.keys(before).filter((k) => k.startsWith('lwc/'));
  const gone = lwc[0].split('/')[1];
  for (const k of lwc.filter((x) => x.split('/')[1] === gone)) delete after[k];
  const d = diffFingerprints(before, after);
  assert.deepEqual(d.changed.map((x) => x.name), [path.basename(cls, '.cls')]);
  assert.deepEqual(d.added.map((x) => x.name), ['NewService']);
  assert.deepEqual(d.removed.map((x) => `${x.folder}/${x.name}`), [`lwc/${gone}`]);
  assert.deepEqual(diffCounts({ apex: { classes: 3, tests: 1 } }, { apex: { classes: 4, tests: 1 } }), { 'apex.classes': [3, 4] });
});

test('update: sections are found from the facts they read', () => {
  const specs = { 'application.layers': { facts: ['apex.classes'] }, 'ui.apps': { facts: ['ui.apps'] }, 'summary.kpis': { facts: ['counts'] } };
  const only = affectedSections({ apex: ['changed classes:Foo'] }, specs, {});
  assert.deepEqual(only.map((h) => h.id), ['application.layers'], 'a component change does not touch the KPI tiles');
  const hits = affectedSections({ apex: ['changed classes:Foo', 'count apex.classes: 3 → 4'] }, specs, {});
  assert.deepEqual(hits.map((h) => [h.id, h.relevance]), [['application.layers', 'components'], ['summary.kpis', 'counts']]);
  const noFacts = affectedSections({ apex: ['changed classes:Foo'] }, { 'application.domains': { intent: 'x' } }, {});
  assert.deepEqual(noFacts.map((h) => h.id), ['application.domains'], 'a spec without facts is matched by its chapter');
});

test('brand palette is readable on white (WCAG)', () => {
  for (const c of ['#FFD200', '#00A1E0', '#E30613', '#2E7D32']) {
    const p = paletteFrom(c);
    assert.ok(contrast(p.primary, '#FFFFFF') >= 7, `${c} primary`);
    assert.ok(contrast(p.tableHeader, '#FFFFFF') >= 4.5, `${c} table header`);
    assert.ok(contrast(p.accent, '#FFFFFF') >= 3, `${c} accent`);
    assert.equal(p.gradient[0], c);
  }
});

test('brand evidence: org theme colours and logo files are found in the metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-brand-'));
  try {
    fs.mkdirSync(path.join(dir, 'brandingSets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'brandingSets', 'Corp.brandingSet-meta.xml'), '<BrandingSet><brandingSetProperty><propertyName>BRAND_COLOR</propertyName><propertyValue>#00a1e0</propertyValue></brandingSetProperty><brandingSetProperty><propertyName>PAGE_BACKGROUND</propertyName><propertyValue>#ffffff</propertyValue></brandingSetProperty></BrandingSet>');
    fs.mkdirSync(path.join(dir, 'staticresources'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'staticresources', 'CompanyLogo.resource'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    fs.writeFileSync(path.join(dir, 'staticresources', 'CompanyLogo.resource-meta.xml'), '<StaticResource><contentType>image/svg+xml</contentType></StaticResource>');
    assert.deepEqual(orgThemeColors([dir]).map((x) => x.value), ['#00A1E0']);
    const logos = findLogoCandidates([dir]);
    assert.equal(logos.length, 1);
    assert.equal(logos[0].ext, '.svg');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Save through the local server writes the same file, nothing else', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-serve-'));
  const file = path.join(dir, 'TAD_X.html');
  fs.writeFileSync(file, '<!doctype html><p>v1</p>');
  const s = await serveDocument(file);
  try {
    assert.match(await (await fetch(s.url)).text(), /v1/);
    const r = await fetch(s.url, { method: 'PUT', body: '<!doctype html><p>v2</p>' });
    assert.equal(r.status, 200);
    assert.equal(fs.readFileSync(file, 'utf8'), '<!doctype html><p>v2</p>');
    assert.deepEqual(fs.readdirSync(dir), ['TAD_X.html']);
    assert.equal((await fetch(s.url.replace(/\/[0-9a-f]{24}\//, '/000000000000000000000000/'), { method: 'PUT', body: '<!doctype html>' })).status, 404, 'the token is required');
    assert.equal((await fetch(s.url, { method: 'PUT', body: 'not html' })).status, 400);
  } finally { await s.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the HTML keeps one name across versions; archives carry the version', () => {
  const cfg = { client: { short: 'NWB' }, document: { version: '1.2' } };
  assert.equal(outputName(cfg, 'tad'), 'TAD_NWB');
  assert.equal(outputName(cfg, 'tad', { versioned: true }), 'TAD_NWB_v1.2');
});

test('without integrator nor author, the document only names the client', async () => {
  const w = makeWorkspace();
  try {
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.integrator = { name: null, logo: null }; cfg.document.author = null; writeJson(p, cfg);
    const r = await buildDocument(loadWorkspace(w.project), 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.doesNotMatch(html, /Acme Integrators|>null</);
    assert.doesNotMatch(html, /Prepared by<\/b>/);
    assert.match(html, /Document prepared for Northwind Bank/);

    cfg.document.author = 'Jane Architect'; writeJson(p, cfg);
    const html2 = fs.readFileSync((await buildDocument(loadWorkspace(w.project), 'tad', { render: false })).html, 'utf8');
    assert.match(html2, /Prepared by<\/b><span>Jane Architect<\/span>/);
  } finally { w.cleanup(); }
});

test('the Improvement Axes carry the integrator brand only', async () => {
  const w = makeWorkspace();
  try {
    const html = fs.readFileSync((await buildDocument(w.ctx, 'axes', { render: false })).html, 'utf8');
    const logos = /<div class="cover-logos">([\s\S]*?)<\/div>/.exec(html)[1];
    assert.equal((logos.match(/<img /g) || []).length, 1);
    assert.match(logos, /alt="Acme Integrators"/);
    assert.doesNotMatch(/<footer class="doc-foot">([\s\S]*?)<\/footer>/.exec(html)[1], /Northwind Bank/);
    const tad = fs.readFileSync((await buildDocument(w.ctx, 'tad', { render: false })).html, 'utf8');
    assert.equal((/<div class="cover-logos">([\s\S]*?)<\/div>/.exec(tad)[1].match(/<img /g) || []).length, 2, 'the client TAD keeps both logos');
  } finally { w.cleanup(); }
});

test('any other language: English skeletons, labels translated in the workspace', async () => {
  const w = makeWorkspace();
  try {
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.language = 'DE'; writeJson(p, cfg);
    const { scaffold } = await import('../src/commands/docs.js');
    const { setQuiet } = await import('../src/util/log.js');
    setQuiet(true);
    try { await scaffold({ cwd: w.project }); } finally { setQuiet(false); }
    const own = path.join(w.ws, 'i18n', 'de.json');
    const labels = readJson(own);
    assert.ok(labels._translate, 'the agent is told to translate');
    assert.equal(labels.meta.htmlLang, 'de');
    labels.doc.kicker = 'Technisches Architekturdokument'; delete labels._translate; writeJson(own, labels);
    const html = fs.readFileSync((await buildDocument(loadWorkspace(w.project), 'tad', { render: false })).html, 'utf8');
    assert.match(html, /<html lang="de">/);
    assert.match(html, /Technisches Architekturdokument/);
    const { formatNumber, normalizeLang } = await import('../src/util/i18n.js');
    assert.equal(formatNumber(12345, 'de'), '12.345');
    assert.equal(normalizeLang('pt_br'), 'pt-BR');
    assert.equal(normalizeLang('nonsense'), 'en');
  } finally { w.cleanup(); }
});

test('comments saved in the HTML survive a rebuild of the same file', async () => {
  const w = makeWorkspace();
  try {
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const saved = fs.readFileSync(r.html, 'utf8').replace('<script type="application/json" id="tad-comments">[]</script>', '<script type="application/json" id="tad-comments">[{"id":"c1","section":"1","comment":"keep me","status":"open"}]</script>');
    fs.writeFileSync(r.html, saved);
    const r2 = await buildDocument(w.ctx, 'tad', { render: false });
    assert.equal(r2.html, r.html);
    assert.match(fs.readFileSync(r2.html, 'utf8'), /keep me/);
    assert.equal(r2.backup, null, 'no copy: the comments are carried over in place');
  } finally { w.cleanup(); }
});

test('doctor never starts an agent from inside an agent session', async () => {
  const { insideAgent, AGENTS } = await import('../src/util/agents.js');
  const saved = process.env.TADFORCE_NO_LAUNCH;
  process.env.TADFORCE_NO_LAUNCH = '1';
  try { assert.equal(insideAgent(), true); } finally { if (saved === undefined) delete process.env.TADFORCE_NO_LAUNCH; else process.env.TADFORCE_NO_LAUNCH = saved; }
  assert.deepEqual(AGENTS.find((a) => a.id === 'claude').args, ['/tadforce']);
});

test('facts never produce an empty inventory from a wrong --source', async () => {
  const w = makeWorkspace();
  try {
    const { facts } = await import('../src/commands/docs.js');
    await assert.rejects(() => facts({ cwd: w.project, source: 'local', quiet: true }), /no such folder/);
  } finally { w.cleanup(); }
});

test('validation: « Método » and Spanish « todo » are text, TODO is a placeholder', async () => {
  const w = makeWorkspace();
  try {
    const f = path.join(w.ws, 'src', 'tad', '02-purpose.md');
    fs.appendFileSync(f, '\n\nEl Método aplica a todo el sistema.\n');
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const { validateDocument } = await import('../src/validate/index.js');
    assert.equal(validateDocument(w.ctx, 'tad', { buildReport: r }).errors.filter((e) => e.code === 'todo').length, 0);
    fs.appendFileSync(f, '\nTODO: describe the batch.\n');
    assert.equal(validateDocument(w.ctx, 'tad', { buildReport: r }).errors.filter((e) => e.code === 'todo').length, 1);
  } finally { w.cleanup(); }
});

test('no integrator: chapter 2 names the client only, no placeholder leaks; local sources are said so', async () => {
  const w = makeWorkspace();
  try {
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.integrator = { name: null, logo: null }; cfg.source.mode = 'local'; writeJson(p, cfg);
    const r = await buildDocument(loadWorkspace(w.project), 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.doesNotMatch(html, /⟨cfg:/);
    assert.match(html, /Salesforce DX project of Northwind Bank/);
    assert.doesNotMatch(html, /retrieved in read-only mode/);
    assert.equal(r.problems.filter((x) => x.code === 'unknown-placeholder').length, 0);
  } finally { w.cleanup(); }
});

test('a comment reopened by a reader stays open at the next build', async () => {
  const w = makeWorkspace();
  try {
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.review.tad.resolutions = { c1: 'Fixed in § 7.2.' }; writeJson(p, cfg);
    const r = await buildDocument(loadWorkspace(w.project), 'tad', { render: false });
    const reopened = fs.readFileSync(r.html, 'utf8').replace('<script type="application/json" id="tad-comments">[]</script>', '<script type="application/json" id="tad-comments">[{"id":"c1","section":"7","comment":"Still wrong","status":"open","response":"Fixed in § 7.2."}]</script>');
    fs.writeFileSync(r.html, reopened);
    const r2 = await buildDocument(loadWorkspace(w.project), 'tad', { render: false });
    const { readComments } = await import('../src/build/render.js');
    assert.equal(readComments(fs.readFileSync(r2.html, 'utf8'))[0].status, 'open');
    assert.ok(r2.problems.some((x) => x.code === 'comment-reopened'));
  } finally { w.cleanup(); }
});

test('Salesforce-shipped components are set aside; CSP trusted sites follow the scope', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-shipped-'));
  try {
    fs.cpSync(SRC, dir, { recursive: true });
    const apps = path.join(dir, 'main', 'default', 'applications');
    fs.copyFileSync(path.join(apps, fs.readdirSync(apps)[0]), path.join(apps, 'standard__TadFixtureShipped.app-meta.xml'));
    const f = extractFacts([dir], {}, {});
    assert.ok(!f.ui.apps.some((a) => a.name.startsWith('standard__')));
    assert.equal(f.salesforceShipped['ui.apps'], 1);
    const all = extractFacts([SRC], {}, {});
    const scoped = extractFacts([SRC], { scope: { include: ['Loan*'] } }, {});
    assert.ok(all.integration.cspTrustedSites.length > 0);
    assert.equal(scoped.integration.cspTrustedSites.length, 0);
    assert.equal(all.modules.shield, false, 'a settings file alone is not evidence of Shield');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('update: one archive per version, never overwritten; no change, no bump', async () => {
  const w = makeWorkspace();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-upd-'));
  const out = [];
  const orig = console.log;
  try {
    fs.cpSync(SRC, dir, { recursive: true });
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.source.dir = dir; writeJson(p, cfg);
    const docs = await import('../src/commands/docs.js');
    const { run } = await import('../src/commands/update.js');
    const { setQuiet } = await import('../src/util/log.js');
    setQuiet(true);
    await docs.facts({ cwd: w.project });
    const update = async () => { out.length = 0; console.log = (s) => out.push(s); try { await run({ cwd: w.project, json: true, skipRetrieve: true }); } finally { console.log = orig; } return JSON.parse(out.join('')); };
    const cls = fs.readdirSync(path.join(dir, 'main', 'default', 'classes')).find((x) => x.endsWith('.cls') && !/Test/.test(x));
    fs.appendFileSync(path.join(dir, 'main', 'default', 'classes', cls), '\n// changed\n');
    const r1 = await update();
    assert.equal(r1.to, '1.1');
    const v10 = path.join(w.ws, 'facts', 'history', 'v1.0', 'facts.json');
    const before = fs.readFileSync(v10, 'utf8');
    const r2 = await update();
    assert.equal(r2.upToDate, true);
    assert.equal(r2.to, '1.1', 'no change, no bump');
    fs.appendFileSync(path.join(dir, 'main', 'default', 'classes', cls), '\n// again\n');
    const r3 = await update();
    assert.equal(r3.to, '1.2');
    assert.equal(fs.readFileSync(v10, 'utf8'), before, 'the 1.0 archive is never overwritten');
    assert.ok(fs.existsSync(path.join(w.ws, 'facts', 'history', 'v1.1', 'facts.json')));
    setQuiet(false);
  } finally { console.log = orig; w.cleanup(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('dates follow the document language', async () => {
  const { formatDate } = await import('../src/util/i18n.js');
  assert.equal(formatDate('2026-10-30', 'fr'), '30 octobre 2026');
  assert.equal(formatDate('2026-10-30', 'en'), '30 October 2026');
  assert.equal(formatDate('Q3 2026', 'en'), 'Q3 2026');
});

test('next and spec answer: recommended order, specifications passed to the writer', async () => {
  const w = makeWorkspace();
  const out = [];
  const orig = console.log;
  try {
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.inputs.specs = ['knowledge/inputs/specs/SFD.md']; writeJson(p, cfg);
    const { next, specWithFacts } = await import('../src/commands/spec.js');
    console.log = (s) => out.push(s);
    try { await next({ cwd: w.project, json: true }); } finally { console.log = orig; }
    const r = JSON.parse(out.join(''));
    assert.ok(r.remaining > 0);
    assert.match(r.next.file, /06-data\.md$/, 'data first, summary last');
    const s = specWithFacts(loadWorkspace(w.project), 'functional.processes');
    assert.deepEqual(s.specifications.read, ['tadforce/knowledge/inputs/specs/SFD.md']);
    assert.equal(specWithFacts(loadWorkspace(w.project), 'data.cmdt').specifications, undefined);
  } finally { console.log = orig; w.cleanup(); }
});
