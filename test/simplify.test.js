import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { erdModel, erdTextPx, erdClusters } from '../src/build/erd.js';
import { erdFigure, erdVariants, resolveDirectives } from '../src/build/directives.js';
import { sequenceCode, sequenceLanes, stateCode, SEQ_MAX } from '../src/build/diagrams.js';
import { simplifyTargets, figureQA, QA } from '../src/build/figqa.js';
import { findBrowser, closeBrowser } from '../src/build/browser.js';
import { buildDocument, preprocess } from '../src/build/render.js';
import { loadI18n } from '../src/util/i18n.js';
import { readJson, writeJson, writeText } from '../src/util/fsx.js';
import { makeWorkspace, ROOT } from './helpers.js';

const { dict } = loadI18n('en');
const fr = loadI18n('fr').dict;
const MODEL = readJson(path.join(ROOT, 'examples', 'northwind-bank', 'tadforce', 'understanding', 'model.json'));

/** A dense domain: 8 objects, a hub every other object looks up, long field names, many lookups. */
function denseFacts() {
  const names = ['Customer_Master__c', 'Contract_Agreement__c', 'Contract_Line_Item__c', 'Billing_Schedule__c', 'Invoice_Header__c', 'Invoice_Line_Detail__c', 'Payment_Transaction__c', 'Collection_Case_Record__c'];
  const rel = (field, to, type = 'Lookup') => ({ field, to: [to], type });
  const relations = {
    Contract_Agreement__c: [rel('Customer_Master_Reference__c', names[0])],
    Contract_Line_Item__c: [rel('Contract_Agreement_Reference__c', names[1], 'MasterDetail'), rel('Customer_Master_Reference__c', names[0])],
    Billing_Schedule__c: [rel('Contract_Line_Item_Reference__c', names[2]), rel('Customer_Master_Reference__c', names[0])],
    Invoice_Header__c: [rel('Billing_Schedule_Reference__c', names[3]), rel('Customer_Master_Reference__c', names[0]), rel('Contract_Agreement_Reference__c', names[1])],
    Invoice_Line_Detail__c: [rel('Invoice_Header_Reference__c', names[4], 'MasterDetail'), rel('Contract_Line_Item_Reference__c', names[2]), rel('Customer_Master_Reference__c', names[0])],
    Payment_Transaction__c: [rel('Invoice_Header_Reference__c', names[4]), rel('Customer_Master_Reference__c', names[0])],
    Collection_Case_Record__c: [rel('Payment_Transaction_Reference__c', names[6]), rel('Invoice_Header_Reference__c', names[4]), rel('Customer_Master_Reference__c', names[0])],
  };
  const objects = names.map((n) => ({
    name: n, label: n.replace(/__c$/, '').replace(/_/g, ' '), relations: relations[n] || [], externalIds: [`${n.replace(/__c$/, '')}_External_Identifier__c`],
    fields: ['Lifecycle_Status_Value__c', 'Total_Amount_Including_Tax__c', 'Effective_Start_Date__c', 'Business_Category_Code__c'].map((f) => ({ name: f, type: 'Picklist (restricted)' })),
  }));
  return { names, facts: { data: { objects } } };
}

test('ERD clustering: the hub is repeated, a child stays with its parent, deterministic', () => {
  const { names, facts } = denseFacts();
  const a = erdClusters(facts, names, 2);
  assert.equal(a.hub, 'Customer_Master__c');
  assert.equal(a.parts.length, 2);
  for (const p of a.parts) assert.equal(p[0], 'Customer_Master__c');
  // every object (but the hub) in exactly one part
  assert.deepEqual(a.parts.flatMap((p) => p.slice(1)).sort(), names.slice(1).sort());
  const partOf = (n) => a.parts.findIndex((p) => p.includes(n));
  assert.equal(partOf('Invoice_Line_Detail__c'), partOf('Invoice_Header__c'), 'master-detail child with its parent');
  assert.equal(partOf('Contract_Line_Item__c'), partOf('Contract_Agreement__c'));
  assert.deepEqual(erdClusters(facts, names, 2), a, 'same input, same split');
  assert.equal(erdClusters(facts, names, 3).parts.length, 3);
});

test('ERD auto-split: an unreadable domain becomes « (1/2) » « (2/2) », then loses its type column; readable ones stay whole', () => {
  const { names, facts } = denseFacts();
  assert.ok(erdTextPx(erdModel(facts, names, dict)) < QA.warnFontPx, 'the dense domain is unreadable whole');
  const variants = erdVariants(facts, names);
  assert.deepEqual(variants.map((v) => [v.parts.length, v.types]), [[1, true], [2, true], [3, true], [2, false], [3, false]]);
  const problems = [];
  // default engine: Mermaid erDiagram figures, tagged with their directive and their kind
  const code = erdFigure({ facts, dict }, names, 'Billing', problems, '@@ERD-DOMAIN:billing@@', 'ERD-DOMAIN:billing');
  const caps = [...code.matchAll(/^Figure: (.*)$/gm)].map((m) => m[1]);
  assert.ok(caps.length >= 2, `split: ${caps.join(' | ')}`);
  assert.deepEqual(caps, caps.map((c, i) => `Billing (${i + 1}/${caps.length})`));
  assert.equal((code.match(/^```mermaid\nerDiagram\n/gm) || []).length, caps.length);
  assert.equal((code.match(/^%% tad-src=ERD-DOMAIN:billing$/gm) || []).length, caps.length);
  assert.equal((code.match(/^%% tad-kind=erd$/gm) || []).length, caps.length);
  // legacy engine (diagrams.engine: legacy): the same split, drawn as hand-made SVG
  const legacy = erdFigure({ facts, dict, cfg: { diagrams: { engine: 'legacy' } } }, names, 'Billing', [], 'x', 'ERD-DOMAIN:billing');
  const lcaps = [...legacy.matchAll(/<figcaption class="figcap">Figure — ([^<]*)<\/figcaption>/g)].map((m) => m[1]);
  assert.deepEqual(lcaps, caps);
  assert.equal((legacy.match(/data-src="ERD-DOMAIN:billing"/g) || []).length, caps.length);
  // the simplified variant (asked by the visual QA) goes one step further
  const again = erdFigure({ facts, dict, simplify: new Set(['ERD-DOMAIN:billing']) }, names, 'Billing', [], 'x', 'ERD-DOMAIN:billing');
  assert.ok((again.match(/^Figure: /gm) || []).length >= caps.length);
  // the example's domains read well: drawn whole
  const w = makeWorkspace();
  try {
    for (const d of MODEL.domains) {
      const one = erdFigure({ facts: w.facts, dict }, d.objects, d.name, [], 'x', `ERD-DOMAIN:${d.id}`);
      assert.equal((one.match(/^Figure: /gm) || []).length, 1, d.id);
    }
  } finally { w.cleanup(); }
});

function bigProcess() {
  const participants = [
    { id: 'u', label: 'Advisor', kind: 'actor' }, { id: 'm', label: 'Branch manager', kind: 'actor' },
    { id: 'c1', label: 'LoanApplicationTriggerHandler', kind: 'component' }, { id: 'c2', label: 'LoanScoringService', kind: 'component' },
    { id: 'c3', label: 'DocumentArchiveQueueable', kind: 'component' }, { id: 'c4', label: 'NotificationDispatcherWithAVeryLongName', kind: 'component' },
    { id: 'o1', label: 'LoanApplication__c', kind: 'object' }, { id: 'o2', label: 'ScoringRule__mdt', kind: 'object' },
    { id: 'x', label: 'Document store', kind: 'external' }, { id: 'y', label: 'SMS gateway', kind: 'external' },
  ];
  const steps = [
    { from: 'u', to: 'c1', label: 'save' }, { from: 'c1', to: 'c2', label: 'score' }, { from: 'c2', to: 'o2', label: 'read rules' },
    { from: 'c1', to: 'o1', label: 'update' }, { from: 'm', to: 'o1', label: 'review' }, { from: 'c3', to: 'x', label: 'archive' },
    { from: 'c4', to: 'y', label: 'send' }, { from: 'c1', to: 'c3', label: 'enqueue', async: true },
  ];
  return { id: 'big', participants, steps };
}

test('sequences: more than 7 participants — data in one lane, then non-talking neighbours merged, long names cut with a table', () => {
  const p = bigProcess();
  assert.ok(p.participants.length > SEQ_MAX);
  const { code, notes } = sequenceCode(p, fr);
  const lanes = code.split('\n').filter((l) => /^\s+(actor|participant) /.test(l));
  assert.ok(lanes.length <= SEQ_MAX, code);
  assert.match(code, /participant P\d as Données/);
  assert.match(code, /actor P1 as Advisor \/ Branch manager/, 'two actors that never talk share a lane');
  // every step still drawn
  assert.equal(code.split('\n').filter((l) => /P\d+-[->)]/.test(l)).length, p.steps.length);
  assert.ok(notes.some((n) => n.lane === 'Données' && /LoanApplication__c, ScoringRule__mdt/.test(n.full)));
  assert.ok(lanes.every((l) => l.replace(/^.* as /, '').length <= 28));
  assert.deepEqual(sequenceCode(p, fr), sequenceCode(p, fr), 'deterministic');
  // ≤ 7 participants: untouched
  const small = MODEL.processes.find((x) => x.id === 'loan-status');
  assert.equal(sequenceLanes(small.participants.map((x) => ({ ...x })), small.steps, dict).simplified, false);
  // the simplified variant aims at 5 lanes
  const s = sequenceCode(small, dict, { simplify: true });
  assert.ok(s.code.split('\n').filter((l) => /^\s+(actor|participant) /.test(l)).length <= small.participants.length);
  // the directive adds the table of full names under the figure, and tags its source
  const w = makeWorkspace();
  try {
    const out = resolveDirectives('@@SEQ:big@@', { facts: w.facts, cfg: w.ctx.cfg, dict, lang: 'en', glossary: {}, doc: 'tad', model: { processes: [p] } }, []);
    assert.match(out, /%% tad-src=SEQ:big\n```\nFigure: Sequence — big\n\n\| In the figure \| Participants \|/);
    const pre = preprocess(out);
    assert.equal(pre.figures[0].src, 'SEQ:big');
    assert.ok(!/tad-src/.test(pre.figures[0].code));
  } finally { w.cleanup(); }
});

test('state diagrams: the simplified variant is drawn top to bottom', () => {
  const lc = { id: 'l', states: [{ id: 'a' }, { id: 'b' }], initial: 'a', transitions: [{ from: 'a', to: 'b' }], final: ['b'] };
  assert.match(stateCode(lc).code, /direction LR/);
  assert.match(stateCode(lc, { simplify: true }).code, /direction TB/);
});

test('figure QA: the figures with issues name the directives to simplify, once', () => {
  const figs = [
    { n: 1, src: 'SEQ:a', issues: [{ code: 'small-text' }] },
    { n: 2, src: 'ERD-DOMAIN:b', issues: [] },
    { n: 3, src: null, issues: [{ code: 'overlap' }] },
    { n: 4, src: 'STATE:c', issues: [{ code: 'not-rendered' }] },
    { n: 5, src: 'ERD-DOMAIN:d', issues: [{ code: 'too-small' }] },
    { n: 6, src: 'ERD-DOMAIN:d', issues: [{ code: 'too-wide' }] },
  ];
  assert.deepEqual(simplifyTargets(figs), ['SEQ:a', 'ERD-DOMAIN:d']);
  assert.deepEqual(simplifyTargets(figs, ['SEQ:a']), ['ERD-DOMAIN:d']);
});

test('build: generated figures carry their directive; a rebuild draws the simplified variant', async () => {
  const w = makeWorkspace();
  try {
    writeJson(w.ctx.p('understanding', 'model.json'), MODEL);
    writeText(path.join(w.ws, 'src', 'tad', '05-functional.md'), '# Functional {#ch-functional}\n\n@@SEQ:loan-status@@\n\n@@ERD-DOMAIN:loans@@\n\n@@STATE:loan-status@@\n');
    const r = await buildDocument(w.ctx, 'tad', { render: false, gate: false });
    const html = fs.readFileSync(r.html, 'utf8');
    for (const src of ['SEQ:loan-status', 'ERD-DOMAIN:loans', 'STATE:loan-status']) assert.match(html, new RegExp(`data-src="${src}"`));
    assert.deepEqual(r.simplified, []);
    const r2 = await r.rebuild(['STATE:loan-status']);
    assert.deepEqual(r2.simplified, ['STATE:loan-status']);
    assert.match(fs.readFileSync(r2.html, 'utf8'), /direction TB/);
  } finally { w.cleanup(); }
});

test('figure QA with a browser: a figure with issues is redrawn once in its simplified variant', { skip: !findBrowser() && 'no Chrome / Edge' }, async () => {
  const w = makeWorkspace();
  try {
    const p = bigProcess();
    writeJson(w.ctx.p('understanding', 'model.json'), { ...MODEL, processes: [...MODEL.processes, p] });
    writeText(path.join(w.ws, 'src', 'tad', '05-functional.md'), '# Functional {#ch-functional}\n\n@@SEQ:big@@\n');
    const r = await buildDocument(w.ctx, 'tad', { gate: false });
    // tiny thresholds would accept anything: make every figure fail once to force the re-render
    const qa = await figureQA(w.ctx, r.html, 'tad', { report: r, thresholds: { warnFontPx: 100 } });
    assert.ok(qa.retried.includes('SEQ:big'), qa.retried.join(', '));
    assert.deepEqual(r.simplified, qa.retried, 'the caller\'s report describes the HTML on disk');
    const again = await figureQA(w.ctx, r.html, 'tad', { report: r, thresholds: { warnFontPx: 100 } });
    assert.equal(again.retried, undefined, 'one automatic re-render, never a loop');
  } finally { await closeBrowser(); w.cleanup(); }
});
