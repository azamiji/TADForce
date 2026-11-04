// 0.6: evidence strength of the modules, Salesforce defaults and samples set aside, Apex layers, personas
// from permission sets, the runner repeated in hints, chapter 2 inputs sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractFacts } from '../src/facts/index.js';
import { apexLayer } from '../src/facts/extractors/apex.js';
import { assertSafeQuery } from '../src/sf/sf.js';
import { detectRunner, runnerForSpec, DEFAULT_RUNNER } from '../src/util/config.js';
import { buildDocument } from '../src/build/render.js';
import { loadWorkspace } from '../src/util/config.js';
import { writeJson, readJson } from '../src/util/fsx.js';
import { makeWorkspace, FIXTURE } from './helpers.js';

const SRC = path.join(FIXTURE, 'force-app');

/** A copy of the fixture with extra metadata files: { 'networks/X.network-meta.xml': '<Network>…' }. */
function withFiles(extra, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-ev-'));
  try {
    fs.cpSync(SRC, dir, { recursive: true });
    for (const [rel, body] of Object.entries(extra)) {
      const p = path.join(dir, 'main', 'default', rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, `<?xml version="1.0" encoding="UTF-8"?>\n${body}`);
    }
    return fn(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const xml = (root, inner) => `<${root} xmlns="http://soap.sforce.com/2006/04/metadata">${inner}</${root}>`;

test('apex: a controller has an @AuraEnabled METHOD; every class gets one layer, counted per layer', () => {
  const f = extractFacts([SRC], {}, { base: FIXTURE });
  const by = Object.fromEntries(f.apex.classes.map((c) => [c.name, c]));
  assert.ok(!by.CoreBankingClient.kinds.includes('auraEnabled'), '@AuraEnabled properties of a wrapper are not a controller');
  assert.ok(by.Customer360Controller.kinds.includes('auraEnabled'));
  assert.equal(by.Customer360Controller.layer, 'controllers');
  assert.equal(by.LeadTriggerHandler.layer, 'triggerHandlers');
  assert.equal(by.LoanApplicationSelector.layer, 'selectors');
  assert.equal(by.CustomerSyncBatch.layer, 'async');
  assert.equal(by.LeadApiResource.layer, 'webServices');
  assert.equal(by.SsoRegistrationHandler.layer, 'integration', 'an SSO handler is not a trigger handler');
  const L = f.counts.apex.layers;
  assert.equal(Object.values(L).reduce((a, b) => a + b, 0), f.counts.apex.classes + f.counts.apex.tests);
  assert.equal(L.tests, f.counts.apex.tests);
  assert.equal(apexLayer({ name: 'Billing', kinds: [] }, new Set(['Billing'])), 'triggerHandlers', 'a class a trigger calls');
});

test('Experience Cloud: an inactive site and the setting alone are weak; a live network is strong', () => {
  withFiles({
    'sites/Old_Portal.site-meta.xml': xml('CustomSite', '<active>false</active><siteType>ChatterNetwork</siteType>'),
    'settings/Communities.settings-meta.xml': xml('CommunitiesSettings', '<enableNetworksEnabled>true</enableNetworksEnabled>'),
  }, (dir) => {
    const m = extractFacts([dir], {}, {}).modules;
    assert.equal(m.experienceCloud, false);
    const w = m.weak.find((x) => x.id === 'experienceCloud');
    assert.ok(w && w.evidence.every((e) => e.strength === 'weak'));
  });
  withFiles({ 'networks/Partners.network-meta.xml': xml('Network', '<status>Live</status>') }, (dir) => {
    const m = extractFacts([dir], {}, {}).modules;
    assert.equal(m.experienceCloud, true);
    assert.ok(m.evidence.experienceCloud.some((e) => e.strength === 'strong' && /Partners/.test(e.what)));
    assert.ok(!m.weak.some((x) => x.id === 'experienceCloud'));
  });
});

test('Omni-Channel: the platform channels are set aside and prove nothing; a routing configuration does', () => {
  withFiles({
    'serviceChannels/sfdc_case.serviceChannel-meta.xml': xml('ServiceChannel', '<relatedEntityType>Case</relatedEntityType>'),
    'presenceUserConfigs/Default_Config.presenceUserConfig-meta.xml': xml('PresenceUserConfig', '<capacity>5</capacity>'),
  }, (dir) => {
    const f = extractFacts([dir], {}, {});
    assert.equal(f.modules.omniChannel, false);
    assert.equal(f.modules.serviceCloud, false);
    assert.ok(!(f.misc.named.serviceChannels || []).includes('sfdc_case'));
    assert.ok(f.salesforceShipped.reasons.some((r) => r.type === 'serviceChannel' && r.names.includes('sfdc_case')));
    assert.ok(f.modules.weak.some((x) => x.id === 'omniChannel'));
    assert.ok(!f.outline.includes('ui.omnichannel') || f.modules.cti);
  });
  withFiles({ 'queueRoutingConfigs/Loans_Routing.queueRoutingConfig-meta.xml': xml('QueueRoutingConfig', '<capacityWeight>1</capacityWeight>') }, (dir) => {
    assert.equal(extractFacts([dir], {}, {}).modules.omniChannel, true);
  });
});

test('Developer Edition samples and Salesforce defaults are set aside, with their reasons', () => {
  withFiles({
    'remoteSiteSettings/ApexDevNet.remoteSite-meta.xml': xml('RemoteSiteSetting', '<isActive>true</isActive><url>http://www.apexdevnet.com</url>'),
    'email/unfiled$public/SUPPORTSelfServiceNewCommentNotificationSAMPLE.email-meta.xml': xml('EmailTemplate', '<name>x</name>'),
    'email/unfiled$public/SupportCaseResponse.email-meta.xml': xml('EmailTemplate', '<name>x</name>'),
    'installedPackages/devedapp.installedPackage-meta.xml': xml('InstalledPackage', '<versionNumber>1.0</versionNumber>'),
    'escalationRules/Case.escalationRules-meta.xml': xml('EscalationRules', '<escalationRule><fullName>Standard Case Escalation</fullName><active>false</active></escalationRule>'),
    'pages/SiteLogin.page': '<apex:page controller="SiteLoginController"/>',
    'lightningExperienceThemes/Corporate_Theme.lightningExperienceTheme-meta.xml': xml('LightningExperienceTheme', '<defaultBrandingSet>Corporate</defaultBrandingSet>'),
  }, (dir) => {
    const org = { organization: { edition: 'Developer Edition' }, usersByRole: [{ role: null, users: 2 }] };
    const f = extractFacts([dir], {}, { org });
    const reasons = f.salesforceShipped.reasons;
    const has = (type, name) => reasons.some((r) => r.type === type && r.names.includes(name) && r.reason);
    assert.ok(has('remoteSite', 'ApexDevNet'));
    assert.ok(!f.integration.remoteSites.some((r) => r.name === 'ApexDevNet'));
    assert.ok(has('emailTemplate', 'SUPPORTSelfServiceNewCommentNotificationSAMPLE'));
    assert.ok(has('emailTemplate', 'SupportCaseResponse'));
    assert.ok(has('namespace', 'devedapp'));
    assert.ok(!f.namespaces.some((n) => n.namespace === 'devedapp'));
    assert.ok(has('escalationRule', 'Case.Standard Case Escalation'));
    assert.equal(f.automation.rules.escalationRules, 0);
    assert.ok(has('vfPage', 'SiteLogin'));
    assert.equal(f.modules.visualforce, false);
    assert.equal(f.counts.misc.emailTemplates, 1, 'only the project template is counted');
    assert.ok(f.inventory.includes('Corporate_Theme'), 'themes are in the inventory');
    // without org facts the edition is unknown: the edition-bound default rule stays
    assert.equal(extractFacts([dir], {}, {}).automation.rules.escalationRules, 1);
  });
});

const SAMPLE_ROLES = ['CEO', 'CFO', 'COO', 'SVPSalesMarketing', 'SVPHumanResources', 'VPMarketing', 'MarketingTeam'];
test('the sample role hierarchy is set aside only when no user holds a role', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-roles-'));
  try {
    fs.cpSync(SRC, dir, { recursive: true });
    const roles = path.join(dir, 'main', 'default', 'roles');
    fs.rmSync(roles, { recursive: true, force: true }); fs.mkdirSync(roles);
    for (const r of SAMPLE_ROLES) fs.writeFileSync(path.join(roles, `${r}.role-meta.xml`), xml('Role', `<name>${r}</name>`));
    const nobody = extractFacts([dir], {}, { org: { usersByRole: [{ role: null, users: 3 }] } });
    assert.equal(nobody.security.roleHierarchy.sample, true);
    assert.equal(nobody.counts.security.roles, 0);
    assert.ok(!nobody.outline.includes('security.roles'));
    assert.ok(nobody.salesforceShipped.reasons.some((r) => r.type === 'role' && r.names.includes('CEO')));
    const used = extractFacts([dir], {}, { org: { usersByRole: [{ role: 'CEO', users: 1 }, { role: null, users: 2 }] } });
    assert.equal(used.security.roleHierarchy.sample, false);
    assert.equal(used.counts.security.roles, SAMPLE_ROLES.length);
    assert.equal(extractFacts([dir], {}, {}).security.roleHierarchy.sample, false, 'never without org facts');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // the fixture's own hierarchy is never a sample
  assert.equal(extractFacts([SRC], {}, { org: { usersByRole: [{ role: null, users: 3 }] } }).security.roleHierarchy.sample, false);
});

test('personas fall back to permission sets when the org has no permission set group', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-ps-'));
  try {
    fs.cpSync(SRC, dir, { recursive: true });
    fs.rmSync(path.join(dir, 'main', 'default', 'permissionsetgroups'), { recursive: true, force: true });
    const org = { usersByPermissionSet: [{ permissionSet: 'NWB_Advisor', users: 12 }, { permissionSet: 'NWB_Branch_Manager', users: 0 }] };
    const p = extractFacts([dir], {}, { org }).security.personas;
    assert.deepEqual(p.map((x) => [x.name, x.kind, x.users]), [['NWB_Advisor', 'permissionSet', 12]]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const p = extractFacts([SRC], {}, {}).security.personas;
  assert.ok(p.length && p.every((x) => x.kind === 'permissionSetGroup'));
});

test('the users-per-permission-set aggregates pass the read-only guard', () => {
  const where = 'WHERE PermissionSet.IsOwnedByProfile = false AND PermissionSetGroupId = null AND Assignee.IsActive = true';
  assert.ok(assertSafeQuery(`SELECT PermissionSet.Name n, COUNT(Id) c FROM PermissionSetAssignment ${where} GROUP BY PermissionSet.Name`));
  assert.ok(assertSafeQuery(`SELECT PermissionSet.Name n, Assignee.UserRole.DeveloperName r, COUNT(Id) c FROM PermissionSetAssignment ${where} GROUP BY PermissionSet.Name, Assignee.UserRole.DeveloperName`));
  assert.throws(() => assertSafeQuery(`SELECT Assignee.Name FROM PermissionSetAssignment ${where}`));
});

test('the runner: npx with a git spec, npx from npm, a global install, a clone', () => {
  const sep = path.sep;
  const cache = ['', 'home', 'u', '.npm', '_npx', 'abc123'].join(sep);
  const root = path.join(cache, 'node_modules', 'tadforce');
  const spec = (s) => detectRunner({ root, env: {}, readJson: () => ({ dependencies: { tadforce: s } }) });
  assert.equal(spec('github:owner/TADForce'), 'npx -y github:owner/TADForce');
  assert.equal(spec('owner/TADForce#main'), 'npx -y owner/TADForce#main');
  assert.equal(spec('^0.6.0'), DEFAULT_RUNNER);
  assert.equal(runnerForSpec('git+https://example.com/owner/TADForce.git'), 'npx -y git+https://example.com/owner/TADForce.git');
  assert.equal(detectRunner({ root: path.join(sep + 'usr', 'local', 'lib', 'node_modules', 'tadforce'), env: {} }), 'tadforce');
  assert.equal(detectRunner({ root: path.join(sep + 'work', 'project', 'node_modules', 'tadforce'), env: {} }), DEFAULT_RUNNER);
  assert.match(detectRunner(), /^node ".*tadforce\.js"$/, 'this clone runs its own bin');
});

test('chapter 2 says « provided by » only when specifications were provided', async () => {
  const w = makeWorkspace();
  try {
    const html = async () => fs.readFileSync((await buildDocument(loadWorkspace(w.project), 'tad', { render: false })).html, 'utf8');
    assert.doesNotMatch(await html(), /inputs provided by/);
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.inputs.specs = ['knowledge/inputs/specs/spec.docx']; writeJson(p, cfg);
    assert.match(await html(), /inputs provided by Northwind Bank and Acme Integrators/);
  } finally { w.cleanup(); }
});

test('real-org shapes: users without a role come back as EMPTY_ID; Salesforce-shipped Experience bundles are weak', async () => {
  const { sampleRoleHierarchy } = await import('../src/facts/heuristics/shipped.js');
  const roles = ['CEO', 'CFO', 'COO', 'SVPSalesMarketing', 'VPMarketing', 'MarketingTeam'].map((name) => ({ name }));
  assert.equal(sampleRoleHierarchy({ security: { roles } }, { usersByRole: [{ role: 'EMPTY_ID', users: 8 }] }), true);
  assert.equal(sampleRoleHierarchy({ security: { roles } }, { usersByRole: [{ role: 'CEO', users: 1 }] }), false);
  const { detectModules } = await import('../src/facts/heuristics/modules.js');
  assert.equal(typeof detectModules, 'function');
});
