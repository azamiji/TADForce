import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractFacts } from '../src/facts/index.js';
import { scanApex, restMapping } from '../src/facts/extractors/apex.js';
import { computeCoverage, coverageByCount, retrieveCompleteness } from '../src/facts/coverage.js';
import { jobTypeLabel, shapeJobs } from '../src/facts/org.js';
import { buildQuestions } from '../src/commands/docs.js';
import { buildAnswer } from '../src/commands/doctor.js';
import { assertSafeQuery } from '../src/sf/sf.js';
import { writeInventoryXlsx, crc32 } from '../src/build/xlsx.js';
import { FIXTURE } from './helpers.js';

const SRC = path.join(FIXTURE, 'force-app');

test('a count whose folder was not collected is « missing », never a measured 0', () => {
  const f = extractFacts([SRC], {}, { base: FIXTURE });
  assert.equal(f.counts.ui.vfPages, 0, 'counts stay numbers');
  assert.equal(f.coverage.pages.collected, false);
  assert.equal(f.coverageByCount['ui.vfPages'], 'missing');
  assert.equal(f.coverageByCount['apex.classes'], 'collected');
  assert.equal(f.coverage.classes.collected, true);
  assert.ok(f.coverage.classes.files > 0);
  // TADForce's own retrieve asked for ApexPage and it did not fail: a measured 0; a failed type stays missing
  const roots = [path.join(SRC, 'main', 'default')];
  const cov = computeCoverage(roots, { requested: ['ApexPage', 'PermissionSet'], failed: ['AuraDefinitionBundle'], dropped: [] });
  assert.equal(cov.pages.collected, true);
  assert.equal(cov.aura.collected, false);
  assert.equal(coverageByCount({ ui: { vfPages: 0, aura: 0 } }, cov)['ui.aura'], 'missing');
});

test('post-retrieve check: requested types that came back empty are listed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-cov-'));
  try {
    fs.mkdirSync(path.join(dir, 'classes'));
    fs.writeFileSync(path.join(dir, 'classes', 'A.cls'), 'x');
    const r = retrieveCompleteness(['ApexClass', 'PermissionSet', 'Profile'], dir, ['Profile']);
    assert.equal(r.byType.ApexClass.files, 1);
    assert.deepEqual(r.empty, ['PermissionSet'], 'a failed type is reported as failed, not as empty');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('@RestResource urlMapping: a /* in the mapping never swallows the code', () => {
  const src = "@RestResource(urlMapping='/ObjectFieldsAPI/*')\nglobal with sharing class ObjectFieldsAPI {\n  /** doc */\n  @HttpGet global static String get() { return 'x'; }\n}";
  const { code, strings } = scanApex(src);
  assert.equal(restMapping(code, strings), '/ObjectFieldsAPI/*');
  const two = scanApex("// '/old/*'\n@RestResource( urlMapping = '/v2/items' ) global class X {}");
  assert.equal(restMapping(two.code, two.strings), '/v2/items');
  assert.equal(restMapping(scanApex('public class Y {}').code, []), null);
});

test('scheduled jobs: readable types, Salesforce\'s own jobs set aside', () => {
  assert.equal(jobTypeLabel('7'), 'Scheduled Apex');
  assert.equal(jobTypeLabel('A'), 'Reporting Notification');
  assert.equal(jobTypeLabel('+'), 'Other (code +)');
  const j = shapeJobs([
    { CronJobDetail: { Name: 'Nightly sync', JobType: '7' }, State: 'WAITING', CronExpression: '0 0 2 * * ?', CreatedBy: { Name: 'Jane Admin', UserType: 'Standard' } },
    { CronJobDetail: { Name: 'Metalytics Daily', JobType: '+' }, State: 'WAITING' },
    { CronJobDetail: { Name: 'SRT Semantic Graph refresh', JobType: 'A' }, State: 'WAITING' },
    { CronJobDetail: { Name: 'Some job', JobType: '9' }, State: 'WAITING', CreatedBy: { Name: 'Automated Process', UserType: 'AutomatedProcess' } },
  ]);
  assert.deepEqual(j.scheduledJobs.map((x) => [x.name, x.type]), [['Nightly sync', 'Scheduled Apex']]);
  assert.equal(j.internal.length, 3);
});

test('org aggregates stay aggregates', () => {
  for (const q of ['SELECT UserRole.DeveloperName r, COUNT(Id) c FROM User WHERE IsActive = true GROUP BY UserRole.DeveloperName',
    'SELECT PermissionSetGroup.DeveloperName g, Assignee.UserRole.DeveloperName r, COUNT(Id) c FROM PermissionSetAssignment WHERE PermissionSetGroupId != null AND Assignee.IsActive = true GROUP BY PermissionSetGroup.DeveloperName, Assignee.UserRole.DeveloperName',
    "SELECT CreatedBy.Name, CreatedBy.UserType, CronJobDetail.Name, CronJobDetail.JobType, State, CronExpression, NextFireTime FROM CronTrigger WHERE State NOT IN ('DELETED','COMPLETE')"]) assert.ok(assertSafeQuery(q), q);
  assert.throws(() => assertSafeQuery('SELECT UserRole.Name, Username FROM User GROUP BY UserRole.Name'));
});

/** The fixture plus what pollutes a real org's scope. */
function polluted() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-scope-'));
  fs.cpSync(SRC, dir, { recursive: true });
  const d = path.join(dir, 'main', 'default');
  const obj = (n, xml = '<CustomObject><label>x</label><sharingModel>ReadWrite</sharingModel></CustomObject>') => { fs.mkdirSync(path.join(d, 'objects', n), { recursive: true }); fs.writeFileSync(path.join(d, 'objects', n, `${n}.object-meta.xml`), xml); };
  const cls = (n) => { fs.writeFileSync(path.join(d, 'classes', `${n}.cls`), `public class ${n} {}`); fs.writeFileSync(path.join(d, 'classes', `${n}.cls-meta.xml`), '<ApexClass><apiVersion>62.0</apiVersion></ApexClass>'); };
  const lwc = (n, meta = '') => { fs.mkdirSync(path.join(d, 'lwc', n), { recursive: true }); fs.writeFileSync(path.join(d, 'lwc', n, `${n}.js`), 'export default class X {}'); fs.writeFileSync(path.join(d, 'lwc', n, `${n}.js-meta.xml`), `<LightningComponentBundle>${meta}</LightningComponentBundle>`); };
  for (const n of ['Log__c', 'LogEntry__c', 'LoggerTag__c', 'Pipeline__c', 'User_Story__c', 'Shopping_List__c', 'Test__c', 'Contract', 'WorkTypeGroup']) obj(n);
  for (const n of ['Logger', 'LogEntryEventBuilder', 'fflib_SObjectDomain', 'HelloWorldController']) cls(n);
  lwc('cfAccountSummary'); lwc('daTechnologiesOnboardingEnglish'); lwc('logViewer'); lwc('omniThing', '<runtimeNamespace>omnistudio</runtimeNamespace>');
  return dir;
}

test('scope: libraries, OmniStudio-generated LWC, DevOps objects, demos and unused standard objects are proposed with « exclude »', () => {
  const dir = polluted();
  try {
    const f = extractFacts([dir], {}, {});
    const cat = Object.fromEntries(f.exclusions.candidates.map((c) => [c.name, c.category]));
    for (const n of ['Log__c', 'LogEntry__c', 'LoggerTag__c', 'Logger', 'LogEntryEventBuilder', 'logViewer', 'fflib_SObjectDomain']) assert.equal(cat[n], 'library', n);
    for (const n of ['cfAccountSummary', 'daTechnologiesOnboardingEnglish', 'omniThing']) assert.equal(cat[n], 'omnistudio-generated', n);
    for (const n of ['Pipeline__c', 'User_Story__c']) assert.equal(cat[n], 'devops', n);
    for (const n of ['Shopping_List__c', 'Test__c', 'HelloWorldController', 'demoCarousel']) assert.equal(cat[n], 'demo', n);
    for (const n of ['Contract', 'WorkTypeGroup']) assert.equal(cat[n], 'standard-unused', n);
    for (const n of ['Account', 'Lead', 'LoanApplication__c', 'Branch__c', 'customer360', 'LoanScoringService']) assert.equal(cat[n], undefined, `${n} is the project's`);
    assert.ok(!f.data.owd.some((o) => o.object === 'Contract'), 'sharing defaults: only objects the project uses');
    assert.ok(f.data.owd.some((o) => o.object === 'Account'));
    const q = buildQuestions(f, null);
    const lib = q.exclusions.groups.find((g) => /Nebula Logger/.test(g.reason));
    assert.equal(lib.recommended, 'exclude');
    assert.equal(q.exclusions.groups.find((g) => /look|not placed/.test(g.reason))?.recommended ?? 'none', 'none', 'a mere suspicion is never recommended');
    // accepted: they vanish from facts and counts
    const g = extractFacts([dir], { exclusions: { exclude: f.exclusions.candidates.filter((c) => c.category).map((c) => ({ name: c.name, type: c.type })) } }, {});
    assert.ok(!g.data.objects.some((o) => ['Log__c', 'Pipeline__c', 'Contract'].includes(o.name)));
    assert.equal(g.counts.ui.lwc, f.counts.ui.lwc - 5);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the inventory workbook is a valid XLSX with one sheet per family', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-xlsx-'));
  try {
    const f = extractFacts([SRC], {}, { base: FIXTURE });
    const out = path.join(dir, 'TAD_NWB_inventory.xlsx');
    const r = writeInventoryXlsx({}, f, out);
    const buf = fs.readFileSync(out);
    assert.equal(buf.readUInt32LE(0), 0x04034b50, 'a ZIP archive');
    // read back the stored entries and check their CRC
    const files = {};
    for (let o = 0; buf.readUInt32LE(o) === 0x04034b50;) {
      const size = buf.readUInt32LE(o + 18), nameLen = buf.readUInt16LE(o + 26), extra = buf.readUInt16LE(o + 28);
      const name = buf.slice(o + 30, o + 30 + nameLen).toString('utf8');
      const data = buf.slice(o + 30 + nameLen + extra, o + 30 + nameLen + extra + size);
      assert.equal(crc32(data), buf.readUInt32LE(o + 14), name);
      files[name] = data.toString('utf8');
      o += 30 + nameLen + extra + size;
    }
    assert.ok(files['[Content_Types].xml'] && files['xl/workbook.xml'] && files['xl/styles.xml']);
    for (const s of ['Summary', 'Apex classes', 'LWC', 'Permission set groups', 'Objects']) assert.match(files['xl/workbook.xml'], new RegExp(`name="${s}"`), s);
    assert.ok(!/name="Visualforce"/.test(files['xl/workbook.xml']), 'empty families are left out');
    assert.equal(r.sheets.length, Object.keys(files).filter((k) => k.startsWith('xl/worksheets/')).length);
    assert.match(files['xl/worksheets/sheet1.xml'], /not collected/, 'the summary says what was not collected');
    assert.match(Object.values(files).join(''), /LoanScoringService/);
    assert.deepEqual(fs.readFileSync(out), writeInventoryXlsx({}, f, out) && fs.readFileSync(out), 'same facts, same bytes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('doctor: the launch-build answer', () => {
  assert.equal(buildAnswer({}), null);
  assert.equal(buildAnswer({ build: 'yes' }), true);
  assert.equal(buildAnswer({ build: 'no' }), false);
  assert.equal(buildAnswer({ build: false }), false);
  assert.equal(buildAnswer({ yes: true }), true);
});
