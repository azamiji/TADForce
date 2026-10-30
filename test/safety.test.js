import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isAllowed, assertSafeQuery } from '../src/sf/sf.js';
import { TEMPLATES } from '../src/util/paths.js';

test('only read-only sf commands are allowed', () => {
  for (const ok of [['org', 'list'], ['org', 'display', '--target-org', 'x'], ['org', 'list', 'metadata', '--metadata-type', 'Report'], ['project', 'retrieve', 'start', '--manifest', 'p.xml'], ['data', 'query', '--query', 'q'], ['config', 'get', 'target-org'], ['--version']]) assert.ok(isAllowed(ok), ok.join(' '));
  for (const ko of [['project', 'deploy', 'start'], ['org', 'delete', 'scratch'], ['data', 'delete', 'record'], ['apex', 'run'], ['data', 'import', 'tree'], ['project', 'delete', 'source'], ['org', 'logout'], ['config', 'set', 'target-org', 'x'], ['config', 'get', 'target-org;', 'rm']]) assert.ok(!isAllowed(ko), ko.join(' '));
});

test('SOQL never reads business records', () => {
  for (const ok of ['SELECT COUNT() FROM Loan__c', 'SELECT MAX(CreatedDate) d FROM Account', 'SELECT Profile.Name p, COUNT(Id) c FROM User WHERE IsActive = true GROUP BY Profile.Name', 'SELECT Name, IsSandbox FROM Organization', 'SELECT PercentCovered FROM ApexOrgWideCoverage']) assert.ok(assertSafeQuery(ok), ok);
  for (const ko of ['SELECT Id, Name FROM Account', 'SELECT Name FROM User', 'SELECT Status__c, COUNT(Id) FROM Loan__c GROUP BY Status__c', 'DELETE FROM Account', 'SELECT Email FROM Contact LIMIT 1']) assert.throws(() => assertSafeQuery(ko), ko);
});

test('English and French dictionaries have the same keys', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k]));
  const en = keys(JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'i18n', 'en.json'), 'utf8'))).sort();
  const fr = keys(JSON.parse(fs.readFileSync(path.join(TEMPLATES, 'i18n', 'fr.json'), 'utf8'))).sort();
  assert.deepEqual(fr, en);
});

test('English and French skeletons share the same anchors and pending sections', () => {
  for (const doc of ['tad', 'axes']) {
    const collect = (lang) => {
      const dir = path.join(TEMPLATES, doc, lang);
      const text = fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
      return { anchors: [...text.matchAll(/#([\w-]+)[\s}]/g)].map((m) => m[1]).filter((a) => !/^[0-9a-f]{6}$/i.test(a)), pending: [...text.matchAll(/tad:pending ([\w.]+)/g)].map((m) => m[1]), directives: [...text.matchAll(/@@([A-Z]+(?::[\w,-]+)?)/g)].map((m) => m[1]) };
    };
    const en = collect('en'), fr = collect('fr');
    assert.deepEqual(fr.anchors, en.anchors, `${doc} anchors`);
    assert.deepEqual(fr.pending, en.pending, `${doc} pending`);
    assert.deepEqual(fr.directives, en.directives, `${doc} directives`);
  }
});
