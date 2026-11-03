import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { exists, writeText, writeJson, copyDir, readJson } from '../util/fsx.js';
import { defaultConfig, findWorkspace } from '../util/config.js';
import { WORKSPACE_DIR, CONFIG_FILE, SKILLS } from '../util/paths.js';
import { LANGUAGES, normalizeLang } from '../util/i18n.js';
import { log } from '../util/log.js';
import { run as doctor } from './doctor.js';

const GLOSSARY = `# TADForce glossary — the client's vocabulary is law.
# terms:   terminology imposed by the client. \`tadforce validate\` fails when an "avoid" form appears.
# systems: names of the systems Salesforce talks to. Never guessed: confirmed by a human.
#          "match" lists named credentials, remote sites, auth providers… or hosts (api.example.com).
# actors:  user populations shown on the context view.
terms: []
#  - use: "API Gateway"
#    avoid: ["API passerelle"]
#    definition: "Single entry point exposing the bank's internal services."
systems: []
#  - id: core-banking
#    name: "Core banking"
#    description: "System of record for accounts and contracts"
#    match: ["Core_Banking_NC", "api.core.example.com"]
actors: []
#  - name: "Branch advisors"
#    channel: "Branch console"
# allow: technical terms quoted in code font on purpose, unknown to the metadata (API payload fields, external IDs…)
allow: []
# products: Salesforce products used without trace in the metadata (reference: a file of skills/tadforce/references/modules/)
products: []
#  - id: marketingCloud
#    name: "Marketing Cloud Engagement"
#    reference: marketing
`;

const EXCLUSIONS = `# TADForce exclusions — what the document must NOT describe.
# exclude:  components outside the production architecture (POC, test, demo, unused). "*" wildcards allowed.
#           type (optional): apex, trigger, lwc, aura, flow, flexipage, app, object, permissionSet, omniScript, report…
# features: decommissioned features. Their components are excluded and their keywords are forbidden in the text.
exclude: []
#  - name: "*Demo*"
#    reason: "Demonstration components"
#  - name: legacyScoring
#    type: lwc
#    reason: "Replaced by the scoring engine; still deployed, not used"
features: []
#  - name: "Search by national ID"
#    note: "UI removed; backend kept until further notice. Do not document."
#    components: [idSearch, IdSearchController]
#    keywords: ["national ID search"]
`;

/** Agent folders that receive the skills. Others are added when their folder already exists. */
const AGENT_DIRS = ['.claude', '.agents'];
const OPTIONAL_AGENT_DIRS = ['.codex', '.cursor', '.windsurf', '.gemini', '.github', '.kiro', '.roo', '.opencode', '.continue'];

export function installSkills(project, agents) {
  const targets = agents && agents.length ? agents.map((a) => (a.startsWith('.') ? a : '.' + a)) : [...AGENT_DIRS, ...OPTIONAL_AGENT_DIRS.filter((d) => exists(path.join(project, d)))];
  const done = [];
  for (const dir of [...new Set(targets)]) {
    for (const skill of fs.readdirSync(SKILLS)) {
      copyDir(path.join(SKILLS, skill), path.join(project, dir, 'skills', skill), { overwrite: true });
    }
    done.push(path.join(dir, 'skills'));
  }
  return done;
}

/** Minimal SFDX project, knowledge files and .gitignore: everything a workspace needs, existing files kept. */
export function ensureWorkspace(project, cfg) {
  const ws = findWorkspace(project) || path.join(project, WORKSPACE_DIR);
  if (!exists(path.join(project, 'sfdx-project.json'))) {
    writeJson(path.join(project, 'sfdx-project.json'), { packageDirectories: [{ path: 'force-app', default: true }], name: path.basename(project), namespace: '', sourceApiVersion: '62.0' });
    fs.mkdirSync(path.join(project, 'force-app', 'main', 'default'), { recursive: true });
    log.ok('Created a minimal SFDX project (sfdx-project.json, force-app/).');
  }
  writeJson(path.join(ws, CONFIG_FILE), cfg);
  if (!exists(path.join(ws, 'knowledge', 'glossary.yml'))) writeText(path.join(ws, 'knowledge', 'glossary.yml'), GLOSSARY);
  if (!exists(path.join(ws, 'knowledge', 'exclusions.yml'))) writeText(path.join(ws, 'knowledge', 'exclusions.yml'), EXCLUSIONS);
  if (!exists(path.join(ws, 'knowledge', 'inputs', 'README.md'))) writeText(path.join(ws, 'knowledge', 'inputs', 'README.md'), '# Inputs\n\nDrop here what the metadata cannot tell: functional specifications (`specs/`), previous architecture documents, a Code Analyzer report (`code-analyzer-results.json`), decisions. They are read by the agent, never published as such.\n');
  if (!exists(path.join(ws, '.gitignore'))) writeText(path.join(ws, '.gitignore'), '.snapshot/\n.cache/\nout/*_comments_*.html\nout/figures/\nunderstanding/tasks/\nunderstanding/tasks.json\n');
  return ws;
}

async function ask(rl, q, def) {
  if (!rl) return def;
  const a = (await rl.question(`  ${q}${def ? ` [${def}]` : ''}: `)).trim();
  return a || def;
}

export async function run(args) {
  const project = path.resolve(args.cwd || process.cwd());
  log.banner('init');
  const existing = findWorkspace(project);
  const ws = existing || path.join(project, WORKSPACE_DIR);
  const interactive = process.stdin.isTTY && !args.yes;
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    const prev = existing ? readJson(path.join(ws, CONFIG_FILE)) : {};
    const base = defaultConfig(prev);
    if (interactive) log.step('A few facts only you can confirm (Enter keeps the default):');
    const language = args.lang || (await ask(rl, `Document language (${LANGUAGES.join('/')} built in, or any code: es, de, it, pt, ar…)`, base.language));
    const clientName = args.client || (await ask(rl, 'Client name', prev.client?.name || base.client.name));
    const short = args.short || (await ask(rl, 'Client short name (used in file names)', prev.client?.short || clientName.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()));
    const integrator = args.integrator || (await ask(rl, 'Integrator (blank if none)', base.integrator.name || ''));
    const author = args.author || (await ask(rl, 'Author of the document (blank: not shown)', base.document.author || ''));
    const title = args.title || (await ask(rl, 'Document title', base.document.title));
    const alias = args.org || (await ask(rl, 'Salesforce org alias (blank: decide later)', base.org.alias || ''));
    const cfg = defaultConfig({
      ...prev,
      language: normalizeLang(language),
      client: { ...base.client, name: clientName, short },
      integrator: { ...base.integrator, name: integrator || null },
      document: { ...base.document, author: author || null, title, reference: prev.document?.reference || `TAD-${short}-CRM`, environment: args.environment || base.document.environment, status: language === 'fr' && !prev.document?.status ? 'Pour revue' : base.document.status, classification: language === 'fr' && !prev.document?.classification ? 'Confidentiel' : base.document.classification },
      org: { alias: alias || null },
    });
    ensureWorkspace(project, cfg);
    log.ok(`Workspace ready: ${path.relative(project, ws) || '.'}/`);
    if (args.skills !== false) {
      const dirs = installSkills(project, args.agents ? String(args.agents).split(',') : null);
      log.ok(`Skills installed in ${dirs.join(', ')} → run /tadforce in your agent.`);
    }
  } finally {
    if (rl) rl.close();
  }
  console.log('');
  await doctor({ cwd: project });
  console.log('');
  log.human('open your AI agent in this folder and type /tadforce — or run `npx tadforce doctor` to finish the setup here.');
  return 0;
}
