import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildDocument, markDraftHtml } from '../src/build/render.js';
import { resolveValues, resolveDirectives } from '../src/build/directives.js';
import { erdModel, erdSvg, erdLayout } from '../src/build/erd.js';
import { sequenceCode, stateCode, groupSubject } from '../src/build/diagrams.js';
import { findBrowser, closeBrowser } from '../src/build/browser.js';
import { figureQA } from '../src/build/figqa.js';
import { qualityGate, validateDocument } from '../src/validate/index.js';
import { loadI18n } from '../src/util/i18n.js';
import { readJson, writeJson } from '../src/util/fsx.js';
import { loadWorkspace } from '../src/util/config.js';
import { makeWorkspace, ROOT } from './helpers.js';

const MODEL = readJson(path.join(ROOT, 'examples', 'northwind-bank', 'tadforce', 'understanding', 'model.json'));
const { dict } = loadI18n('en');

test('ERD: key fields with UK / FK, one lane per relationship (labels never share a line)', () => {
  const w = makeWorkspace();
  try {
    const m = erdModel(w.facts, ['LoanApplication__c', 'LoanDocument__c', 'Account', 'Branch__c', 'Lead', 'ContactAttempt__c', 'Opportunity'], dict);
    const loan = m.entities.find((e) => e.name === 'LoanApplication__c');
    assert.ok(loan.rows.some((r) => r.key === 'FK' && r.name === 'Customer__c' && /Account/.test(r.type)));
    assert.ok(loan.rows.some((r) => r.key === 'UK' && r.name === 'CoreBankingId__c'));
    const md = m.edges.find((e) => e.child === 'LoanDocument__c');
    assert.ok(md.md && md.required, 'master-detail is mandatory on the parent side');
    const lay = erdLayout(m);
    const labels = lay.edges.map((e) => e.label);
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `labels ${lay.edges[i].field} and ${lay.edges[j].field} overlap`);
    }
    const svg = erdSvg(m, 'x');
    assert.match(svg, /^<svg[^>]+viewBox/);
    assert.match(svg, /class="er-label"[^>]*>Customer__c</);
  } finally { w.cleanup(); }
});

test('sequences: autonumber, actors as stick figures, async and replies, alt … else by shared subject', () => {
  const p = MODEL.processes.find((x) => x.id === 'loan-status');
  const { code, warnings } = sequenceCode(p, dict);
  assert.equal(warnings.length, 0);
  assert.match(code, /^sequenceDiagram\n {2}autonumber/);
  assert.match(code, /actor P1 as Advisor/);
  assert.match(code, /P2-\)P3: publish LoanStatusChange__e/);
  assert.match(code, /-->>/);
  assert.match(code, / {2}alt status: Approved or Rejected[\s\S]* {2}else status: any other value[\s\S]* {2}end/);
  assert.equal((code.match(/^\s*alt /gm) || []).length, 1, 'one alt block with an else branch');
  // coloured boxes carry no title: Mermaid draws it too small; the legend names the colours
  assert.match(code, /box rgb\(241,232,255\)\n/);
  assert.equal(groupSubject('Score: high'), groupSubject('score : low'));
  assert.notEqual(groupSubject('high score'), groupSubject('low score'));
  const loop = sequenceCode(MODEL.processes.find((x) => x.id === 'customer-sync'), dict).code;
  assert.equal((loop.match(/^\s*loop /gm) || []).length, 1, 'consecutive steps of a group stay in one block');
  const undeclared = sequenceCode({ participants: [{ id: 'a', label: 'A', kind: 'actor' }], steps: [{ from: 'a', to: 'x', label: 'go' }] }, dict);
  assert.equal(undeclared.warnings.length, 1);
});

test('state diagrams: initial, final states, self transitions, legend classes', () => {
  const { code } = stateCode(MODEL.lifecycles[0]);
  assert.match(code, /^stateDiagram-v2/);
  assert.match(code, /\[\*\] --> S1/);
  assert.match(code, /S3 --> S3 : daily SMS reminder/);
  assert.match(code, /S4 --> \[\*\]/);
  assert.match(code, /class S4,S5 final/);
});

test('model directives: ERD-DOMAIN, SEQ, STATE with captions; unknown ids are errors; no model, a warning', async () => {
  const w = makeWorkspace();
  try {
    const ctx = { facts: w.facts, cfg: w.ctx.cfg, dict, lang: 'en', glossary: {}, doc: 'tad', model: MODEL };
    const problems = [];
    const out = resolveDirectives('@@ERD-DOMAIN:loans|Loans@@\n@@SEQ:lead-intake@@\n@@STATE:loan-status|Loan statuses@@\n@@SEQ:nope@@\n@@ERD:auto@@', ctx, problems);
    assert.match(out, /<figure class="diagram hand" data-kind="erd">[\s\S]*Figure — Loans<\/figcaption>/);
    assert.match(out, /```mermaid\nsequenceDiagram[\s\S]*Figure: Sequence — Creation of a lead/);
    assert.match(out, /Figure: Loan statuses/);
    assert.deepEqual(problems.map((p) => p.code), ['unknown-model-id']);
    const p2 = [];
    assert.equal(resolveDirectives('@@SEQ:lead-intake@@', { ...ctx, model: null }, p2).trim(), '');
    assert.equal(p2[0].code, 'no-model');
    const p3 = [];
    resolveDirectives('@@ERD:Account,Lead,Branch__c,ContactAttempt__c,LoanApplication__c,LoanDocument__c,Opportunity,ScoringRule__mdt,IntegrationSetting__mdt@@', ctx, p3);
    assert.ok(p3.some((p) => p.code === 'erd-too-many'));
    const p4 = [];
    for (const d of ['@@CONTEXT@@', '@@LAYERS@@', '@@ROLES@@', '@@LEGEND@@']) assert.ok(resolveDirectives(d, ctx, p4).length > 100, d);
    assert.equal(p4.length, 0);
  } finally { w.cleanup(); }
});

test('the example model is used by a build: generated figures are numbered with their captions', async () => {
  const w = makeWorkspace();
  try {
    fs.mkdirSync(path.join(w.ws, 'understanding'), { recursive: true });
    writeJson(path.join(w.ws, 'understanding', 'model.json'), MODEL);
    fs.writeFileSync(path.join(w.ws, 'src', 'tad', '50-extra.md'), '# Extra {#extra}\n\n@@ERD-DOMAIN:customers@@\n\n@@CONTEXT@@\n');
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.match(html, /<figure class="diagram hand" id="fig-\d+" data-kind="erd">[\s\S]*?<figcaption>Figure \d+ — Data model — Customers, branches and leads<\/figcaption><\/figure>/);
    assert.match(html, /<li><a href="#fig-\d+">Figure \d+ — Context view/);
  } finally { w.cleanup(); }
});

test('counts that were not collected read « not collected » and drop their KPI tile', async () => {
  const facts = { counts: { apex: { classes: 0 } }, coverageByCount: { 'apex.classes': 'missing' } };
  const problems = [];
  const fr = loadI18n('fr').dict;
  assert.match(resolveValues('{{n:apex.classes}} classes', { facts, cfg: {}, lang: 'fr', dict: fr }, problems), /<span class="nc">non collecté<\/span>/);
  assert.equal(problems[0].code, 'count-not-collected');
  const w = makeWorkspace();
  try {
    const f = path.join(w.ws, 'facts', 'facts.json');
    writeJson(f, { ...readJson(f), coverageByCount: { 'ui.lwc': 'missing', 'apex.classes': 'collected' } });
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.doesNotMatch(html, /<a class="kpi" href="#annex-lwc">/);
    assert.match(html, /<a class="kpi" href="#annex-apex">/);
  } finally { w.cleanup(); }
});

test('quality gate: empty sections, filler, counts typed by hand, key chapters without figure → DRAFT', async () => {
  const w = makeWorkspace();
  try {
    fs.writeFileSync(path.join(w.ws, 'src', 'tad', '50-extra.md'), [
      '# Extra {#extra}', '', '## Empty one {#empty-one}', '', '## Next {#next}', '', 'This part is to be completed.', '', 'La partie est à compléter.', '', 'The org has 13 Apex classes.', '',
    ].join('\n'));
    const r = await buildDocument(w.ctx, 'tad', { render: false });
    const g = r.gate;
    const codes = new Set(g.errors.map((e) => e.code));
    for (const c of ['pending', 'empty-section', 'filler', 'hardcoded-count', 'chapter-without-figure']) assert.ok(codes.has(c), c);
    assert.ok(g.errors.some((e) => e.code === 'empty-section' && e.where === '#empty-one'));
    assert.equal(g.errors.filter((e) => e.code === 'filler').length, 2, 'English and French filler');
    assert.equal(g.draft, true);
    const html = fs.readFileSync(r.html, 'utf8');
    assert.match(html, /<body class="draft">/);
    assert.match(html, /<div class="watermark"[^>]*>DRAFT<\/div>/);
    assert.match(html, /1\.0<span class="doc-status"> — Draft<\/span>/);
    assert.doesNotMatch(html, /For review/);
    // figure issues from the visual QA are gate errors (overlap, too small) or warnings (too wide)
    const g2 = await qualityGate(w.ctx, 'tad', { html: r.html, figures: { figures: [{ n: 3, id: 'fig-3', caption: 'X', png: null, issues: [{ code: 'overlap', detail: '2 labels' }, { code: 'too-wide', detail: 'w' }] }] }, mark: false });
    assert.ok(g2.errors.some((e) => e.code === 'figure-unreadable'));
    assert.ok(g2.warnings.some((e) => e.code === 'figure-too-wide'));
  } finally { w.cleanup(); }
});

test('draft marking is idempotent and French says BROUILLON', () => {
  const fr = loadI18n('fr').dict;
  const html = '<body>\n<section class="cover"><div><b>Version</b><span>1.0<span class="doc-status"> — Pour revue</span></span></div><p class="conf">x</p></section></body>';
  const once = markDraftHtml(html, fr, { errors: 2 });
  assert.equal(markDraftHtml(once, fr, { errors: 2 }), once);
  assert.match(once, /BROUILLON/);
  assert.match(once, /— Brouillon<\/span>/);
  assert.doesNotMatch(once, /Pour revue/);
});

test('cover and front matter: never « — » for an empty author, no author column without authors', async () => {
  const w = makeWorkspace();
  try {
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.integrator = { name: null, logo: null }; cfg.document.author = '—'; writeJson(p, cfg);
    const r = await buildDocument(loadWorkspace(w.project), 'tad', { render: false });
    const html = fs.readFileSync(r.html, 'utf8');
    assert.doesNotMatch(html, /Prepared by<\/b>/);
    assert.doesNotMatch(/<h2 id="version-history"[\s\S]*?<\/table>/.exec(html)?.[0] || html.slice(0, 0), /<th>Author<\/th>/);
    assert.ok(!r.gate.errors.some((e) => e.code === 'cover-empty-field'));
    cfg.document.title = 'NWB_CRM'; writeJson(p, cfg);
    const r2 = await buildDocument(loadWorkspace(w.project), 'tad', { render: false });
    assert.ok(r2.gate.errors.some((e) => e.code === 'cover-title'));
  } finally { w.cleanup(); }
});

test('figure QA in a browser: figures measured and photographed (skipped without Chrome / Edge)', { skip: !findBrowser() && 'no browser' }, async () => {
  const w = makeWorkspace();
  try {
    fs.mkdirSync(path.join(w.ws, 'understanding'), { recursive: true });
    writeJson(path.join(w.ws, 'understanding', 'model.json'), MODEL);
    fs.writeFileSync(path.join(w.ws, 'src', 'tad', '50-extra.md'), '# Extra {#extra}\n\n@@ERD-DOMAIN:loans@@\n\n@@SEQ:loan-status@@\n\n```mermaid\nflowchart LR\n  A["Broken label (x"] --> B\n  C[unclosed\n```\nFigure: Broken on purpose\n');
    const r = await buildDocument(w.ctx, 'tad', { render: true, gate: false });
    const qa = await figureQA(w.ctx, r.html, 'tad');
    assert.ok(qa.figures.length >= 3);
    for (const f of qa.figures) assert.ok(f.png && fs.existsSync(f.png), `png of figure ${f.n}`);
    assert.match(path.basename(qa.figures[0].png), /^tad-fig-\d+\.png$/);
    const broken = qa.figures.find((f) => /Broken/.test(f.caption));
    assert.ok(broken.issues.some((i) => i.code === 'render-error'));
    const erd = qa.figures.find((f) => /Data model/.test(f.caption));
    assert.ok(!erd.issues.some((i) => i.code === 'overlap'), JSON.stringify(erd.issues));
    const g = await qualityGate(w.ctx, 'tad', { html: r.html, report: r, figures: qa });
    assert.ok(g.errors.some((e) => e.code === 'figure-unreadable'));
  } finally { await closeBrowser(); w.cleanup(); }
});

test('state diagrams: a « : » inside a label never breaks the diagram', async () => {
  const { stateCode } = await import('../src/build/diagrams.js');
  const { code } = stateCode({ id: 'x', states: [{ id: 'a', label: 'Option : posée' }, { id: 'b', label: 'Réservé' }], initial: 'a', final: ['b'], transitions: [{ from: 'a', to: 'b', label: 'dépôt reçu : réservation confirmée' }] });
  for (const line of code.split('\n').filter((l) => / : /.test(l))) assert.equal(line.split(' : ').length, 2, line);
});
