import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig, loadWorkspace } from '../src/util/config.js';
import { writeJson, writeText, copyDir } from '../src/util/fsx.js';
import { extractFacts } from '../src/facts/index.js';
import { TEMPLATES } from '../src/util/paths.js';
import YAML from 'yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'northwind');

/** A throw-away project with a TADForce workspace built on the fixture metadata. */
export function makeWorkspace({ lang = 'en', exclusions = {}, glossary = {} } = {}) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-test-'));
  const ws = path.join(project, 'tadforce');
  writeJson(path.join(ws, 'tadforce.config.json'), defaultConfig({
    language: lang,
    client: { name: 'Northwind Bank', short: 'NWB' },
    integrator: { name: 'Acme Integrators' },
    document: { date: '2026-01-15' },
    source: { dir: path.relative(ws, path.join(FIXTURE, 'force-app')) },
  }));
  writeText(path.join(ws, 'knowledge', 'exclusions.yml'), YAML.stringify(exclusions));
  writeText(path.join(ws, 'knowledge', 'glossary.yml'), YAML.stringify(glossary));
  const facts = extractFacts([path.join(FIXTURE, 'force-app')], { exclusions, glossary }, { base: FIXTURE });
  writeJson(path.join(ws, 'facts', 'facts.json'), facts);
  for (const doc of ['tad', 'axes']) copyDir(path.join(TEMPLATES, doc, lang), path.join(ws, 'src', doc));
  return { project, ws, ctx: loadWorkspace(project), facts, cleanup: () => fs.rmSync(project, { recursive: true, force: true }) };
}
