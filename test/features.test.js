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
  const hits = affectedSections({ apex: ['changed classes:Foo'] }, specs, {});
  assert.deepEqual(hits.map((h) => h.id).sort(), ['application.layers', 'summary.kpis']);
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
