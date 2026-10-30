// `tadforce doctor`: everything before the writing, in one loop that runs until all is green —
// tools, project, org connection, metadata, the framing questions and the questions only a human can answer.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { exists, readJson, readText, writeText } from '../util/fsx.js';
import { findWorkspace, defaultConfig, DEFAULT_BRAND, loadWorkspace, sourceDirs } from '../util/config.js';
import { CONFIG_FILE } from '../util/paths.js';
import { LANGUAGES, normalizeLang } from '../util/i18n.js';
import { sfVersion, sfJson, sfInteractive, soql } from '../sf/sf.js';
import { findBrowser, closeBrowser } from '../build/browser.js';
import { findLogoCandidates, orgThemeColors, imageColors, paletteFrom } from '../build/brand.js';
import { log, c, setQuiet } from '../util/log.js';
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
  add('sfdx-project', hasProject, hasProject ? `SFDX project: ${readJson(sfdx).name || path.basename(cwd)}` : 'No sfdx-project.json in this folder', hasProject ? null : 'tadforce doctor creates a minimal SFDX project here', false, hasProject ? 'ok' : 'warn');
  return out;
}

/** The org to document: --org, the workspace, then the project's target-org (sf config). */
async function resolveAlias(project, args, cfg) {
  if (typeof args.org === 'string') return args.org;
  if (cfg && cfg.org && cfg.org.alias) return cfg.org.alias;
  try {
    const r = await sfJson(['config', 'get', 'target-org'], { cwd: project, timeoutMs: 60000 });
    const v = Array.isArray(r) && r[0] && r[0].value;
    return v || null;
  } catch { return null; }
}

async function orgStatus(alias) {
  if (!alias) return { ok: false, reason: 'none' };
  try {
    const d = await sfJson(['org', 'display', '--target-org', alias], { timeoutMs: 120000 });
    if (d.connectedStatus && !/^connected$/i.test(d.connectedStatus) && !/^active$/i.test(d.status || '')) return { ok: false, reason: 'expired', detail: d.connectedStatus };
    return { ok: true, username: d.username, instanceUrl: d.instanceUrl, sandbox: /test\.salesforce|sandbox|\.cs\d+\./i.test(d.instanceUrl || '') };
  } catch (e) { return { ok: false, reason: 'expired', detail: e.message.slice(0, 160) }; }
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

const listArg = (v) => (typeof v !== 'string' ? undefined : v.split(',').map((x) => x.trim()).filter(Boolean));

/** Answers given as flags (the agent's way of answering) are written to the config. */
async function applyAnswers(ctx, args) {
  const cfg = ctx.cfg;
  const set = (cond, fn) => { if (cond) fn(); };
  set(args.lang, () => { cfg.language = normalizeLang(args.lang); });
  set(args.client, () => { cfg.client.name = String(args.client); if (!args.short && (cfg.client.short === 'CLIENT' || !cfg.client.short)) cfg.client.short = String(args.client).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase(); });
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
  if (args.factsReviewed) cfg.setup.factsReviewed = true;
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

/** Questions only a human can answer, each with a recommended answer. */
function framingQuestions(cfg, prop, alias, hasLocal) {
  const q = [];
  const ask = (id, question, recommended, extra = {}) => q.push({ id, question, recommended, ...extra });
  if (!cfg.setup.confirmed) {
    ask('lang', `Document language — ${LANGUAGES.join(', ')} built in, or any language code (es, de, it, pt, nl, ar, ja…): the agent then translates the headings and labels once`, prop.language || cfg.language, { options: [...LANGUAGES, 'other'] });
    ask('client', 'Client name, as it must appear in the document', prop.client || cfg.client.name);
    ask('short', 'Client short name (file names, references)', cfg.client.short !== 'CLIENT' ? cfg.client.short : String(prop.client || cfg.client.name).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase());
    ask('integrator', 'Integrator, if any (blank: the document only names the client)', cfg.integrator.name || '', { optional: true });
    ask('author', 'Author of the document (blank: no author shown)', cfg.document.author || '', { optional: true });
    ask('title', 'Document title', cfg.document.title);
    ask('scope', 'Part of the org to document — name patterns such as NWB_*,Loan* (blank: the whole org)', (cfg.scope.include || []).join(','), { optional: true });
    ask('logo', `Client logo — a file or a URL${cfg.client.logo ? ` (current: ${cfg.client.logo})` : ' (blank: searched in the org, then a badge with initials)'}`, cfg.client.logo || '', { optional: true });
  }
  if (!cfg.setup.specsAsked && !(cfg.inputs.specs || []).length) ask('specs', 'Functional specifications or other project documents (PDF, DOCX, MD) — comma-separated paths (blank: none)', '', { optional: true });
  if (!cfg.source.mode) {
    ask('source', 'Metadata to document', alias ? 'org' : 'local', { options: ['org', 'local', 'both'], help: 'org: retrieve every metadata type from the org (recommended — the org is the truth); local: the force-app sources already here' + (hasLocal ? '' : ' (none found)') + '; both: org first, local sources added' });
  }
  return q;
}

/** Systems to name and exclusions to confirm, from facts/questions.json. */
function factQuestions(ctx) {
  const p = ctx.p('facts', 'questions.json');
  if (!exists(p) || ctx.cfg.setup.factsReviewed) return [];
  const qs = readJson(p);
  const out = [];
  for (const s of qs.systems || []) out.push({ id: `system:${s.key}`, kind: 'system', question: `Which system is ${s.key}? (name as the client calls it; blank: to be confirmed)`, endpoints: s.endpoints, writeTo: 'knowledge/glossary.yml › systems' });
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

/** One pass: where the workspace stands, and what remains. */
async function evaluate(project, args) {
  const tools = await checks(project);
  const ws = findWorkspace(project);
  const cfg = ws ? defaultConfig(readJson(path.join(ws, CONFIG_FILE))) : defaultConfig();
  const alias = tools.find((t) => t.id === 'sf-cli').ok ? await resolveAlias(project, args, cfg) : null;
  const status = alias ? await orgStatus(alias) : { ok: false, reason: 'none' };
  const list = [...tools];
  const add = (id, ok, message, fix = null, human = false, level = ok ? 'ok' : 'error') => list.push({ id, ok, level, message, fix, human });
  add('workspace', !!ws, ws ? `Workspace: ${path.relative(project, ws) || '.'}` : 'No TADForce workspace yet', ws ? null : 'created by doctor', false, ws ? 'ok' : 'warn');
  const wantOrg = cfg.source.mode !== 'local';
  if (wantOrg) {
    if (status.ok) add('org', true, `Org: ${alias} (${status.instanceUrl})`);
    else if (status.reason === 'none') add('org', false, 'No org connected to this project', 'log in once in the browser (doctor opens it), or `--source local` to document the local sources only', true);
    else add('org', false, `Org "${alias}" is not connected (${status.detail || 'session expired'})`, 'log in again in the browser (doctor opens it)', true);
  }
  let facts = false, snapshot = false;
  if (ws) {
    const ctx = loadWorkspace(project);
    snapshot = exists(ctx.p(ctx.cfg.source.dir));
    facts = exists(ctx.p('facts', 'facts.json'));
    const lang = normalizeLang(ctx.cfg.language);
    const own = ctx.p('i18n', `${lang}.json`);
    if (!LANGUAGES.includes(lang) && exists(own) && readJson(own)._translate) add('language', true, `Document language "${lang}": headings and labels still to translate (once)`, `the agent translates the headings of src/*/*.md (keep the {#anchors}) and the values of tadforce/i18n/${lang}.json, then removes its "_translate" line`, false, 'warn');
    add('metadata', facts, facts ? `Metadata: ${snapshot ? 'retrieved from the org' : 'local sources'} → facts/facts.json` : 'Metadata not collected yet', facts ? null : 'doctor retrieves it once the questions are answered');
  }
  return { tools, ws, cfg, alias, status, list, facts, snapshot };
}

export async function run(args) {
  const project = path.resolve(args.cwd || process.cwd());
  const interactive = process.stdin.isTTY && !args.json && !args.yes;
  const rl = interactive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const say = (fn) => { if (!args.json) fn(); };
  if (args.json) setQuiet(true);
  say(() => log.banner('doctor'));
  try {
    for (let round = 1; round <= 8; round++) {
      let st = await evaluate(project, args);
      // 1. Tools: TADForce installs what it may, the rest is a human action.
      const sfMissing = st.tools.find((t) => t.id === 'sf-cli' && !t.ok);
      if (sfMissing && rl && /^(y|o|yes|oui|)$/i.test((await rl.question(`  Salesforce CLI missing. Install it now with npm? [Y/n] `)).trim())) {
        spawnSync('npm', ['install', '--global', '@salesforce/cli'], { stdio: 'inherit', shell: process.platform === 'win32' });
        continue;
      }
      const blocking = st.tools.filter((t) => t.level === 'error');
      if (blocking.length) return finish(args, st, [], [], 'install the missing tools, then run tadforce doctor again');

      // 2. Workspace (with the skills for the agents of this project)
      if (!st.ws) {
        await quietly(args.json, () => { ensureWorkspace(project, defaultConfig({ org: { alias: st.alias || null } })); installSkills(project, null); });
        say(() => log.ok('Workspace created: tadforce/ (skills installed for your agents)'));
        st = await evaluate(project, args);
      }
      const ctx = loadWorkspace(project);
      ctx.cfg.setup = ctx.cfg.setup || {};
      const hasLocal = (readJson(path.join(project, 'sfdx-project.json')).packageDirectories || []).some((d) => exists(path.join(project, d.path)) && fs.readdirSync(path.join(project, d.path), { recursive: true }).some((f) => String(f).endsWith('-meta.xml')));
      await applyAnswers(ctx, args);

      // 3. Org connection: reuse the project's target-org, log in only when needed.
      if (ctx.cfg.source.mode !== 'local' && !st.status.ok) {
        if (!rl) return finish(args, st, [], [], 'the human logs in: run `tadforce doctor` in a terminal (it opens the browser), or `sf org login web --alias <alias> --set-default`');
        if (hasLocal && /^l/i.test((await rl.question('  No org connected. Log in now, or document the local sources only? [Login/local] ')).trim())) { ctx.cfg.source.mode = 'local'; ctx.save(ctx.cfg); continue; }
        const def = st.alias || 'tadforce-org';
        const alias = (await rl.question(`  Org alias to log in [${def}]: `)).trim() || def;
        const sandbox = /^(y|o|yes|oui)$/i.test((await rl.question('  Is it a sandbox? [y/N] ')).trim());
        log.human('a browser window opens: log in to the org, then click « Allow ».');
        if (sfInteractive(['org', 'login', 'web', '--alias', alias, '--set-default', ...(sandbox ? ['--instance-url', 'https://test.salesforce.com'] : [])])) { ctx.cfg.org.alias = alias; ctx.save(ctx.cfg); }
        continue;
      }
      if (st.alias && ctx.cfg.org.alias !== st.alias && st.status.ok) { ctx.cfg.org.alias = st.alias; ctx.save(ctx.cfg); }

      // 4. Framing questions (one batch, each with a recommendation)
      const prop = st.status.ok ? await proposals(st.alias) : {};
      const framing = framingQuestions(ctx.cfg, prop, st.status.ok ? st.alias : null, hasLocal);
      if (framing.length) {
        if (!rl) return finish(args, st, framing, [], 'ask the human these questions in one message, then run `tadforce doctor --json --confirm --<id> "<answer>"…`');
        log.step('A few facts only you can confirm (Enter keeps the recommendation):');
        const answers = {};
        for (const q of framing) {
          const a = (await rl.question(`  ${q.question}${q.options ? ` (${q.options.join('/')})` : ''}${q.recommended ? ` [${q.recommended}]` : ''}: `)).trim();
          answers[q.id] = a || q.recommended || (q.optional ? '' : undefined);
          if (q.id === 'lang' && /^(other|autre)$/i.test(a)) answers.lang = (await rl.question('  Language code (es, de, it, pt, nl, ar, ja…): ')).trim() || 'en';
        }
        const flags = { confirm: true, specs: answers.specs || false };
        for (const [k, v] of Object.entries(answers)) if (v !== undefined) flags[k === 'logo' ? 'logo' : k] = v === '' && ['integrator', 'author'].includes(k) ? 'none' : v === '' ? undefined : v;
        await applyAnswers(loadWorkspace(project), flags);
        continue;
      }

      // 5. Metadata: retrieve from the org (curated `*` manifest) and/or read the local sources, then facts.
      const mode = ctx.cfg.source.mode || 'org';
      if (!st.facts || args.refresh) {
        const a = { ...args, cwd: project, org: mode === 'local' ? false : ctx.cfg.org.alias, quiet: args.json };
        if (mode !== 'local') {
          say(() => log.step('Retrieving the metadata from the org (read-only, into tadforce/.snapshot)…'));
          for (const fn of [org.manifest, org.retrieve]) { const code = await quietly(args.json, () => fn(a)); if (code) return finish(args, st, [], [], 'retrieve failed: see the messages above'); }
        }
        await quietly(args.json, () => docs.facts(a));
        await quietly(args.json, () => docs.scaffold(a));
        args.refresh = false;
        continue;
      }

      // 6. Branding from evidence
      for (const n of await brand(loadWorkspace(project))) say(() => log.ok(n));

      // 7. Facts questions (systems, exclusions, decommissioned features)
      const fq = factQuestions(loadWorkspace(project));
      if (fq.length) {
        if (!rl) return finish(args, st, [], fq, 'ask the human, write the answers to the knowledge files, then run `tadforce doctor --json --facts-reviewed`');
        log.step('What the metadata cannot tell (Enter: skip / to be confirmed):');
        const changed = await askFacts(loadWorkspace(project), rl, fq);
        const c2 = loadWorkspace(project); c2.cfg.setup.factsReviewed = true; c2.save(c2.cfg);
        if (changed) await quietly(args.json, () => docs.facts({ cwd: project, org: c2.cfg.source.mode === 'local' ? false : c2.cfg.org.alias }));
        continue;
      }

      st = await evaluate(project, args);
      return finish(args, st, [], [], null);
    }
    log.fail('doctor stopped after 8 rounds: run it again.');
    return 1;
  } finally {
    if (rl) rl.close();
  }
}

async function quietly(json, fn) {
  if (!json) return fn();
  const orig = console.log; console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
}

function finish(args, st, framing, facts, next) {
  const ok = !next && st.list.every((x) => x.level !== 'error');
  if (args.json) {
    console.log(JSON.stringify({ ok, checks: st.list, questions: [...framing, ...facts], next: next || 'tadforce build' }, null, 2));
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
