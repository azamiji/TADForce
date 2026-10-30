// `tadforce doctor`: everything before the writing, in one loop that runs until all is green —
// tools, project, org connection, metadata, the framing questions and the questions only a human can answer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { exists, readJson, readText, writeText } from '../util/fsx.js';
import { findWorkspace, defaultConfig, DEFAULT_BRAND, loadWorkspace, sourceDirs } from '../util/config.js';
import { CONFIG_FILE, TEMPLATES } from '../util/paths.js';
import { LANGUAGES, normalizeLang } from '../util/i18n.js';
import { sfVersion, sfJson, sfInteractive, soql, isTransient } from '../sf/sf.js';
import { findBrowser, closeBrowser } from '../build/browser.js';
import { findLogoCandidates, orgThemeColors, imageColors, paletteFrom } from '../build/brand.js';
import { log, c, setQuiet } from '../util/log.js';
import { installedAgents, insideAgent, launchAgent } from '../util/agents.js';
import { ensureWorkspace, installSkills } from './init.js';
import * as org from './org.js';
import * as docs from './docs.js';

/** Tool prerequisites. Each check says what to do: fixed by TADForce, or a human action. */
export async function checks(cwd) {
  const out = [];
  const add = (id, ok, message, fix = null, human = false, level = ok ? 'ok' : 'error') => out.push({ id, ok, level, message, fix, human });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 20, `Node.js ${process.versions.node}`, major >= 20 ? null : 'Install Node.js 20 or later (https://nodejs.org).', true);

  const sf = sfVersion();
  add('sf-cli', !!sf, sf ? `Salesforce CLI ${sf}` : 'Salesforce CLI not found', sf ? null : 'npm install --global @salesforce/cli', false);

  const browser = findBrowser();
  add('browser', !!browser, browser ? `Browser for rendering: ${browser}` : 'No Chrome / Edge / Chromium found (needed for diagrams, PDF and DOCX)', browser ? null : 'npx @puppeteer/browsers install chrome-headless-shell@stable  (then set TADFORCE_CHROME)', false);

  const git = spawnSync('git', ['--version'], { encoding: 'utf8' });
  add('git', git.status === 0, git.status === 0 ? git.stdout.trim() : 'git not found (optional: version your workspace)', null, false, git.status === 0 ? 'ok' : 'warn');

  const sfdx = path.join(cwd, 'sfdx-project.json');
  const hasProject = exists(sfdx);
  add('sfdx-project', hasProject, hasProject ? `SFDX project: ${readJson(sfdx).name || path.basename(cwd)}` : 'No sfdx-project.json in this folder', hasProject ? null : 'pick your Salesforce project (doctor lists the ones nearby), or --project create', false, hasProject ? 'ok' : 'warn');
  return out;
}

/** The default org: the project's target-org, else the machine-wide one (`global: true`) — sf config. */
async function defaultOrg(project) {
  try {
    const r = await sfJson(['config', 'get', 'target-org'], { cwd: project, timeoutMs: 60000 });
    const e = Array.isArray(r) && r[0];
    return e && e.value ? { alias: e.value, global: /global/i.test(e.location || '') } : null;
  } catch { return null; }
}

// One check per org and per run: every doctor step reuses it.
const statusCache = new Map();
async function orgStatus(alias) {
  if (!alias) return { ok: false, reason: 'none' };
  if (!statusCache.has(alias)) statusCache.set(alias, cachedOrgStatus(alias));
  return statusCache.get(alias);
}

// An org seen connected stays « connected » for 10 minutes across doctor runs (each `sf org display` costs seconds);
// failures are never kept, so a fresh login is seen at once.
const STATUS_FILE = path.join(os.tmpdir(), 'tadforce-org-status.json');
async function cachedOrgStatus(alias) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); } catch { /* none yet */ }
  const hit = all[alias];
  if (hit && hit.ok && Date.now() - hit.at < 600000) return hit;
  const st = await readOrgStatus(alias);
  if (st.ok) { all[alias] = { ...st, at: Date.now() }; try { fs.writeFileSync(STATUS_FILE, JSON.stringify(all)); } catch { /* no writable tmp */ } }
  return st;
}

async function readOrgStatus(alias) {
  try {
    const d = await sfJson(['org', 'display', '--target-org', alias], { timeoutMs: 120000 });
    if (d.connectedStatus && !/^connected$/i.test(d.connectedStatus) && !/^active$/i.test(d.status || '')) return { ok: false, reason: /DomainNotFound|ENOTFOUND/i.test(d.connectedStatus) ? 'unreachable' : 'expired', detail: d.connectedStatus };
    return { ok: true, username: d.username, instanceUrl: d.instanceUrl, sandbox: /test\.salesforce|sandbox|\.cs\d+\./i.test(d.instanceUrl || '') };
  } catch (e) {
    // an unknown alias, a network failure and an expired session call for different actions
    if (/No authorization information|NamedOrgNotFound|No org configuration found|cannot be found/i.test(e.message) && !isTransient(e)) return { ok: false, reason: 'unknown', detail: e.message.slice(0, 160) };
    if (isTransient(e)) return { ok: false, reason: 'unreachable', detail: e.message.slice(0, 160) };
    return { ok: false, reason: 'expired', detail: e.message.slice(0, 160) };
  }
}

/**
 * Orgs authorized on this machine, to choose from instead of logging in again. Listed without pinging
 * each org (that takes a minute and fails on one bad org); the chosen one is checked afterwards.
 */
async function connectedOrgs() {
  try {
    const r = await sfJson(['org', 'list', '--skip-connection-status'], { timeoutMs: 120000 });
    const all = [...(r.nonScratchOrgs || []), ...(r.scratchOrgs || []), ...(r.sandboxes || []), ...(r.other || [])];
    const ok = all.filter((o) => !o.isExpired && !/deleted|expired/i.test(o.status || ''));
    return [...new Map(ok.map((o) => [o.username, { alias: o.alias || o.username, username: o.username, instanceUrl: o.instanceUrl }])).values()];
  } catch (e) {
    log.warn(`Could not list the orgs of this machine (${e.message.slice(0, 120)})`);
    return [];
  }
}

/** Org facts that give a recommended answer to the framing questions. */
async function proposals(alias) {
  const out = {};
  try {
    const o = ((await soql('SELECT Name, IsSandbox, LanguageLocaleKey FROM Organization', alias)).records || [])[0] || {};
    out.client = o.Name; out.language = normalizeLang(String(o.LanguageLocaleKey || 'en').split('_')[0]); out.environment = o.IsSandbox ? 'Sandbox' : 'Production';
  } catch { /* proposals stay empty */ }
  return out;
}

/** Short code for file names: initials of a multi-word name (Northwind Bank → NB), else the name cut to 8. */
export function shortCode(name) {
  const words = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : words[0] || 'CLIENT').slice(0, 8).toUpperCase();
}

const listArg = (v) => (typeof v !== 'string' ? undefined : v.split(',').map((x) => x.trim()).filter(Boolean));

/** Answers given as flags (the agent's way of answering) are written to the config. */
async function applyAnswers(ctx, args) {
  const cfg = ctx.cfg;
  const set = (cond, fn) => { if (cond) fn(); };
  set(args.lang, () => { cfg.language = normalizeLang(args.lang); });
  set(args.client, () => { cfg.client.name = String(args.client); if (!args.short && (cfg.client.short === 'CLIENT' || !cfg.client.short)) cfg.client.short = shortCode(String(args.client)); });
  set(args.short, () => { cfg.client.short = String(args.short); });
  set(args.integrator !== undefined, () => { cfg.integrator.name = args.integrator === true || args.integrator === '' || args.integrator === 'none' ? null : String(args.integrator); });
  set(args.author !== undefined, () => { cfg.document.author = args.author === true || args.author === '' || args.author === 'none' ? null : String(args.author); });
  set(args.title, () => { cfg.document.title = String(args.title); });
  set(args.environment, () => { cfg.document.environment = String(args.environment); });
  set(listArg(args.scope), () => { cfg.scope.include = listArg(args.scope); });
  set(listArg(args.packageDirs), () => { cfg.scope.packageDirectories = listArg(args.packageDirs); });
  set(args.source && ['org', 'local', 'both'].includes(args.source), () => { cfg.source.mode = args.source; });
  if (typeof args.org === 'string') cfg.org.alias = args.org;
  if (args.logo && args.logo !== true) cfg.client.logo = await importAsset(ctx, String(args.logo), 'client-logo');
  if (args.integratorLogo && args.integratorLogo !== true) cfg.integrator.logo = await importAsset(ctx, String(args.integratorLogo), 'integrator-logo');
  if (listArg(args.specs)) {
    const kept = [];
    for (const s of listArg(args.specs)) {
      const src = path.resolve(s);
      if (!exists(src)) { log.warn(`Specification not found: ${s}`); continue; }
      const dst = ctx.p('knowledge', 'inputs', 'specs', path.basename(src));
      if (path.resolve(src) !== path.resolve(dst)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
      kept.push(path.relative(ctx.ws, dst).split(path.sep).join('/'));
    }
    cfg.inputs.specs = [...new Set([...(cfg.inputs.specs || []), ...kept])];
  }
  if (args.specs !== undefined) cfg.setup.specsAsked = true; // --no-specs: none provided
  if (args.confirm || args.yes) cfg.setup.confirmed = true;
  if (args.factsReviewed) { cfg.setup.factsReviewed = true; cfg.setup.factsDirty = true; }
  if (args.branding === 'keep') cfg.setup.brandingConfirmed = true;
  if (cfg.document.reference === 'TAD-CLIENT-CRM' && cfg.client.short !== 'CLIENT') cfg.document.reference = `TAD-${cfg.client.short}-CRM`;
  ctx.save(cfg);
}

/** Copy a local file, or download a URL (only when the human gave it), into knowledge/assets/. */
async function importAsset(ctx, src, name) {
  let ext, bytes;
  if (/^https?:\/\//i.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`Logo download failed (${r.status}): ${src}`);
    const type = (r.headers.get('content-type') || '').split(';')[0];
    ext = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[type] || path.extname(new URL(src).pathname) || '.png';
    bytes = Buffer.from(await r.arrayBuffer());
  } else {
    const p = path.resolve(src);
    if (!exists(p)) throw new Error(`Logo not found: ${src}`);
    ext = path.extname(p).toLowerCase(); bytes = fs.readFileSync(p);
  }
  const rel = `knowledge/assets/${name}${ext}`;
  fs.mkdirSync(ctx.p('knowledge', 'assets'), { recursive: true });
  fs.writeFileSync(ctx.p(rel), bytes);
  return rel;
}

/** Logo from the snapshot and colours from evidence (org theme, then logo), unless the human set them. */
async function brand(ctx) {
  const cfg = ctx.cfg;
  const dirs = sourceDirs(ctx);
  const notes = [];
  if (!cfg.client.logo && !cfg.setup.logoSearched) {
    const hit = findLogoCandidates(dirs)[0];
    cfg.setup.logoSearched = true;
    if (hit) {
      const rel = `knowledge/assets/client-logo${hit.ext}`;
      fs.mkdirSync(ctx.p('knowledge', 'assets'), { recursive: true });
      fs.copyFileSync(hit.file, ctx.p(rel));
      cfg.client.logo = rel;
      notes.push(`Client logo found in the org (${hit.source}: ${path.basename(hit.file)}) → ${rel}`);
    }
  }
  const untouched = JSON.stringify(cfg.brand) === JSON.stringify(DEFAULT_BRAND) || cfg.brand.source === 'logo' && cfg.brand.logo !== cfg.client.logo;
  if (untouched) {
    const theme = orgThemeColors(dirs);
    let colors = theme.length ? [...new Set(theme.map((x) => x.value))] : [];
    let source = colors.length ? `org theme (${theme[0].file})` : null;
    if (!colors.length && cfg.client.logo && exists(ctx.p(cfg.client.logo)) && findBrowser()) {
      try { colors = await imageColors(ctx.p(cfg.client.logo)); source = 'logo'; } catch (e) { notes.push(`Colours could not be read from the logo (${e.message.slice(0, 80)})`); } finally { await closeBrowser(); }
    }
    if (colors.length) {
      cfg.brand = { ...paletteFrom(colors[0], colors[1]), source, logo: cfg.client.logo || null };
      notes.push(`Document colours from the ${source}: ${colors.slice(0, 2).join(', ')} (edit tadforce.config.json › brand to change)`);
    }
  }
  ctx.save(cfg);
  return notes;
}

/** Systems to name and exclusions to confirm, from facts/questions.json. */
function factQuestions(ctx) {
  const p = ctx.p('facts', 'questions.json');
  if (!exists(p) || ctx.cfg.setup.factsReviewed) return [];
  const qs = readJson(p);
  const out = [];
  for (const s of qs.systems || []) out.push({ id: `system:${s.key}`, kind: 'system', question: `Which system is ${s.key}? (name as the client calls it)`, recommended: '', endpoints: s.endpoints, writeTo: 'knowledge/glossary.yml › systems' });
  for (const g of (qs.exclusions && qs.exclusions.groups) || []) out.push({ id: `exclude:${g.reason}`, kind: 'exclusion', question: `${g.count} component(s): ${g.reason}. Exclude from the document? (all / none / list of names)`, recommended: 'none', items: g.items, writeTo: 'knowledge/exclusions.yml › exclude' });
  out.push({ id: 'features', kind: 'features', question: 'Any feature decommissioned or switched off that the document must not describe? (blank: none)', recommended: '', writeTo: 'knowledge/exclusions.yml › features' });
  return out;
}

function editYaml(file, key, items) {
  const doc = exists(file) ? YAML.parseDocument(readText(file)) : new YAML.Document({});
  const seq = doc.get(key);
  if (!seq || !YAML.isSeq(seq)) doc.set(key, doc.createNode(items));
  else for (const it of items) seq.add(doc.createNode(it));
  writeText(file, doc.toString());
}

/** Interactive answers to the facts questions, written to the knowledge files. */
async function askFacts(ctx, rl, questions) {
  const systems = [], exclude = [], features = [];
  log.step('What the metadata cannot tell:');
  questions.forEach((q, i) => console.log(`  ${i + 1}. ${q.question}`));
  console.log(`     ${c.dim('recommended: systems « to be confirmed » in the document, nothing excluded, no decommissioned feature')}`);
  if (yes((await rl.question('  Accept the recommended answers? [Y/n] ')).trim())) return 0;
  for (const q of questions) {
    const a = (await rl.question(`  ${q.question}${q.items ? '\n    ' + c.dim(q.items.slice(0, 12).join(', ') + (q.items.length > 12 ? ` … +${q.items.length - 12}` : '')) : ''}${q.endpoints ? '\n    ' + c.dim(q.endpoints.join(', ')) : ''}\n  > `)).trim();
    if (!a) continue;
    if (q.kind === 'system') systems.push({ id: a.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: a, match: [q.id.slice(7)] });
    if (q.kind === 'exclusion' && a !== 'none') {
      const names = a === 'all' ? q.items : a.split(',').map((x) => x.trim()).filter(Boolean);
      for (const it of names) { const [type, ...rest] = it.includes(':') ? it.split(':') : [null, it]; exclude.push({ name: rest.join(':') || it, ...(type ? { type: type.replace(/^object$/, 'object') } : {}), reason: q.id.slice(8) }); }
    }
    if (q.kind === 'features') features.push({ name: a, note: 'Decommissioned (confirmed during doctor)', components: [], keywords: [] });
  }
  if (systems.length) editYaml(ctx.p('knowledge', 'glossary.yml'), 'systems', systems);
  if (exclude.length) editYaml(ctx.p('knowledge', 'exclusions.yml'), 'exclude', exclude);
  if (features.length) editYaml(ctx.p('knowledge', 'exclusions.yml'), 'features', features);
  return systems.length + exclude.length + features.length;
}

/** Framing questions (5 to 6), each with a recommended answer. Title and short code are derived. */
function framingQuestions(cfg, prop) {
  if (cfg.setup.confirmed) return [];
  const q = [];
  const ask = (id, question, recommended, extra = {}) => q.push({ id, question, recommended, ...extra });
  ask('lang', `Document language (${LANGUAGES.join(', ')} built in, or any code: es, de, it, pt, ar…)`, prop.language || cfg.language, { options: [...LANGUAGES, 'other'] });
  ask('client', 'Client name, as it must appear in the document', prop.client || (cfg.client.name !== 'Client' ? cfg.client.name : ''));
  ask('integrator', 'Integrator (blank: the document only names the client)', cfg.integrator.name || '', { optional: true });
  ask('author', 'Author of the document (blank: no author shown)', cfg.document.author || '', { optional: true });
  ask('specs', 'Functional specifications to use, comma-separated paths (blank: none)', (cfg.inputs.specs || []).join(','), { optional: true });
  ask('scope', 'Part of the org to document, name patterns such as NWB_* (blank: the whole org)', (cfg.scope.include || []).join(','), { optional: true });
  return q;
}

/** Interactive batch: the list with its recommendations, then « accept all » or one by one. */
async function askBatch(rl, title, questions) {
  log.step(title);
  questions.forEach((q, i) => console.log(`  ${i + 1}. ${q.question}\n     ${c.dim('recommended:')} ${q.recommended === '' || q.recommended == null ? c.dim('(blank)') : c.bold(String(q.recommended))}`));
  const all = (await rl.question('  Accept all the recommended answers? [Y/n] ')).trim();
  const answers = {};
  if (/^(|y|o|yes|oui)$/i.test(all)) { for (const q of questions) answers[q.id] = q.recommended ?? ''; return answers; }
  for (const q of questions) {
    const a = (await rl.question(`  ${q.question}${q.options ? ` (${q.options.join('/')})` : ''}${q.recommended ? ` [${q.recommended}]` : ''}: `)).trim();
    answers[q.id] = a || q.recommended || '';
    if (q.id === 'lang' && /^(other|autre)$/i.test(a)) answers.lang = (await rl.question('  Language code (es, de, it, pt, nl, ar, ja…): ')).trim() || 'en';
  }
  return answers;
}

const yes = (a, def = true) => (a === '' ? def : /^(y|o|yes|oui)$/i.test(a));

/** Salesforce DX projects in this folder's sub-folders and next to it (two levels), for the user to pick from. */
function findProjects(start) {
  const out = new Set();
  const visit = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name === 'sfdx-project.json')) out.add(dir);
    if (depth <= 0) return;
    for (const e of entries) if (e.isDirectory() && !/^(node_modules|\.|force-app$)/.test(e.name)) visit(path.join(dir, e.name), depth - 1);
  };
  visit(start, 2);
  visit(path.dirname(start), 1);
  out.delete(start);
  return [...out].slice(0, 9);
}

const hasLocalSources = (project) => (readJson(path.join(project, 'sfdx-project.json')).packageDirectories || [])
  .some((d) => exists(path.join(project, d.path)) && fs.readdirSync(path.join(project, d.path), { recursive: true }).some((f) => String(f).endsWith('-meta.xml')));

/**
 * Step 2 — which Salesforce project. Never creates anything without a yes. Returns the project folder,
 * or { stop } with the question to hand back.
 */
async function resolveProject(start, args, rl) {
  const ws = findWorkspace(start);
  const confirmed = ws && defaultConfig(readJson(path.join(ws, CONFIG_FILE))).setup.projectConfirmed;
  if (exists(path.join(start, 'sfdx-project.json'))) {
    if (confirmed || args.project === 'yes' || args.yes) return start;
    const name = readJson(path.join(start, 'sfdx-project.json')).name || path.basename(start);
    if (!rl) return { stop: { id: 'project', question: `Generate the TAD for the Salesforce project "${name}" (${start})?`, recommended: 'yes', options: ['yes', '<path of another project>'] } };
    if (yes((await rl.question(`  Salesforce project found: ${c.bold(name)} (${start}).\n  Generate the TAD for this project? [Y/n] `)).trim())) return start;
    const other = (await rl.question('  Path of the project to document (blank: stop): ')).trim();
    return other ? resolveProject(path.resolve(other), { ...args, project: 'yes' }, rl) : { stop: null };
  }
  if (args.project === 'create') return start;
  if (args.project && args.project !== 'yes') return resolveProject(path.resolve(String(args.project)), { ...args, project: 'yes' }, rl);
  const found = findProjects(start);
  if (!rl) return { stop: { id: 'project', question: `No Salesforce DX project in ${start}. Which project should the TAD document? A path, or "create" to create a new project here.`, recommended: found[0] || '', options: [...found, 'create'] } };
  console.log(`  ${c.yellow('⚠')} ${start} is not a Salesforce DX project (no sfdx-project.json).`);
  found.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
  console.log(`    ${c.dim('or a path · c = create a new project here · Enter = stop')}`);
  const a = (await rl.question(`  Project to document${found.length ? ' [1]' : ''}: `)).trim();
  if (!a && found.length) return found[0];
  if (/^\d+$/.test(a) && found[Number(a) - 1]) return found[Number(a) - 1];
  if (/^c$/i.test(a)) return start;
  if (a) return resolveProject(path.resolve(a), { ...args, project: 'yes' }, rl);
  console.log('  Open your Salesforce project folder (cd <path>), then run tadforce doctor again.');
  return { stop: null };
}

/**
 * Step 3 — which org. The default org is proposed, never taken silently; « no » opens the Salesforce
 * login and asks again once an org is connected. Returns { ok } or { stop } with the question to hand back.
 */
async function confirmOrg(project, ctx, args, rl) {
  const cfg = ctx.cfg;
  if (cfg.source.mode === 'local') return { ok: true };
  const explicit = typeof args.org === 'string' ? args.org : null;
  const def = explicit || cfg.setup.orgConfirmed ? null : await defaultOrg(project);
  let alias = explicit || (cfg.setup.orgConfirmed ? cfg.org.alias : def && def.alias);
  let status = alias ? await orgStatus(alias) : { ok: false, reason: 'none' };
  const keep = () => { cfg.org.alias = alias; cfg.setup.orgConfirmed = true; ctx.save(cfg); return { ok: true }; };
  if (status.ok && (explicit || cfg.setup.orgConfirmed)) return keep();
  // the machine-wide default may be any org (another client's): proposed, never recommended
  const machineWide = !!(def && def.global);
  const label = machineWide ? 'Machine-wide default org (not set for this project)' : 'Default org of this project';
  const describe = () => `${c.bold(alias)} (${status.username}, ${status.instanceUrl})`;
  const why = (st) => ({ unknown: 'is not authorized on this machine', unreachable: 'cannot be reached (network, or the org was deleted)', expired: 'session expired' }[st.reason] || 'is not connected');
  // the default org is unusable or refused: the orgs already connected come first (the same user once), a new login last
  const others = (await connectedOrgs()).filter((o) => o.alias !== alias && o.username !== alias && o.username !== status.username);
  if (!rl) {
    const login = 'another org: the human runs `sf org login web --alias <a> [--instance-url https://test.salesforce.com]` (opens the browser), then --org <a>';
    return { stop: alias && status.ok
      ? { id: 'org', question: `${label}: "${alias}" (${status.username}, ${status.instanceUrl}). Generate the TAD from this org?`, recommended: machineWide ? null : alias, options: [`${alias} (${status.username}, ${status.instanceUrl})`, ...others.map((o) => `${o.alias} (${o.username}, ${o.instanceUrl})`), login, 'local: document the local sources only (--source local)'] }
      : { id: 'org', question: `${alias ? `The default org "${alias}" ${why(status)}.` : 'No default org for this project.'} Which org is the TAD about? Answer with --org <alias>.`, recommended: null, options: [...others.map((o) => `${o.alias} (${o.username}, ${o.instanceUrl})`), login, 'local: document the local sources only (--source local)'], human: !others.length } };
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    if (alias && status.ok) {
      const a = (await rl.question(`  ${attempt ? 'Connected' : label}: ${describe()}\n  Generate the TAD from this org? [Y/n/l = local sources only] `)).trim();
      if (yes(a)) return keep();
      if (/^l/i.test(a)) { cfg.source.mode = 'local'; ctx.save(cfg); return { ok: true }; }
    } else if (alias) console.log(`  ${c.yellow('⚠')} The default org "${alias}" ${why(status)}.`);
    if (others.length) {
      console.log('  Orgs already connected on this machine:');
      others.forEach((o, i) => console.log(`    ${i + 1}. ${o.alias} ${c.dim(`(${o.username}, ${o.instanceUrl})`)}`));
      const pick = (await rl.question('  Org for the TAD (number), n = log in to another org, l = local sources only: ')).trim();
      if (/^l/i.test(pick)) { cfg.source.mode = 'local'; ctx.save(cfg); return { ok: true }; }
      if (others[Number(pick) - 1]) { alias = others[Number(pick) - 1].alias; status = await orgStatus(alias); if (status.ok) return keep(); }
    }
    // « no », or no usable org: open the Salesforce CLI login and wait for it.
    const def = alias && status.reason === 'expired' ? alias : 'tad-org';
    const next = (await rl.question(`  Alias for the org to connect [${def}]: `)).trim() || def;
    const sandbox = yes((await rl.question('  Is it a sandbox? [y/N] ')).trim(), false);
    log.human('a browser window opens: log in to the org, then click « Allow ». Waiting for the login…');
    if (!sfInteractive(['org', 'login', 'web', '--alias', next, ...(sandbox ? ['--instance-url', 'https://test.salesforce.com'] : [])])) { log.warn('Login did not complete.'); continue; }
    alias = next; status = await orgStatus(alias);
  }
  return { stop: null };
}

/** Step 5 — which metadata, and the go before a long retrieve. Returns { mode } or { stop }. */
async function chooseSource(project, ctx, args, rl) {
  const cfg = ctx.cfg;
  const local = hasLocalSources(project);
  // local sources need no go: there is no long retrieve
  if (cfg.source.mode === 'local' || (cfg.source.mode && cfg.setup.sourceGo)) return { mode: cfg.source.mode };
  if (typeof args.source === 'string') { cfg.source.mode = args.source === 'self' ? 'local' : args.source; cfg.setup.sourceGo = args.source !== 'self'; ctx.save(cfg); if (args.source !== 'self') return { mode: cfg.source.mode }; }
  const org = cfg.source.mode !== 'local' && cfg.org.alias;
  const options = [
    ...(org ? [{ id: 'org', text: `retrieve all the metadata of ${cfg.org.alias}, read-only (several minutes)` }] : []),
    ...(local ? [{ id: 'local', text: 'use only the metadata already in this project (force-app…)' }] : []),
    { id: 'self', text: 'you retrieve the metadata yourself first, then give the go' },
  ];
  const recommended = org ? 'org' : local ? 'local' : 'self';
  if (!rl) return { stop: { id: 'source', question: 'Which metadata should the TAD be written from? (--source answers it and is the go: the retrieve starts right away)', recommended, options: options.map((o) => `${o.id}: ${o.text}`) } };
  log.step('Metadata for the document:');
  options.forEach((o, i) => console.log(`    ${i + 1}. ${o.text}${o.id === recommended ? c.dim('  (recommended)') : ''}`));
  const a = (await rl.question(`  Your choice [${options.findIndex((o) => o.id === recommended) + 1}]: `)).trim();
  const pick = options[Number(a) - 1] || options.find((o) => o.id === recommended);
  if (pick.id === 'self') {
    console.log(`  Retrieve the metadata into this project, for example:\n    ${c.cyan('sf project retrieve start --manifest manifest/package.xml')}`);
    const done = (await rl.question('  Press Enter when your retrieve is done (s = stop for now): ')).trim();
    if (/^s/i.test(done)) return { stop: null };
    cfg.source.mode = 'local'; cfg.setup.sourceGo = true; ctx.save(cfg);
    return { mode: 'local' };
  }
  if (pick.id === 'org' && !yes((await rl.question('  The retrieve takes several minutes, read-only. Start now? [Y/n] ')).trim())) {
    console.log('  Run tadforce doctor again when you are ready: your answers are kept.');
    return { stop: null };
  }
  cfg.source.mode = pick.id; cfg.setup.sourceGo = true; ctx.save(cfg);
  return { mode: pick.id };
}

/** Step 6a — logo and colours found from evidence, confirmed in one question. */
async function confirmBranding(ctx, args, rl, say) {
  for (const n of await brand(ctx)) say(() => log.ok(n));
  const cfg = loadWorkspace(ctx.project).cfg;
  if (cfg.setup.brandingConfirmed) return null;
  const logo = cfg.client.logo || 'none (a badge with the initials)';
  const colours = cfg.brand.source ? `${cfg.brand.gradient[0]} (from the ${cfg.brand.source})` : 'TADForce default colours';
  if (!rl) return { id: 'branding', question: `Branding: logo ${logo}; colours ${colours}. Keep it? (--branding keep, or --logo <file|url>)`, recommended: 'keep' };
  const a = (await rl.question(`  Logo: ${c.bold(logo)} · colours: ${c.bold(colours)}\n  Keep it? [Y / path or URL of another logo] `)).trim();
  const c2 = loadWorkspace(ctx.project);
  if (a && !yes(a, false) && !/^n/i.test(a)) {
    try { c2.cfg.client.logo = await importAsset(c2, a, 'client-logo'); c2.save(c2.cfg); for (const n of await brand(loadWorkspace(ctx.project))) say(() => log.ok(n)); } catch (e) { log.warn(e.message); }
  }
  const c3 = loadWorkspace(ctx.project); c3.cfg.setup.brandingConfirmed = true; c3.save(c3.cfg);
  return null;
}

/** One pass: where the workspace stands, and what remains. */
async function evaluate(project, args) {
  const tools = await checks(project);
  const ws = findWorkspace(project);
  const cfg = ws ? defaultConfig(readJson(path.join(ws, CONFIG_FILE))) : defaultConfig();
  const list = [...tools];
  const add = (id, ok, message, fix = null, human = false, level = ok ? 'ok' : 'error') => list.push({ id, ok, level, message, fix, human });
  if (ws) add('workspace', true, `Workspace: ${path.relative(project, ws) || '.'}`);
  if (cfg.source.mode !== 'local' && cfg.setup.orgConfirmed && cfg.org.alias) {
    const status = await orgStatus(cfg.org.alias);
    add('org', status.ok, status.ok ? `Org: ${cfg.org.alias} (${status.instanceUrl})` : `Org "${cfg.org.alias}" is not connected`, status.ok ? null : 'log in again (doctor opens the browser)', !status.ok);
  }
  let facts = false;
  if (ws) {
    const ctx = loadWorkspace(project);
    facts = exists(ctx.p('facts', 'facts.json'));
    const lang = normalizeLang(ctx.cfg.language);
    const own = ctx.p('i18n', `${lang}.json`);
    if (!LANGUAGES.includes(lang)) {
      // still English: the labels file not translated, or chapters whose headings match the English skeleton
      const english = [];
      for (const doc of ['tad', 'axes']) {
        const dir = ctx.p('src', doc);
        if (!exists(dir)) continue;
        for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
          const tpl = path.join(TEMPLATES, doc, 'en', f);
          const heads = (txt) => txt.split('\n').filter((l) => /^#{1,3} /.test(l)).join('\n');
          if (exists(tpl) && heads(readText(tpl)) === heads(readText(path.join(dir, f)))) english.push(`src/${doc}/${f}`);
        }
      }
      const labels = exists(own) && readJson(own)._translate;
      const base = defaultConfig().document;
      const fields = ['title', 'status', 'classification', 'environment'].filter((k) => ctx.cfg.document[k] === base[k]);
      if (labels || english.length || fields.length) add('language', true, `Document language "${lang}": ${[labels && 'interface labels', english.length && `${english.length} chapter(s) with English headings`, fields.length && `document ${fields.join(', ')} (English defaults)`].filter(Boolean).join(' and ')} still to translate (once)`, `the agent translates, once: the headings and the body text of ${english.length ? english.slice(0, 3).join(', ') + (english.length > 3 ? '…' : '') : 'src/*/*.md'} (keep {#anchors}, {-}, <!-- tad:… --> lines and @@…@@ directives; the caption after « | » may be translated), the values of tadforce/i18n/${lang}.json (keys and {placeholders} kept, meta.htmlLang set, "_translate" line removed), and document.title / status / classification / environment in tadforce.config.json`, false, 'warn');
    }
    const rr = ctx.p('.snapshot', 'retrieve-report.json');
    const lost = exists(rr) ? (readJson(rr).failed || []).filter((x) => x.core).map((x) => x.type) : [];
    if (lost.length) add('retrieve', true, `Not retrieved, the document needs them: ${lost.join(', ')}`, 'rerun the retrieve when the org is less busy: tadforce doctor --refresh', false, 'warn');
    if (facts) add('metadata', true, `Metadata: ${exists(ctx.p(ctx.cfg.source.dir)) && ctx.cfg.source.mode !== 'local' ? 'retrieved from the org' : 'local sources'} → facts/facts.json`);
  }
  return { tools, ws, cfg, list, facts };
}

export async function run(args) {
  const start = path.resolve(args.cwd || process.cwd());
  const interactive = process.stdin.isTTY && !args.json && !args.yes;
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const say = (fn) => { if (!args.json) fn(); };
  if (args.json) setQuiet(true);
  say(() => log.banner('doctor'));
  try {
    // 1. Tools: TADForce installs what it may, the rest is a human action.
    let st = await evaluate(start, args);
    if (st.tools.find((t) => t.id === 'sf-cli' && !t.ok) && rl && yes((await rl.question('  Salesforce CLI missing. Install it now with npm? [Y/n] ')).trim())) {
      spawnSync('npm', ['install', '--global', '@salesforce/cli'], { stdio: 'inherit', shell: process.platform === 'win32' });
      st = await evaluate(start, args);
    }
    if (st.tools.some((t) => t.level === 'error' && t.id !== 'sfdx-project')) return finish(args, st, [], 'install the missing tools, then run tadforce doctor again');

    // 2. The Salesforce project the TAD is about (confirmed, never created without a yes).
    const p = await resolveProject(start, args, rl);
    if (typeof p !== 'string') return p.stop ? finish(args, st, [p.stop], `ask the human, then run 'npx tadforce doctor --json --cwd "${start}" --project <yes|path|create>' (after a path, always pass --cwd <that path>)`) : 1;
    const project = p;
    if (project !== start) say(() => log.ok(`Project: ${project}`));
    if (!findWorkspace(project)) {
      await quietly(args.json, () => { ensureWorkspace(project, defaultConfig()); installSkills(project, null); });
      say(() => log.ok('Workspace created: tadforce/ (skills installed for your agents)'));
    }
    const again = (flags) => `npx tadforce doctor --json --cwd "${project}" ${flags}`;
    let ctx = loadWorkspace(project);
    ctx.cfg.setup.projectConfirmed = true; ctx.save(ctx.cfg);
    await applyAnswers(ctx, args);
    ctx = loadWorkspace(project);

    // 3. The org: the default one is proposed; « no » opens the login and asks again.
    const o = await confirmOrg(project, ctx, args, rl);
    if (!o.ok) return o.stop ? finish(args, await evaluate(project, args), [o.stop], `ask the human, then run '${again('--org <alias>')}' (or --source local)`) : 1;
    ctx = loadWorkspace(project);

    // 4. Framing: 6 questions, each with a recommended answer; « accept all » in one keystroke.
    const prop = !ctx.cfg.setup.confirmed && ctx.cfg.org.alias && ctx.cfg.source.mode !== 'local' ? await proposals(ctx.cfg.org.alias) : {};
    const framing = framingQuestions(ctx.cfg, prop);
    if (framing.length) {
      if (!rl) return finish(args, await evaluate(project, args), framing, `ask the human in one message (recommended answers shown; « accept all » is fine), then run '${again('--confirm --lang … --client "…" --integrator …|none --author …|none [--specs …|--no-specs] [--scope …]')}'`);
      const a = await askBatch(rl, 'A few facts only you can confirm:', framing);
      await applyAnswers(loadWorkspace(project), {
        confirm: true, lang: a.lang, client: a.client || undefined,
        integrator: a.integrator || 'none', author: a.author || 'none',
        specs: a.specs || false, scope: a.scope || undefined,
      });
      ctx = loadWorkspace(project);
    }

    // 5. Metadata: org, local or retrieved by the user — and a go before a long retrieve.
    if (!exists(ctx.p('facts', 'facts.json')) || args.refresh) {
      const s = await chooseSource(project, ctx, args, rl);
      if (!s.mode) return s.stop ? finish(args, await evaluate(project, args), [s.stop], `ask the human; the answer is the go: '${again('--source <one of the options: ' + (s.stop.options || []).map((o) => o.split(':')[0]).join('|') + '>')}'`) : 1;
      // doctor's --source (org|local|self) is not facts' --source <folder>: never pass it on
      const { source: _source, project: _project, ...rest } = args;
      const a = { ...rest, json: false, cwd: project, org: s.mode === 'local' ? false : ctx.cfg.org.alias };
      if (s.mode !== 'local') {
        say(() => log.step('Retrieving the metadata from the org (read-only, into tadforce/.snapshot)…'));
        for (const fn of [org.manifest, org.retrieve]) { const code = await quietly(args.json, () => fn(a), true); if (code) return finish(args, await evaluate(project, args), [], 'the retrieve failed: see the messages above'); }
      }
      await quietly(args.json, () => docs.facts(a), true);
      ctx = loadWorkspace(project);
      const found = (readJson(ctx.p('facts', 'facts.json')).inventory || []).length;
      if (!found) {
        // an empty inventory would give an empty document: never report it as green
        fs.rmSync(ctx.p('facts', 'facts.json'), { force: true });
        ctx.cfg.setup.sourceGo = false; ctx.save(ctx.cfg);
        const dirs = sourceDirs(ctx).map((d) => path.relative(project, d) || '.');
        return finish(args, await evaluate(project, args), [], `no metadata found in ${dirs.join(', ') || 'this project'}: retrieve it (source org) or put the sources in the package directories, then run doctor again`);
      }
      await quietly(args.json, () => docs.scaffold(a));
    }

    // 6. Branding (logo, colours) and what the metadata cannot tell — recommended answers again.
    const b = await confirmBranding(ctx, args, rl, say);
    if (b) return finish(args, await evaluate(project, args), [b], `ask the human, then run '${again('--branding keep')}' (or --logo <file|url>)`);
    const fq = factQuestions(loadWorkspace(project));
    if (fq.length) {
      if (!rl) return finish(args, await evaluate(project, args), fq, `ask the human in one message (recommended answers shown), write the answers to the knowledge files, then run '${again('--facts-reviewed')}' (it recomputes the facts)`);
      const changed = await askFacts(loadWorkspace(project), rl, fq);
      const c2 = loadWorkspace(project); c2.cfg.setup.factsReviewed = true; c2.save(c2.cfg);
      if (changed) await quietly(args.json, () => docs.facts({ cwd: project, org: false }));
    }
    // answers written to the knowledge files (systems, exclusions) change the facts: recompute once
    const c3 = loadWorkspace(project);
    if (c3.cfg.setup.factsDirty) {
      await quietly(args.json, () => docs.facts({ cwd: project, org: false }));
      const c4 = loadWorkspace(project); delete c4.cfg.setup.factsDirty; c4.save(c4.cfg);
    }

    // 7. All green: say it, and offer to start the writing.
    const last = await evaluate(project, args);
    const translate = last.list.some((x) => x.id === 'language') ? 'first translate once (check « language »), then ' : '';
    const code = finish(args, last, [], null, `${translate}write the sections: 'npx tadforce next --json --cwd "${project}"' (loop), then 'npx tadforce build --cwd "${project}"'`);
    // CI, agents (--json) and agent sessions stop here; a person in a terminal is offered the writing.
    if (code || args.json || args.launch === false || !process.stdin.isTTY || insideAgent()) return code;
    return handOver(project, args, rl);
  } finally {
    if (rl) rl.close();
  }
}

/**
 * Everything is green: offer to start the AI agent on the writing, in this terminal. The agent is chosen
 * once (--agent claude|codex|gemini|cursor) and remembered; --no-launch stops at the prerequisites.
 */
async function handOver(project, args, rl) {
  const ctx = loadWorkspace(project);
  const found = installedAgents();
  const wanted = typeof args.agent === 'string' ? args.agent : ctx.cfg.setup.agent;
  let agent = found.find((a) => a.id === wanted) || (wanted ? null : found[0]);
  if (!agent) {
    log.human(found.length ? `agent "${wanted}" not found; installed: ${found.map((a) => a.id).join(', ')} (--agent <id>).` : 'open your AI agent (Claude Code, Codex, Cursor, Copilot…) in this folder and type /tadforce to write the document.');
    return 0;
  }
  if (rl) {
    if (!yes((await rl.question(`  Launch the writing of the document now with ${agent.name}? [Y/n] `)).trim())) {
      log.info(`Later: open your agent in ${project} and type /tadforce.`);
      rl.close(); return 0;
    }
    if (found.length > 1 && !wanted) {
      const pick = (await rl.question(`  Agent (${found.map((a) => a.id).join('/')}) [${agent.id}]: `)).trim();
      agent = found.find((a) => a.id === pick) || agent;
    }
    rl.close();
  }
  ctx.cfg.setup.agent = agent.id; ctx.save(ctx.cfg);
  log.step(`Handing over to ${agent.name}: it writes the document, then builds and validates it…`);
  return launchAgent(agent, project);
}

/** In --json mode stdout carries only the answer: messages are dropped, or sent to stderr as progress. */
async function quietly(json, fn, progress = false) {
  if (!json) return fn();
  const orig = console.log;
  console.log = progress ? (...a) => process.stderr.write(a.join(' ') + '\n') : () => {};
  if (progress) setQuiet(false);
  try { return await fn(); } finally { console.log = orig; if (progress) setQuiet(true); }
}

function finish(args, st, questions, next, after = 'npx tadforce build') {
  const ok = !next && st.list.every((x) => x.level !== 'error');
  if (args.json) {
    console.log(JSON.stringify({ ok, checks: st.list, questions, next: next || after }, null, 2));
    return ok ? 0 : 1;
  }
  for (const x of st.list) {
    const icon = x.level === 'ok' ? c.green('✔') : x.level === 'warn' ? c.yellow('⚠') : c.red('✖');
    console.log(`${icon} ${x.message}`);
    if (x.fix && x.level !== 'ok') console.log(`    ${x.human ? c.cyan('☞ your move: ') : c.dim('fix: ')}${x.fix}`);
  }
  if (ok) log.ok('Ready. Next: `tadforce build` (or /tadforce in your agent). Evidence first.');
  else log.human(next || 'fix the points above, then run tadforce doctor again.');
  return ok ? 0 : 1;
}
