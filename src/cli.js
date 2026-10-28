import path from 'node:path';
import { parseArgs } from './util/args.js';
import { log, c, setQuiet } from './util/log.js';
import { readJson } from './util/fsx.js';
import { PKG_ROOT } from './util/paths.js';
import * as initCmd from './commands/init.js';
import * as doctorCmd from './commands/doctor.js';
import * as org from './commands/org.js';
import * as docs from './commands/docs.js';
import * as specCmd from './commands/spec.js';

const COMMANDS = {
  init: [initCmd.run, 'Create the workspace, install the agent skills, check prerequisites'],
  doctor: [doctorCmd.run, 'Check prerequisites (Node, sf CLI, browser, SFDX project, authorized org)'],
  auth: [org.auth, 'Authorize an org in the browser (human action) and save its alias'],
  detect: [org.detect, 'Print org facts that answer the startup questions (JSON)'],
  manifest: [org.manifest, 'Build the wildcard manifest filtered on what the org supports'],
  retrieve: [org.retrieve, 'Retrieve the manifest into tadforce/.snapshot (force-app untouched)'],
  facts: [docs.facts, 'Extract facts.json from the metadata (--org adds aggregated org facts)'],
  prepare: [docs.prepare, 'manifest → retrieve → facts --org → scaffold, in one go'],
  scaffold: [docs.scaffold, 'Copy the chapter skeletons into tadforce/src (existing files kept)'],
  next: [specCmd.next, 'Next section to write, with its specification and the facts to use (--json)'],
  spec: [specCmd.spec, 'Specification of one section (tadforce spec data.domains) — no id lists them all'],
  build: [docs.build, 'Build HTML (+ --pdf --docx) and validate'],
  validate: [docs.validate, 'Check the document: pending sections, placeholders, identifiers, glossary, secrets, anchors'],
  comments: [docs.comments, 'List the review comments saved in a built HTML file'],
  status: [docs.status, 'Where the workspace stands'],
  'install-skills': [async (a) => { const d = initCmd.installSkills(path.resolve(a.cwd || process.cwd()), a.agents ? String(a.agents).split(',') : null); log.ok(`Skills installed in ${d.join(', ')}`); return 0; }, 'Install or update the agent skills (--agents claude,agents,cursor…)'],
};

function help() {
  const v = readJson(path.join(PKG_ROOT, 'package.json')).version;
  console.log(`${c.violet('▲')} ${c.bold('TADForce')} ${v} — the architect's scribe for Salesforce orgs. ${c.dim('No evidence, no sentence.')}\n`);
  console.log(`Usage: ${c.bold('npx tadforce <command> [options]')}\n`);
  for (const [k, [, d]] of Object.entries(COMMANDS)) console.log(`  ${c.cyan(k.padEnd(15))} ${d}`);
  console.log(`\nCommon options: --cwd <dir>  --org <alias>  --doc tad|axes|all  --json  --quiet`);
  console.log(`Start here:     ${c.bold('npx tadforce init')}   then type ${c.bold('/tadforce')} in your AI agent.\n`);
}

export async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (args.quiet) setQuiet(true);
  if (args.version || args.v) { console.log(readJson(path.join(PKG_ROOT, 'package.json')).version); return 0; }
  if (!cmd || cmd === 'help' || args.help || args.h) { help(); return 0; }
  const entry = COMMANDS[cmd];
  if (!entry) { log.fail(`Unknown command "${cmd}".`); help(); return 1; }
  if (args.cwd) args.cwd = path.resolve(args.cwd);
  try {
    return (await entry[0](args)) || 0;
  } catch (e) {
    log.fail(e.message);
    if (process.env.TADFORCE_DEBUG) console.error(e.stack);
    return 1;
  }
}
