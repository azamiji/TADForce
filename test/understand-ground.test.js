// 0.6.0 build loop: call-graph completions, data-only fingerprints, ground-truth brief, figure ownership,
// document context, parts and resume, writers' questions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildGraph, apexKinds } from '../src/understand/graph.js';
import { entryChains, planUnderstanding, developerFingerprint } from '../src/understand/plan.js';
import { groundTruth, briefMarkdown, orgEnvironment } from '../src/understand/brief.js';
import { figureOwnership, groupFigures, chapterOutline, readQuestions, sectionParts, resumeHint, skeletonMap } from '../src/understand/doc.js';
import { finalReport } from '../src/understand/index.js';
import { extractFacts } from '../src/facts/index.js';
import { writeJson, writeText, readText, copyDir } from '../src/util/fsx.js';
import { FIXTURE, makeWorkspace } from './helpers.js';

const has = (g, from, kind, to) => g.edges.some((e) => e.from === from && e.kind === kind && e.to === to);
const SRC = path.join(FIXTURE, 'force-app');

/** A small org: venues, bookings and tickets, written to a temp folder. */
function eventsOrg() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-graph-'));
  const root = path.join(dir, 'force-app', 'main', 'default');
  const obj = (name, fields = {}) => {
    writeText(path.join(root, 'objects', name, `${name}.object-meta.xml`), `<CustomObject><label>${name}</label></CustomObject>`);
    for (const [f, xml] of Object.entries(fields)) writeText(path.join(root, 'objects', name, 'fields', `${f}.field-meta.xml`), `<CustomField><fullName>${f}</fullName>${xml}</CustomField>`);
  };
  const lookup = (to, rel) => `<type>Lookup</type><referenceTo>${to}</referenceTo><relationshipName>${rel}</relationshipName>`;
  obj('Venue__c', { Capacity__c: '<type>Number</type>' });
  obj('Booking__c', { Venue__c: lookup('Venue__c', 'Bookings'), Status__c: '<type>Picklist</type><valueSet><valueSetDefinition><value><fullName>Open</fullName></value><value><fullName>Closed</fullName></value></valueSetDefinition></valueSet>' });
  obj('Ticket__c', { Booking__c: lookup('Booking__c', 'Tickets'), Seat__c: '<type>Text</type>' });
  obj('Opportunity', { Venue__c: lookup('Venue__c', 'Opportunities') });
  const cls = (name, body) => {
    writeText(path.join(root, 'classes', `${name}.cls`), body);
    writeText(path.join(root, 'classes', `${name}.cls-meta.xml`), '<ApexClass><apiVersion>62.0</apiVersion><status>Active</status></ApexClass>');
  };
  cls('BookingService', `public with sharing class BookingService {
    public static void summarise(Set<Id> ids) {
      List<Opportunity> opps = [SELECT Id, Venue__r.Capacity__c FROM Opportunity WHERE Id IN :ids];
      List<Booking__c> withTickets = [SELECT Id, (SELECT Id, Seat__c FROM Tickets) FROM Booking__c WHERE Venue__r.Name != null];
    }
    public static void purge(Set<Id> ids) {
      List<SObject> old = [SELECT Id FROM Ticket__c WHERE Booking__c IN :ids];
      delete old;
      delete [SELECT Id FROM Booking__c WHERE Id IN :ids];
      List<Task> tasks = new List<Task>();
      Database.delete(tasks, false);
    }
  }`);
  cls('BookingDto', `public with sharing class BookingDto {
    public class Line { @AuraEnabled public String seat { get; set; } @AuraEnabled public Integer count; }
    public static Line build() { return new Line(); }
  }`);
  cls('BookingController', `public with sharing class BookingController {
    @AuraEnabled(cacheable=true) public static List<Booking__c> list() { return [SELECT Id FROM Booking__c]; }
  }`);
  cls('CloseBookingAction', `public with sharing class CloseBookingAction {
    @InvocableMethod(label='Close') public static void close(List<Id> ids) { BookingService.purge(new Set<Id>(ids)); }
  }`);
  writeText(path.join(root, 'flows', 'Booking_Before_Save.flow-meta.xml'), `<?xml version="1.0" encoding="UTF-8"?><Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <processType>AutoLaunchedFlow</processType><status>Active</status><label>Booking before save</label>
    <start><object>Booking__c</object><triggerType>RecordBeforeSave</triggerType><recordTriggerType>CreateAndUpdate</recordTriggerType><connector><targetReference>Set_Status</targetReference></connector></start>
    <assignments><name>Set_Status</name><assignmentItems><assignToReference>$Record.Status__c</assignToReference><operator>Assign</operator><value><stringValue>Open</stringValue></value></assignmentItems></assignments>
  </Flow>`);
  const src = path.join(dir, 'force-app');
  return { dir, src, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('graph: relationship reads, child subqueries, deletes, before-save writes, @AuraEnabled properties, uncalled invocables', () => {
  const o = eventsOrg();
  try {
    const facts = extractFacts([o.src], {}, { base: o.dir });
    const g = buildGraph([o.src], facts, { base: o.dir });
    assert.ok(has(g, 'apex:BookingService', 'reads', 'object:Opportunity'));
    assert.ok(has(g, 'apex:BookingService', 'reads', 'object:Venue__c'), 'Venue__r.Capacity__c reads the parent object');
    assert.ok(has(g, 'apex:BookingService', 'reads', 'object:Ticket__c'), 'a child subquery (FROM Tickets) reads the child object');
    const del = g.edges.find((e) => e.from === 'apex:BookingService' && e.kind === 'writes' && e.to === 'object:Ticket__c');
    assert.deepEqual(del && del.ops, ['delete'], 'a List<SObject> assigned from a query is typed by its FROM');
    assert.ok(has(g, 'apex:BookingService', 'writes', 'object:Booking__c'), 'delete [SELECT … FROM Booking__c]');
    assert.ok(has(g, 'apex:BookingService', 'writes', 'object:Task'), 'Database.delete on a standard object the snapshot does not describe');
    const bs = g.edges.find((e) => e.from === 'flow:Booking_Before_Save' && e.kind === 'writes' && e.to === 'object:Booking__c');
    assert.ok(bs, 'a before-save flow assigning $Record fields writes its triggering record');
    assert.equal(bs.via, 'before-save');
    const kinds = (n) => g.nodes.find((x) => x.id === `apex:${n}`).kinds;
    assert.ok(!kinds('BookingDto').includes('auraEnabled') && kinds('BookingDto').includes('auraEnabledFields'), '@AuraEnabled on properties only is not a controller');
    assert.ok(kinds('BookingController').includes('auraEnabled'));
    assert.equal(g.nodes.find((x) => x.id === 'apex:CloseBookingAction').invocableUncalled, true, 'an invocable action no flow calls is flagged');
    // a before-save assignment does not save the record again: its triggers are not fired by it
    const chain = entryChains(g).find((c) => c.entry === 'Booking_Before_Save');
    assert.ok(chain.steps.some((s) => s.edge === 'writes' && s.via === 'before-save'));
    assert.ok(!chain.steps.some((s) => s.edge === 'fires'));
  } finally { o.cleanup(); }
  assert.deepEqual(apexKinds(['auraEnabled'], '@AuraEnabled public static Map<String, Object> load(Id x) {}'), ['auraEnabled']);
  assert.deepEqual(apexKinds(['auraEnabled', 'global'], 'public class W { @AuraEnabled public String a; }'), ['auraEnabledFields', 'global']);
});

test('fingerprints depend on the input data, never on what the parser derives', () => {
  const o = eventsOrg();
  const ctx = (base) => ({ project: base, cfg: { inputs: {} }, glossary: () => ({}), p: (...p) => path.join(base, 'tadforce', ...p) });
  try {
    const facts = extractFacts([o.src], {}, { base: o.dir });
    const g = buildGraph([o.src], facts, { base: o.dir });
    const plan = planUnderstanding(ctx(o.dir), facts, g, { dirs: [o.src] });
    // a parser that sees more edges (a new TADForce version) keeps every fingerprint
    const richer = { ...g, edges: [...g.edges, { from: 'apex:BookingController', to: 'object:Venue__c', kind: 'reads', via: 'soql' }] };
    const plan2 = planUnderstanding(ctx(o.dir), facts, richer, { dirs: [o.src] });
    assert.deepEqual(plan2.developer.map((d) => d.fingerprint), plan.developer.map((d) => d.fingerprint));
    assert.equal(plan2.analyst.fingerprint, plan.analyst.fingerprint);
    assert.equal(plan2.architect.fingerprint, plan.architect.fingerprint);
    // the same metadata elsewhere on disk: same fingerprints
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-graph-copy-'));
    try {
      copyDir(o.src, path.join(other, 'force-app'));
      const f2 = extractFacts([path.join(other, 'force-app')], {}, { base: other });
      const p3 = planUnderstanding(ctx(other), f2, buildGraph([path.join(other, 'force-app')], f2, { base: other }), { dirs: [path.join(other, 'force-app')] });
      assert.equal(p3.analyst.fingerprint, plan.analyst.fingerprint);
      assert.deepEqual(p3.developer.map((d) => d.fingerprint), plan.developer.map((d) => d.fingerprint));
    } finally { fs.rmSync(other, { recursive: true, force: true }); }
    // a change of the data redoes the task: a picklist value added, a class edited
    const field = path.join(o.src, 'main', 'default', 'objects', 'Booking__c', 'fields', 'Status__c.field-meta.xml');
    fs.writeFileSync(field, readText(field).replace('<value><fullName>Closed</fullName></value>', '<value><fullName>Closed</fullName></value><value><fullName>Cancelled</fullName></value>'));
    const f4 = extractFacts([o.src], {}, { base: o.dir });
    const p4 = planUnderstanding(ctx(o.dir), f4, buildGraph([o.src], f4, { base: o.dir }), { dirs: [o.src] });
    assert.notEqual(p4.analyst.fingerprint, plan.analyst.fingerprint);
    assert.notEqual(p4.architect.fingerprint, plan.architect.fingerprint);
    assert.notEqual(developerFingerprint([{ id: 'apex:A', hash: '1' }]), developerFingerprint([{ id: 'apex:A', hash: '2' }]));
  } finally { o.cleanup(); }
});

test('ground truth: edition, absent products and counts, schedules, users, systems, open questions', () => {
  const facts = extractFacts([SRC], {}, { base: FIXTURE });
  const ctx = { cfg: { document: { environment: 'Production' } }, glossary: () => ({ systems: [{ id: 'core', name: 'Core banking' }] }) };
  facts.counts.security.permissionSetGroups = 0;
  facts.org = {
    organization: { name: 'Org', edition: 'Developer Edition', sandbox: false },
    usersByProfile: [{ profile: 'System Administrator', users: 2 }, { profile: 'Advisor', users: 0 }],
    usersByRole: [{ role: null, users: 2 }],
    psgAssignments: [],
    scheduledJobs: [],
    volumes: [{ object: 'Branch__c', records: 0 }],
  };
  const model = { findings: [{ id: 'f-01', kind: 'question', text: 'Who calls the lead API?' }, { id: 'f-02', kind: 'debt', text: 'x' }] };
  const b = groundTruth(ctx, facts, model);
  const all = (k) => b[k].join('\n');
  assert.match(all('facts'), /Developer Edition/);
  assert.match(all('doNotClaim'), /Never call this org « Production »/);
  assert.match(all('doNotClaim'), /cover says « Production »/);
  assert.match(all('absent'), /Permission Set Groups/);
  assert.match(all('doNotClaim'), /Never mention Permission Set Groups/);
  assert.match(all('absent'), /Service Cloud/);
  assert.match(all('doNotClaim'), /portal/);
  assert.match(all('absent'), /scheduled jobs/);
  assert.match(all('doNotClaim'), /`CustomerSyncBatch`/, 'a Schedulable class with no job is never given a frequency');
  assert.match(all('facts'), /System Administrator \(2\)/);
  assert.match(all('doNotClaim'), /no active user holds a role/);
  assert.match(all('facts'), /Core banking/);
  assert.match(all('facts'), /Standard objects used: .*Account/);
  assert.match(all('doNotClaim'), /`Branch__c` — never describe them as holding business data/);
  assert.match(all('doNotClaim'), /Open question f-01/);
  assert.doesNotMatch(all('doNotClaim'), /f-02/);
  assert.match(briefMarkdown(b), /^# Ground truth of the org/);
  assert.equal(orgEnvironment({ sandbox: true, edition: 'Enterprise Edition' }), 'Sandbox');
  // scheduled: the class has a job; strong flags of the modules decide the products
  facts.org.scheduledJobs = [{ name: 'CustomerSyncBatch nightly', type: 'Scheduled Apex', cron: '0 0 2 * * ?' }];
  facts.modules = { ...facts.modules, strong: ['salesCloud'] };
  const b2 = groundTruth(ctx, facts, null);
  assert.doesNotMatch(b2.doNotClaim.join('\n'), /`CustomerSyncBatch`/);
  assert.match(b2.facts.join('\n'), /CustomerSyncBatch nightly \(Scheduled Apex, 0 0 2/);
  assert.match(b2.facts.join('\n'), /products in use: Sales Cloud\./);
  assert.match(b2.doNotClaim.join('\n'), /weak traces only.*OmniStudio/);
  // no org facts: nothing measured is claimed
  delete facts.org;
  assert.match(groundTruth(ctx, facts, null).doNotClaim.join('\n'), /org facts were not collected/);
});

test('figure ownership: one owner per figure, the others link', () => {
  const model = {
    processes: [{ id: 'loan-decision', name: 'Loan decision', domain: 'lending' }],
    domains: [{ id: 'lending', name: 'Lending', objects: ['LoanApplication__c'] }, { id: 'branches', name: 'Branches', objects: ['Branch__c'] }, { id: 'empty', name: 'Empty', objects: [] }],
    lifecycles: [{ id: 'loan-status', object: 'LoanApplication__c', field: 'Status__c' }, { id: 'branch-status', object: 'Branch__c', field: 'Status__c' }],
  };
  const o = figureOwnership(model);
  const owner = (d) => o.figures.find((f) => f.directive === d);
  assert.equal(owner('@@SEQ:loan-decision@@').owner, 'functional.processes');
  assert.equal(owner('@@SEQ:loan-decision@@').anchor, 'fn-loan-decision');
  assert.equal(owner('@@STATE:loan-status@@').owner, 'functional.processes', 'a lifecycle told with its process');
  assert.equal(owner('@@STATE:branch-status@@').owner, 'data.domains', 'a lifecycle without process goes with its domain');
  assert.equal(owner('@@ERD-DOMAIN:lending@@').anchor, 'data-lending');
  assert.ok(!owner('@@ERD-DOMAIN:empty@@'), 'no ERD for a domain without objects');
  assert.equal(new Set(o.figures.map((f) => f.directive)).size, o.figures.length, 'each figure has exactly one owner');
  const skeleton = { 'functional.processes': { doc: 'tad', chapter: '05' } };
  const g7 = groupFigures(o, ['application.sequences', 'application.layers'], skeleton);
  assert.deepEqual(g7.own, []);
  const link = g7.link.find((l) => l.directive === '@@SEQ:loan-decision@@');
  assert.equal(link.ref, '{{ref:fn-loan-decision}}');
  assert.equal(link.chapter, '05');
  const g5 = groupFigures(o, ['functional.domains', 'functional.processes'], skeleton);
  assert.deepEqual(g5.own.map((f) => f.directive), ['@@SEQ:loan-decision@@', '@@STATE:loan-status@@']);
  // an owner section absent from the outline hands the figure to the next candidate
  const o2 = figureOwnership(model, (id) => id !== 'data.domains');
  assert.equal(o2.figures.find((f) => f.directive === '@@ERD-DOMAIN:lending@@').owner, 'functional.domains');
});

test('context, parts, resume and the writers\' questions', () => {
  const md = '# Data {#ch-data}\n\nThe data model has three domains. More text.\n\n## Overview {#data-overview}\n\n@@ERD:overview@@\n\n| a | b |\n|---|---|\n\nAccounts are central to everything; leads come later.\n\n```mermaid\n# not a heading\n```\n';
  const ol = chapterOutline(md);
  assert.deepEqual(ol.headings, ['Data', 'Overview']);
  assert.deepEqual(ol.summary, ['The data model has three domains.', 'Accounts are central to everything; leads come later.']);
  const sections = ['a.1', 'a.2', 'a.3', 'a.4'].map((id) => ({ id }));
  const parts = sectionParts(sections);
  assert.deepEqual(parts.map((p) => p.sections), [['a.1', 'a.2', 'a.3'], ['a.4']]);
  assert.equal(sections[3].part, 2);
  const skeleton = { 'a.1': { doc: 'tad', chapter: '06' }, 'a.2': { doc: 'tad', chapter: '06' }, 'b.1': { doc: 'tad', chapter: '07' } };
  const r = resumeHint(skeleton, ['06'], 'tad', ['a.2']);
  assert.deepEqual(r.written, ['a.1']);
  assert.deepEqual(r.pending, ['a.2']);
  const w = makeWorkspace();
  try {
    const sk = skeletonMap(w.ctx);
    assert.equal(sk['functional.processes'].chapter, '05');
    assert.equal(sk['axes.register'].doc, 'axes');
    writeText(path.join(w.ws, 'understanding', 'questions.md'), [
      '# Questions', '',
      '- integration.systems: Which system receives the SMS?',
      '- integration.systems: Which system receives the SMS?',
      '- [operations.scheduled] Is the nightly sync scheduled in production?',
      '## data.volumes', '- Expected growth of loan applications?',
      '- Who calls the lead API?',
    ].join('\n'));
    const q = readQuestions(w.ctx);
    assert.equal(q.filter((x) => x.section === 'integration.systems').length, 1, 'deduplicated per section');
    assert.ok(q.some((x) => x.section === 'operations.scheduled'));
    assert.ok(q.some((x) => x.section === 'data.volumes' && /growth/.test(x.text)), 'a heading names the section of its bullets');
    writeJson(path.join(w.ws, 'understanding', 'model.json'), { findings: [{ id: 'f-01', kind: 'question', text: 'Who calls the lead API?' }] });
    const rep = finalReport(w.ctx);
    assert.equal(rep.questions[0].id, 'f-01');
    assert.equal(rep.questions.filter((x) => /lead API/.test(x.text)).length, 1, 'a question of the model is not repeated');
    assert.ok(rep.questions.some((x) => x.source === 'questions.md' && x.section === 'integration.systems'));
  } finally { w.cleanup(); }
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

test('build loop: write groups carry brief, figure ownership, context, parts and resume; the reviewer the brief', async () => {
  const w = makeWorkspace();
  try {
    let p = await buildJson(w.project);
    for (const t of p.tasks) {
      if (t.role === 'developer') writeJson(path.join(w.project, t.output.file), { task: t.id, fingerprint: t.fingerprint, cards: Object.fromEntries(t.components.map((c) => [c.id, { role: `Does ${c.id}`, triggeredBy: '', reads: [], writes: [], calls: [], notes: '' }])) });
      else writeJson(path.join(w.project, t.output.file), { task: 'analyst', fingerprint: t.fingerprint, actors: [], domains: [{ id: 'lending', name: 'Lending', summary: 'Loans', objects: ['LoanApplication__c'], components: ['LoanScoringService'], actors: [] }], lifecycles: [{ id: 'loan-status', object: 'LoanApplication__c', field: 'Status__c', states: [{ id: 'draft', label: 'Draft' }], initial: 'draft', final: [], transitions: [] }], findings: [] });
    }
    p = await buildJson(w.project);
    const arch = p.tasks[0];
    writeJson(path.join(w.project, arch.output.file), { task: 'architect', fingerprint: arch.fingerprint, processes: [{ id: 'loan-decision', name: 'Loan decision', domain: 'lending', summary: 's', trigger: 't', participants: [{ id: 'LoanScoringService', label: 'Scoring', kind: 'component' }, { id: 'LoanApplicationSelector', label: 'Selector', kind: 'component' }], steps: [{ from: 'LoanScoringService', to: 'LoanApplicationSelector', label: 'read', evidence: ['LoanScoringService'] }] }], findings: [{ id: 'f-01', kind: 'question', text: 'Who calls /leads/v1?', evidence: [] }] });

    p = await buildJson(w.project);
    assert.equal(p.phase, 'write');
    assert.ok(fs.existsSync(path.join(w.ws, 'understanding', 'brief.md')), 'understanding/brief.md');
    const figures = JSON.parse(readText(path.join(w.ws, 'understanding', 'figures.json')));
    assert.ok(figures.figures.some((f) => f.directive === '@@SEQ:loan-decision@@' && f.owner === 'functional.processes'));
    const g6 = p.groups.find((g) => g.id === 'tad-06');
    assert.ok(g6.brief.facts.length && Array.isArray(g6.brief.absent) && Array.isArray(g6.brief.doNotClaim));
    assert.match(g6.brief.doNotClaim.join('\n'), /Open question f-01/);
    assert.deepEqual(g6.figures.own.map((f) => f.directive), ['@@ERD-DOMAIN:lending@@']);
    assert.ok(g6.figures.link.some((l) => l.ref === '{{ref:fn-loan-decision}}' && l.chapter === '05'));
    assert.ok(!JSON.stringify(g6.model).includes('@@STATE:loan-status@@'), 'a figure owned by chapter 5 is not offered to chapter 6');
    const g9 = p.groups.find((g) => g.id === 'tad-09');
    assert.ok(!g9 || !(g9.model.figures || {}).sequences, 'the integration chapter links the sequences, it does not redraw them');
    assert.ok(g6.parts.length >= 2 && g6.sections.every((s) => s.part >= 1));
    assert.deepEqual(g6.resume.written, []);
    assert.deepEqual(g6.context, [], 'nothing written yet');

    // a writer interrupted in chapter 7: the next payload says what is already written
    const f7 = path.join(w.ws, 'src', 'tad', '07-application.md');
    const first = /<!--\s*tad:pending\s+([\w.-]+)\s*-->/.exec(readText(f7));
    fs.writeFileSync(f7, readText(f7).replace(first[0], 'The application layer is organised in services.'));
    const fill = (only) => {
      for (const doc of ['tad', 'axes']) {
        const dir = path.join(w.ws, 'src', doc);
        for (const f of fs.readdirSync(dir)) {
          if (only && (doc !== 'tad' || !only.includes(f.slice(0, 2)))) continue;
          const file = path.join(dir, f);
          fs.writeFileSync(file, readText(file).replace(/<!--\s*tad:pending\s+([\w.-]+)\s*-->/g, (m, id) => `The section ${id} is written from the model.`));
        }
      }
    };
    p = await buildJson(w.project);
    const g7 = p.groups.find((g) => g.id === 'tad-07');
    assert.deepEqual(g7.resume.written, [first[1]]);
    assert.ok(!g7.resume.pending.includes(first[1]));

    // chapter 5 knows what chapters 6 to 13 say
    fill(['06', '07', '08', '09', '10', '11', '12', '13']);
    p = await buildJson(w.project);
    const g5 = p.groups.find((g) => g.id === 'tad-05');
    assert.ok(g5.context.some((c) => c.chapter === '06' && c.headings.length && c.summary.some((s) => /written from the model/.test(s))));
    assert.ok(g5.figures.own.some((f) => f.directive === '@@SEQ:loan-decision@@' && f.anchor === 'fn-loan-decision'));

    // the Axes group gets the writers' questions
    writeText(path.join(w.ws, 'understanding', 'questions.md'), '- integration.systems: Which system receives the SMS?\n- integration.systems: Which system receives the SMS?\n');
    fill(['00', '01', '02', '03', '04', '05', '14', '15', '99']);
    p = await buildJson(w.project);
    assert.equal(p.groups[0].doc, 'axes');
    assert.deepEqual(p.groups[0].inputs.questions, [{ section: 'integration.systems', text: 'Which system receives the SMS?' }]);
    assert.ok(p.groups[0].context.some((c) => c.doc === 'tad'), 'the Axes writer knows the TAD');
    fill();

    // review: the brief and (when the check exists) the claims check
    p = await buildJson(w.project);
    assert.equal(p.phase, 'review');
    assert.ok(p.task.inputs.brief && Array.isArray(p.task.inputs.brief.doNotClaim));
    assert.ok(p.task.checks.some((c) => /ground truth/.test(c)));
    assert.ok(p.task.inputs.claims === undefined || typeof p.task.inputs.claims === 'object');
    writeJson(path.join(w.project, p.task.output.file), { version: 1, summary: 'ok', fixed: [], remaining: [] });
    p = await buildJson(w.project, { render: false, pdf: false, docx: false });
    assert.equal(p.phase, 'render');
    assert.ok(p.report.questions.some((q) => q.source === 'questions.md'), 'the writers\' questions reach the final report');
  } finally { w.cleanup(); }
});

test('claims check: absent module is skipped, present one is passed through', async () => {
  const { claimsOf } = await import('../src/commands/docs.js');
  const r = await claimsOf({}, []);
  assert.ok(r === null || (typeof r === 'object' && !Array.isArray(r)));
});
