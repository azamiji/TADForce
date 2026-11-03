import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGraph, indexGraph } from '../src/understand/graph.js';
import { validateModel } from '../src/understand/schema.js';
import { developerSlices, entryChains, lifecycleCandidates } from '../src/understand/plan.js';
import { extractFacts } from '../src/facts/index.js';
import { writeJson, writeText, readText } from '../src/util/fsx.js';
import { FIXTURE, makeWorkspace } from './helpers.js';

const SRC = path.join(FIXTURE, 'force-app');
const has = (g, from, kind, to) => g.edges.some((e) => e.from === from && e.kind === kind && e.to === to);

test('graph: triggers, handlers, calls, async, callouts, SOQL, DML, events, flows, LWC, pages', () => {
  const facts = extractFacts([SRC], {}, { base: FIXTURE });
  const g = buildGraph([SRC], facts, { base: FIXTURE });
  assert.ok(has(g, 'trigger:LoanApplicationTrigger', 'triggers-on', 'object:LoanApplication__c'));
  assert.ok(has(g, 'trigger:LoanApplicationTrigger', 'delegates', 'apex:LoanApplicationTriggerHandler'));
  assert.ok(has(g, 'apex:LoanApplicationTriggerHandler', 'calls', 'apex:LoanScoringService'));
  const q = g.edges.find((e) => e.from === 'apex:LoanApplicationTriggerHandler' && e.to === 'apex:DocumentArchiveQueueable');
  assert.equal(q.async, 'queueable', 'System.enqueueJob is an asynchronous call');
  assert.ok(has(g, 'apex:LoanApplicationTriggerHandler', 'publishes', 'platformEvent:LoanStatusChange__e'));
  assert.ok(has(g, 'flow:Loan_Status_Notification', 'subscribes', 'platformEvent:LoanStatusChange__e'));
  assert.ok(has(g, 'apex:CoreBankingClient', 'calls', 'namedCredential:NWB_CoreBanking'));
  assert.ok(has(g, 'apex:LoanScoringService', 'reads', 'cmdt:ScoringRule__mdt'));
  assert.ok(has(g, 'apex:LoanApplicationSelector', 'reads', 'object:Account'));
  assert.ok(has(g, 'apex:LeadApiResource', 'writes', 'object:Lead'), 'insert as user on a typed variable');
  assert.ok(has(g, 'flow:Loan_Document_Reminder', 'calls', 'apex:SmsNotificationService'));
  assert.ok(has(g, 'flow:Lead_Assign_Branch', 'triggers-on', 'object:Lead'));
  assert.ok(has(g, 'flow:Loan_Status_Notification', 'writes', 'object:Task'));
  const wire = g.edges.find((e) => e.from === 'lwc:customer360' && e.to === 'apex:Customer360Controller');
  assert.deepEqual(wire.modes, ['wire']);
  assert.ok(has(g, 'flexipage:Account_Record_Page', 'places', 'lwc:customer360'));
  assert.ok(has(g, 'tab:Loan_Wizard', 'places', 'lwc:loanWizard'));
  assert.ok(has(g, 'queue:Loan_Review', 'serves', 'object:LoanApplication__c'));
  assert.equal(g.nodes.find((n) => n.id === 'object:Task').retrieved, false, 'objects only seen in the code are flagged');
  assert.ok(!g.nodes.some((n) => /Test$/.test(n.name) && n.kind === 'apex'), 'test classes are not in the graph');
  // deterministic
  assert.deepEqual(buildGraph([SRC], facts, { base: FIXTURE }), g);
});

test('graph: excluded components never become nodes', () => {
  const facts = extractFacts([SRC], { exclusions: { exclude: [{ name: 'DemoDataLoader', type: 'apex' }] } }, { base: FIXTURE });
  const g = buildGraph([SRC], facts, { base: FIXTURE });
  assert.ok(!g.nodes.some((n) => n.name === 'DemoDataLoader'));
  assert.ok(!g.edges.some((e) => e.from === 'apex:DemoDataLoader'));
});

test('graph: OmniStudio chains OmniScript → Integration Procedure → Data Mapper, Apex and HTTP', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-omni-'));
  try {
    const root = path.join(dir, 'force-app', 'main', 'default');
    writeText(path.join(root, 'classes', 'PricingService.cls'), 'public with sharing class PricingService { public static Map<String,Object> price(Map<String,Object> m) { return m; } }');
    writeText(path.join(root, 'classes', 'PricingService.cls-meta.xml'), '<ApexClass><apiVersion>62.0</apiVersion></ApexClass>');
    writeText(path.join(root, 'namedCredentials', 'Quote_API.namedCredential-meta.xml'), '<NamedCredential><endpoint>https://api.example.com</endpoint><label>Quote API</label></NamedCredential>');
    writeText(path.join(root, 'objects', 'Quote__c', 'Quote__c.object-meta.xml'), '<CustomObject><label>Quote</label></CustomObject>');
    const esc = (o) => JSON.stringify(o).replace(/"/g, '&quot;');
    writeText(path.join(root, 'omniScripts', 'ACME_Quote_English_1.os-meta.xml'), `<OmniScript><isActive>true</isActive><name>Quote</name><type>ACME</type><subType>Quote</subType><omniProcessElements><propertySetConfig>${esc({ integrationProcedureKey: 'ACME_GetQuote' })}</propertySetConfig><type>Integration Procedure Action</type></omniProcessElements></OmniScript>`);
    writeText(path.join(root, 'omniIntegrationProcedures', 'ACME_GetQuote_English_1.oip-meta.xml'), `<OmniIntegrationProcedure><isActive>true</isActive><name>Get quote</name><type>ACME</type><subType>GetQuote</subType><omniProcessElements><propertySetConfig>${esc({ bundle: 'ACME_ExtractQuote' })}</propertySetConfig></omniProcessElements><omniProcessElements><propertySetConfig>${esc({ remoteClass: 'PricingService', remoteMethod: 'price' })}</propertySetConfig></omniProcessElements><omniProcessElements><propertySetConfig>${esc({ namedCredential: 'Quote_API' })}</propertySetConfig></omniProcessElements></OmniIntegrationProcedure>`);
    writeText(path.join(root, 'omniDataTransforms', 'ACME_ExtractQuote_1.rpt-meta.xml'), '<OmniDataTransform><isActive>true</isActive><name>ACME_ExtractQuote</name><type>Extract</type><omniDataTransformItem><inputObjectName>Quote__c</inputObjectName></omniDataTransformItem></OmniDataTransform>');
    const src = path.join(dir, 'force-app');
    const facts = extractFacts([src], {}, { base: dir });
    const g = buildGraph([src], facts, { base: dir });
    assert.ok(has(g, 'omniscript:ACME_Quote_English_1', 'calls', 'ip:ACME_GetQuote_English_1'));
    assert.ok(has(g, 'ip:ACME_GetQuote_English_1', 'calls', 'datamapper:ACME_ExtractQuote_1'));
    assert.ok(has(g, 'ip:ACME_GetQuote_English_1', 'calls', 'apex:PricingService'));
    assert.ok(has(g, 'ip:ACME_GetQuote_English_1', 'calls', 'namedCredential:Quote_API'));
    assert.ok(has(g, 'datamapper:ACME_ExtractQuote_1', 'reads', 'object:Quote__c'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('plan: slices cover every active component once; chains follow observed edges', () => {
  const facts = extractFacts([SRC], {}, { base: FIXTURE });
  const g = buildGraph([SRC], facts, { base: FIXTURE });
  const slices = developerSlices(g);
  const ids = slices.flatMap((s) => s.nodes.map((n) => n.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('apex:LoanScoringService') && ids.includes('lwc:customer360') && ids.includes('trigger:LeadTrigger'));
  assert.ok(!ids.includes('flow:Old_Branch_Survey') || g.nodes.find((n) => n.id === 'flow:Old_Branch_Survey').active !== false, 'inactive flows get no card');
  const chains = entryChains(g);
  const api = chains.find((c) => c.entry === 'LeadApiResource');
  assert.ok(api, 'a REST resource is an entry point');
  assert.ok(api.steps.some((s) => s.edge === 'writes' && s.to === 'Lead'));
  assert.ok(api.steps.some((s) => s.edge === 'fires' && s.to === 'LeadTrigger'), 'a write fires the triggers of the object');
  const trig = chains.find((c) => c.entry === 'LoanApplicationTrigger');
  assert.ok(trig.steps.some((s) => s.edge === 'delivers' && s.to === 'Loan_Status_Notification'), 'an event reaches its subscribers');
  assert.deepEqual(lifecycleCandidates([SRC], facts).map((c) => `${c.object}.${c.field}`), ['LoanApplication__c.Status__c']);
  void indexGraph;
});

function goodModel() {
  return {
    version: 1, generatedAt: '2026-01-15T00:00:00.000Z',
    actors: [{ id: 'advisor', name: 'Branch advisors', kind: 'internal', apps: ['NWB_Branch_Console'], evidence: ['NWB_Persona_Advisor'] }],
    domains: [{ id: 'lending', name: 'Lending', summary: 'Loan applications', objects: ['LoanApplication__c', 'LoanDocument__c'], components: ['LoanScoringService'], actors: ['advisor'] }],
    processes: [{
      id: 'loan-decision', name: 'Loan decision', domain: 'lending', summary: 'Scoring then decision', trigger: 'An advisor saves an application',
      participants: [{ id: 'advisor', label: 'Advisor', kind: 'actor' }, { id: 'trg', label: 'LoanApplicationTrigger', kind: 'component', ref: 'LoanApplicationTrigger' }, { id: 'LoanScoringService', label: 'Scoring', kind: 'component' }],
      steps: [{ from: 'advisor', to: 'trg', label: 'save', async: false, reply: false, group: null, evidence: ['LoanApplicationTrigger'] }, { from: 'trg', to: 'LoanScoringService', label: 'score', async: false, reply: false, group: null, evidence: ['LoanApplicationTriggerHandler'] }],
    }],
    lifecycles: [{ id: 'loan-status', object: 'LoanApplication__c', field: 'Status__c', states: [{ id: 'draft', label: 'Draft' }, { id: 'approved', label: 'Approved' }], initial: 'draft', final: ['approved'], transitions: [{ from: 'draft', to: 'approved', label: 'decision', evidence: ['LoanApplicationTriggerHandler'] }] }],
    componentCards: { LoanScoringService: { role: 'Scores a loan application', triggeredBy: 'LoanApplicationTriggerHandler', reads: ['ScoringRule__mdt'], writes: [], calls: ['LoanApplicationSelector'], notes: '' } },
    findings: [{ id: 'f-01', kind: 'question', text: 'Who calls /leads/v1?', evidence: ['LeadApiResource'] }],
  };
}

test('model validator: a grounded model passes; invented names, excluded components and unknown systems fail', () => {
  const facts = extractFacts([SRC], { exclusions: { exclude: [{ name: 'DemoDataLoader' }] } }, { base: FIXTURE });
  const ok = validateModel(goodModel(), facts);
  assert.deepEqual(ok.errors, []);
  const bad = goodModel();
  bad.componentCards.MagicRouter = { role: 'routes' };
  bad.componentCards.DemoDataLoader = { role: 'loads' };
  bad.processes[0].participants.push({ id: 'crm', label: 'Legacy Core', kind: 'external' });
  bad.processes[0].steps.push({ from: 'trg', to: 'nowhere', label: 'x', evidence: [] });
  bad.domains[0].objects.push('Imaginary__c');
  bad.lifecycles[0].initial = 'nope';
  const r = validateModel(bad, facts);
  const text = r.errors.map((e) => e.message).join('\n');
  assert.match(text, /unknown component `MagicRouter`/);
  assert.match(text, /`DemoDataLoader` is excluded/);
  assert.match(text, /not in knowledge\/glossary\.yml/);
  assert.match(text, /to "nowhere" is not a participant/);
  assert.match(text, /unknown object `Imaginary__c`/);
  assert.match(text, /initial "nope" is not a state/);
  // a confirmed system name is accepted
  const named = extractFacts([SRC], { glossary: { systems: [{ id: 'core', name: 'Core banking', match: ['NWB_CoreBanking'] }] } }, { base: FIXTURE });
  const m = goodModel();
  m.processes[0].participants.push({ id: 'core', label: 'Core banking', kind: 'external' });
  assert.deepEqual(validateModel(m, named).errors, []);
});

/** Run `tadforce build --json` and return its payload. */
async function buildJson(project, extra = {}) {
  const { build } = await import('../src/commands/docs.js');
  const orig = console.log;
  let out = '';
  console.log = (...a) => { out += a.join(' ') + '\n'; };
  try { await build({ cwd: project, json: true, ...extra }); } finally { console.log = orig; }
  return JSON.parse(out);
}

test('build loop: understand (cards, processes, fix) → write (stages) → review → render', async () => {
  const w = makeWorkspace();
  try {
    // 1. understand · cards: developer slices and the analyst, in parallel
    let p = await buildJson(w.project);
    assert.equal(p.phase, 'understand');
    assert.equal(p.stage, 'cards');
    assert.ok(fs.existsSync(path.join(w.ws, 'facts', 'graph.json')), 'graph.json is built by the CLI');
    const dev = p.tasks.filter((t) => t.role === 'developer');
    const analyst = p.tasks.find((t) => t.role === 'functional-analyst');
    assert.ok(dev.length >= 1 && analyst);
    for (const t of dev) {
      const cards = Object.fromEntries(t.components.map((c) => [`${c.kind}:${c.id}`, { role: `Does the work of ${c.id}`, triggeredBy: '', reads: [], writes: [], calls: [], notes: '' }]));
      writeJson(path.join(w.project, t.output.file), { task: t.id, fingerprint: t.fingerprint, cards });
    }
    const m = goodModel();
    writeJson(path.join(w.project, analyst.output.file), { task: 'analyst', fingerprint: analyst.fingerprint, actors: m.actors, domains: m.domains, lifecycles: m.lifecycles, findings: [] });

    // 2. understand · processes: the architect, once the cards exist
    p = await buildJson(w.project);
    assert.equal(p.stage, 'processes');
    const arch = p.tasks[0];
    assert.ok(arch.inputs.chains.length > 0);
    const invented = { ...m.processes[0], participants: [...m.processes[0].participants, { id: 'x', label: 'Ghost', kind: 'component', ref: 'GhostService' }] };
    writeJson(path.join(w.project, arch.output.file), { task: 'architect', fingerprint: arch.fingerprint, processes: [invented], findings: m.findings });

    // 3. the merge refuses invented names: a fix task for the architect part
    p = await buildJson(w.project);
    assert.equal(p.stage, 'fix');
    assert.match(p.tasks[0].file, /architect\.json$/);
    assert.match(JSON.stringify(p.tasks[0].errors), /GhostService/);
    assert.ok(!fs.existsSync(path.join(w.ws, 'understanding', 'model.json')));
    writeJson(path.join(w.project, arch.output.file), { task: 'architect', fingerprint: arch.fingerprint, processes: m.processes, findings: m.findings });

    // 4. write: the facts-heavy chapters first, in parallel groups, each with its model slice
    p = await buildJson(w.project);
    assert.equal(p.phase, 'write');
    const model = JSON.parse(readText(path.join(w.ws, 'understanding', 'model.json')));
    assert.equal(model.version, 1);
    assert.ok(model.componentCards.LoanScoringService, 'graph ids (apex:Name) are mapped to inventory ids');
    assert.equal(p.stage.split('/')[0], '1');
    assert.ok(p.parallel);
    assert.ok(p.groups.every((g) => /^tad-(0[6-9]|1[0-3])$/.test(g.id)));
    assert.ok(p.groups.every((g) => g.sections.every((s) => s.spec && s.spec.id === s.id)));
    // write: replace the pending markers
    const fill = (only) => {
      for (const doc of ['tad', 'axes']) {
        const dir = path.join(w.ws, 'src', doc);
        for (const f of fs.readdirSync(dir)) {
          if (only && (doc !== 'tad' || !only.includes(f.slice(0, 2)))) continue;
          const file = path.join(dir, f);
          fs.writeFileSync(file, readText(file).replace(/<!--\s*tad:pending\s+([\w.-]+)\s*-->/g, 'Written from the model.'));
        }
      }
    };
    const g7 = p.groups.find((g) => g.id === 'tad-07');
    assert.ok(g7.model.componentCards, 'the application chapter gets the code cards');
    fill(['06', '07', '08', '09', '10', '11', '12', '13']);
    p = await buildJson(w.project);
    assert.deepEqual(p.groups.map((g) => g.id), ['tad-05'], 'then the functional chapter, from the whole model');
    assert.equal(JSON.parse(readText(path.join(w.ws, 'understanding', 'model.json'))).generatedAt, model.generatedAt, 'an up-to-date model is not merged again');
    assert.ok(fs.existsSync(path.join(w.project, p.groups[0].taskFile)), 'each package is also a file');
    assert.deepEqual(p.groups[0].model.figures.sequences, ['@@SEQ:loan-decision@@']);
    fill();

    // 5. review: a reviewer task with the dry-built HTML and the validation
    p = await buildJson(w.project);
    assert.equal(p.phase, 'review');
    assert.ok(p.task.inputs.html.length >= 1);
    assert.ok(p.task.checks.length >= 5);
    writeJson(path.join(w.project, p.task.output.file), { version: 1, summary: 'ok', fixed: [], remaining: [{ where: 'src/tad/09-integrations.md', issue: 'caller of the REST API unknown', why: 'not in the metadata' }] });

    // 6. render (no browser in tests): outputs, validation and the final report
    p = await buildJson(w.project, { render: false, pdf: false, docx: false });
    assert.equal(p.phase, 'render');
    assert.ok(p.outputs.some((o) => o.doc === 'tad' && /\.html$/.test(o.html)));
    assert.equal(p.report.questions[0].text, 'Who calls /leads/v1?');
    assert.equal(p.report.reviewRemaining.length, 1);

    // a change in the sources asks for a new review
    const f = path.join(w.ws, 'src', 'tad', '06-data.md');
    fs.appendFileSync(f, '\nOne more sentence.\n');
    p = await buildJson(w.project);
    assert.equal(p.phase, 'review');
    assert.equal(p.stale, true);
  } finally { w.cleanup(); }
});

test('build --render-only keeps the 0.4 behaviour: render what is written', async () => {
  const w = makeWorkspace();
  try {
    const { build } = await import('../src/commands/docs.js');
    const orig = console.log; console.log = () => {};
    try { assert.equal(await build({ cwd: w.project, renderOnly: true, render: false, pdf: false, docx: false, quiet: true }), 0); } finally { console.log = orig; }
    assert.ok(fs.readdirSync(path.join(w.ws, 'out')).some((x) => x.endsWith('.html')));
    assert.ok(!fs.existsSync(path.join(w.ws, 'facts', 'graph.json')), 'no understanding work in render-only mode');
  } finally { w.cleanup(); }
});

test('the agent prompt describes the build loop', async () => {
  const { PROMPT, AGENTS } = await import('../src/util/agents.js');
  assert.match(PROMPT, /tadforce build --json/);
  assert.match(PROMPT, /parallel/);
  assert.ok(AGENTS.find((a) => a.id === 'codex').args[0] === PROMPT);
});
