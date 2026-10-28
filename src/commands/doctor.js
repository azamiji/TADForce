import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { exists, readJson } from '../util/fsx.js';
import { findWorkspace } from '../util/config.js';
import { CONFIG_FILE } from '../util/paths.js';
import { sfVersion, sfJson } from '../sf/sf.js';
import { findBrowser } from '../build/browser.js';
import { log, c } from '../util/log.js';

/** Prerequisite checks. Each check says what to do: fixed by TADForce, or a human action. */
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
  add('sfdx-project', hasProject, hasProject ? `SFDX project: ${readJson(sfdx).name || path.basename(cwd)}` : 'No sfdx-project.json in this folder', hasProject ? null : '`tadforce init` creates a minimal SFDX project here', false, hasProject ? 'ok' : 'warn');

  const ws = findWorkspace(cwd);
  add('workspace', !!ws, ws ? `Workspace: ${path.relative(cwd, ws) || '.'}` : 'No TADForce workspace yet', ws ? null : 'npx tadforce init', false, ws ? 'ok' : 'warn');

  if (sf) {
    let orgs = [];
    try {
      const r = await sfJson(['org', 'list'], { timeoutMs: 60000 });
      orgs = [...(r.nonScratchOrgs || []), ...(r.scratchOrgs || []), ...(r.sandboxes || []), ...(r.other || [])].filter((o) => o.connectedStatus === 'Connected' || o.isExpired === false || o.status === 'Active');
    } catch { /* treated below */ }
    const unique = [...new Map(orgs.map((o) => [o.username, o])).values()];
    const alias = ws ? readJson(path.join(ws, CONFIG_FILE)).org?.alias : null;
    const chosen = alias && unique.find((o) => o.alias === alias || o.username === alias);
    if (!unique.length) add('org', false, 'No authorized Salesforce org', 'npx tadforce auth --alias <alias> [--sandbox]   (opens the browser: log in and allow access)', true);
    else if (alias && !chosen) add('org', false, `Configured org "${alias}" is not authorized on this machine`, `npx tadforce auth --alias ${alias}`, true);
    else add('org', true, chosen ? `Target org: ${chosen.alias || chosen.username} (${chosen.instanceUrl})` : `${unique.length} authorized org(s): ${unique.map((o) => o.alias || o.username).join(', ')}`, chosen ? null : 'Pick one: npx tadforce init --org <alias>', false, chosen ? 'ok' : 'warn');
  }
  return out;
}

export async function run(args) {
  const list = await checks(args.cwd || process.cwd());
  if (args.json) { console.log(JSON.stringify({ ok: list.every((x) => x.level !== 'error'), checks: list }, null, 2)); return list.every((x) => x.level !== 'error') ? 0 : 1; }
  log.banner('doctor');
  for (const x of list) {
    const icon = x.level === 'ok' ? c.green('✔') : x.level === 'warn' ? c.yellow('⚠') : c.red('✖');
    console.log(`${icon} ${x.message}`);
    if (x.fix) console.log(`    ${x.human ? c.cyan('☞ your move: ') : c.dim('fix: ')}${x.fix}`);
  }
  const bad = list.filter((x) => x.level === 'error');
  if (bad.length) log.fail(`${bad.length} prerequisite(s) missing.`); else log.ok('Ready. Evidence first.');
  return bad.length ? 1 : 0;
}
