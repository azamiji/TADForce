import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson, writeText } from '../src/util/fsx.js';
import { isAllowed } from '../src/sf/sf.js';
import { makeWorkspace, ROOT } from './helpers.js';

/** Point TADForce at the fake Salesforce CLI of test/fake-sf.js. */
function fakeSf(dir) {
  const js = path.join(ROOT, 'test', 'fake-sf.js');
  if (process.platform === 'win32') {
    const bin = path.join(dir, 'fake-sf.cmd');
    fs.writeFileSync(bin, `@node "${js}" %*\r\n`);
    return bin;
  }
  const bin = path.join(dir, 'fake-sf');
  fs.writeFileSync(bin, `#!/bin/sh\nexec node "${js}" "$@"\n`, { mode: 0o755 });
  return bin;
}

test('a core type too big for one retrieve is retrieved by chunks of listed components', async () => {
  const w = makeWorkspace();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-fakesf-'));
  const saved = { bin: process.env.TADFORCE_SF_BIN, log: process.env.FAKE_SF_LOG };
  try {
    process.env.TADFORCE_SF_BIN = fakeSf(tmp);
    process.env.FAKE_SF_LOG = path.join(tmp, 'calls.log');
    const p = path.join(w.ws, 'tadforce.config.json');
    const cfg = readJson(p); cfg.org.alias = 'fake'; cfg.source.dir = path.join(tmp, 'snapshot'); writeJson(p, cfg);
    writeText(path.join(w.ws, '.snapshot', 'package.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n    <types>\n        <members>*</members>\n        <members>Account</members>\n        <name>CustomObject</name>\n    </types>\n    <version>62.0</version>\n</Package>\n');
    const { retrieve } = await import('../src/commands/org.js');
    const { setQuiet } = await import('../src/util/log.js');
    setQuiet(true);
    const code = await retrieve({ cwd: w.project });
    setQuiet(false);
    assert.equal(code, 0);
    const calls = fs.readFileSync(process.env.FAKE_SF_LOG, 'utf8').trim().split('\n');
    assert.equal(calls.filter((c) => c.startsWith('org list metadata')).length, 1, 'components listed once');
    assert.equal(calls.filter((c) => c.startsWith('project retrieve start')).length, 1 + 3, 'one timed-out try, then 252 components by chunks of 100');
    const got = fs.readdirSync(path.join(tmp, 'snapshot', 'objects'));
    assert.equal(got.length, 252, 'listed objects + the explicit Account, the package component left out');
    assert.ok(got.includes('standard__Shipped') && !got.includes('pkg__Thing__c'));
    assert.deepEqual(readJson(path.join(w.ws, '.snapshot', 'retrieve-report.json')).failed, []);
  } finally {
    if (saved.bin === undefined) delete process.env.TADFORCE_SF_BIN; else process.env.TADFORCE_SF_BIN = saved.bin;
    if (saved.log === undefined) delete process.env.FAKE_SF_LOG; else process.env.FAKE_SF_LOG = saved.log;
    w.cleanup(); fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('only commands that exist in the Salesforce CLI are allowed (no « project retrieve resume »)', () => {
  assert.equal(isAllowed(['project', 'retrieve', 'resume', '--job-id', 'x']), false);
  assert.equal(isAllowed(['project', 'retrieve', 'start', '--manifest', 'p.xml']), true);
});
