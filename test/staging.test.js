import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stagingDir, moveTree } from '../src/commands/org.js';

// The Salesforce CLI writes nothing when --output-dir is in a hidden folder: the retrieve goes through a visible one.
test('a hidden snapshot folder is retrieved through a visible staging folder', () => {
  const project = path.join(os.tmpdir(), 'tf-staging');
  const ctx = { project, ws: path.join(project, 'tadforce') };
  assert.equal(stagingDir(ctx, path.join(ctx.ws, '.snapshot', 'source')), path.join(ctx.ws, 'retrieve-staging'));
  assert.equal(stagingDir(ctx, path.join(ctx.ws, 'snapshot')), path.join(ctx.ws, 'snapshot'));
  const hiddenWs = { project, ws: path.join(project, '.tadforce') };
  assert.equal(stagingDir(hiddenWs, path.join(hiddenWs.ws, '.snapshot', 'source')), path.join(project, 'retrieve-staging'));
});

test('moveTree merges a batch into the snapshot, later files win', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-move-'));
  const from = path.join(root, 'staging'), to = path.join(root, '.snapshot', 'source');
  fs.mkdirSync(path.join(from, 'main', 'default', 'classes'), { recursive: true });
  fs.mkdirSync(path.join(to, 'main', 'default', 'classes'), { recursive: true });
  fs.writeFileSync(path.join(to, 'main', 'default', 'classes', 'Old.cls'), 'old');
  fs.writeFileSync(path.join(to, 'main', 'default', 'classes', 'A.cls'), 'v1');
  fs.writeFileSync(path.join(from, 'main', 'default', 'classes', 'A.cls'), 'v2');
  moveTree(from, to);
  assert.equal(fs.readFileSync(path.join(to, 'main', 'default', 'classes', 'A.cls'), 'utf8'), 'v2');
  assert.ok(fs.existsSync(path.join(to, 'main', 'default', 'classes', 'Old.cls')));
  fs.rmSync(root, { recursive: true, force: true });
});
