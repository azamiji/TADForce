import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractFacts } from '../src/facts/index.js';
import { stableStringify } from '../src/util/fsx.js';
import { FIXTURE } from './helpers.js';

const SRC = [path.join(FIXTURE, 'force-app')];
const run = (k = {}) => extractFacts(SRC, k, { base: FIXTURE });

test('facts are deterministic, byte for byte', () => {
  assert.equal(stableStringify(run()), stableStringify(run()));
});

test('facts match the golden file', () => {
  const golden = path.join(FIXTURE, 'facts.golden.json');
  const actual = stableStringify(run());
  if (process.env.UPDATE_GOLDEN) fs.writeFileSync(golden, actual);
  assert.equal(actual, fs.readFileSync(golden, 'utf8'), 'facts changed: review, then UPDATE_GOLDEN=1 npm run test:unit');
});

test('counts of the fixture', () => {
  const c = run().counts;
  assert.equal(c.apex.classes, 13);
  assert.equal(c.apex.tests, 5);
  assert.equal(c.apex.triggers, 2);
  assert.equal(c.flows.active, 3);
  assert.equal(c.ui.lwc, 5);
  assert.equal(c.objects.custom, 4);
  assert.equal(c.security.permissionSetGroups, 3);
  assert.equal(c.integration.restResources, 1);
});

test('apex kinds and sharing are read from the code', () => {
  const byName = Object.fromEntries(run().apex.classes.map((x) => [x.name, x]));
  assert.ok(byName.CustomerSyncBatch.kinds.includes('batch'));
  assert.ok(byName.CustomerSyncBatch.kinds.includes('schedulable'));
  assert.equal(byName.CustomerSyncBatch.sharing, 'without');
  assert.equal(byName.LeadApiResource.restUrl, '/leads/v1/*');
  assert.deepEqual(byName.CoreBankingClient.namedCredentials, ['NWB_CoreBanking']);
  assert.ok(byName.SsoRegistrationHandler.kinds.includes('registrationHandler'));
  assert.equal(byName.LoanScoringServiceTest.test, true);
});

test('products are detected from evidence, not assumed', () => {
  const m = run().modules;
  assert.equal(m.financialServices, true); // FinServ namespace reference
  assert.equal(m.omnistudio, true);
  assert.equal(m.events, true);
  assert.equal(m.salesCloud, true);
  assert.equal(m.serviceCloud, false);
  assert.equal(m.commerce, false);
  assert.ok(m.clouds.every((c) => c.evidence.length > 0));
});

test('declared products from the glossary are added', () => {
  const m = run({ glossary: { products: [{ id: 'marketingCloud', name: 'Marketing Cloud Engagement', reference: 'marketing' }] } }).modules;
  assert.equal(m.marketingCloud, true);
  assert.ok(m.clouds.some((c) => c.name === 'Marketing Cloud Engagement' && c.evidence[0] === 'declared'));
});

test('unused components are proposed, never removed by heuristics', () => {
  const f = run();
  const names = f.exclusions.candidates.map((c) => c.name);
  for (const n of ['demoCarousel', 'DemoDataLoader', 'LegacyRateHelper', 'Old_Branch_Survey']) assert.ok(names.includes(n), n);
  assert.ok(f.ui.lwc.some((l) => l.name === 'demoCarousel'));
  assert.ok(!names.includes('LeadApiResource'), 'REST entry points are never flagged');
});

test('human exclusions remove components from lists and counts', () => {
  const f = run({ exclusions: { exclude: [{ name: 'demo*', reason: 'demo' }], features: [{ name: 'Old survey', components: ['Old_Branch_Survey'] }] } });
  assert.ok(!f.ui.lwc.some((l) => l.name === 'demoCarousel'));
  assert.ok(!f.apex.classes.some((c) => c.name === 'DemoDataLoader'));
  assert.ok(!f.automation.flows.some((x) => x.name === 'Old_Branch_Survey'));
  assert.equal(f.counts.ui.lwc, 4);
  assert.equal(f.exclusions.applied.length, 3);
});

test('external systems are named only from the glossary', () => {
  const f = run({ glossary: { systems: [{ id: 'core', name: 'Core banking', match: ['NWB_CoreBanking'] }] } });
  assert.equal(f.systems.named.length, 1);
  assert.equal(f.systems.named[0].endpoints[0].name, 'NWB_CoreBanking');
  assert.ok(f.systems.unnamed.every((e) => e.name !== 'NWB_CoreBanking'));
});

test('LWC placement is traced across pages, components, tabs and OmniScripts', () => {
  const by = Object.fromEntries(run().ui.lwc.map((l) => [l.name, l.placedIn.map((p) => p.kind)]));
  assert.deepEqual(by.customer360, ['flexipage']);
  assert.deepEqual(by.loanWizard, ['tab']);
  assert.deepEqual(by.positionTile.sort(), ['lwc', 'omniScript']);
  assert.deepEqual(by.demoCarousel, []);
});
