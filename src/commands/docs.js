// facts, scaffold, build, validate, comments, status, prepare.
import fs from 'node:fs';
import path from 'node:path';
import { exists, writeJson, readText, copyDir, stableStringify } from '../util/fsx.js';
import { loadWorkspace, sourceDirs } from '../util/config.js';
import { TEMPLATES } from '../util/paths.js';
import { extractFacts, readCodeAnalyzer, loadFacts } from '../facts/index.js';
import { collectOrgFacts } from '../facts/org.js';
import { buildDocument, readComments, outputName, DOCS } from '../build/render.js';
import { exportPdf, exportDocx } from '../build/export.js';
import { closeBrowser } from '../build/browser.js';
import { validateDocument } from '../validate/index.js';
import { log, c } from '../util/log.js';
import * as org from './org.js';

const docsOf = (args) => (!args.doc || args.doc === 'all' ? DOCS : String(args.doc).split(','));

export async function facts(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const dirs = args.source ? [path.resolve(args.source)] : sourceDirs(ctx);
  if (!dirs.length) throw new Error('No metadata found: run `tadforce retrieve` (or point --source at a force-app folder).');
  log.banner('facts');
  log.step(`Reading metadata from ${dirs.map((d) => path.relative(ctx.project, d) || '.').join(', ')}`);
  let orgFacts = exists(ctx.p('facts', 'org.json')) ? JSON.parse(readText(ctx.p('facts', 'org.json'))) : null;
  const knowledge = { exclusions: ctx.exclusions(), glossary: ctx.glossary() };
  let f = extractFacts(dirs, knowledge, { base: ctx.project, org: orgFacts, codeAnalyzer: readCodeAnalyzer(ctx.ws) });
  if (args.org) {
    const alias = typeof args.org === 'string' ? args.org : ctx.cfg.org.alias;
    if (!alias) throw new Error('No org alias for --org.');
    log.step('Collecting aggregated org facts (counts, users per profile, jobs, coverage)…');
    orgFacts = await collectOrgFacts(alias, f, { onProgress: (s) => log.info(s) });
    writeJson(ctx.p('facts', 'org.json'), orgFacts);
    f = extractFacts(dirs, knowledge, { base: ctx.project, org: orgFacts, codeAnalyzer: readCodeAnalyzer(ctx.ws) });
    if (orgFacts.errors.length) log.warn(`${orgFacts.errors.length} org query(ies) failed — see facts/org.json`);
  }
  writeJson(ctx.p('facts', 'facts.json'), f);
  const questions = buildQuestions(f, orgFacts);
  writeJson(ctx.p('facts', 'questions.json'), questions);
  const k = f.counts;
  log.ok(`facts.json: ${k.apex.classes} classes (+${k.apex.tests} tests), ${k.apex.triggers} triggers, ${k.flows.active} active flows, ${k.ui.lwc} LWC, ${k.objects.custom} custom objects, ${k.security.permissionSetGroups} PSG`);
  log.info(`modules: ${Object.entries(f.modules).filter(([kk, v]) => v === true).map(([kk]) => kk).join(', ') || 'none'}${f.modules.products.length ? ' · products: ' + f.modules.products.join(', ') : ''}`);
  if (questions.systems.length) log.human(`${questions.systems.length} external endpoint(s) need a system name → knowledge/glossary.yml (see facts/questions.json).`);
  if (questions.exclusions.total) log.human(`${questions.exclusions.total} component(s) look unused → confirm or reject in knowledge/exclusions.yml.`);
  return 0;
}

/** What only a human can answer, grouped so it can be confirmed in one pass. */
export function buildQuestions(f, orgFacts) {
  const byReason = {};
  for (const cnd of f.exclusions.candidates) {
    const key = cnd.reasons[0].replace(/name suggests .*/, 'name suggests test / demo / POC / sample');
    (byReason[key] ||= []).push(`${cnd.type}:${cnd.name}`);
  }
  if (orgFacts && orgFacts.volumes) {
    const empty = orgFacts.volumes.filter((v) => v.records === 0).map((v) => `object:${v.object}`);
    if (empty.length) byReason['object with no record in the org'] = empty;
  }
  const hosts = new Map();
  for (const e of f.systems.unnamed) { const key = e.host || `${e.kind}:${e.name}`; if (!hosts.has(key)) hosts.set(key, []); hosts.get(key).push(`${e.kind}:${e.name}`); }
  return {
    systems: [...hosts.entries()].map(([key, endpoints]) => ({ key, endpoints, question: 'Which system is this? (name as the client calls it)' })),
    exclusions: { total: f.exclusions.candidates.length, groups: Object.entries(byReason).map(([reason, items]) => ({ reason, count: items.length, items })) },
    modules: f.modules,
    language: orgFacts && orgFacts.organization ? orgFacts.organization.language : null,
  };
}

export async function scaffold(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const lang = ctx.cfg.language === 'fr' ? 'fr' : 'en';
  for (const doc of docsOf(args)) {
    const src = path.join(TEMPLATES, doc, lang);
    const dst = ctx.p('src', doc);
    const before = exists(dst) ? fs.readdirSync(dst).length : 0;
    copyDir(src, dst, { overwrite: !!args.force });
    const after = fs.readdirSync(dst).length;
    log.ok(`src/${doc}: ${after} chapter file(s)${before && !args.force ? ' (existing files kept)' : ''}`);
  }
  return 0;
}

export async function build(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  log.banner('build');
  let failed = 0;
  try {
    for (const doc of docsOf(args)) {
      if (!exists(ctx.p('src', doc))) { log.warn(`src/${doc} missing — skipped`); continue; }
      const r = await buildDocument(ctx, doc, { render: args.render !== false });
      log.ok(`${path.relative(ctx.project, r.html)} (${r.sizeKB} KB, ${r.figures} figures)`);
      const wantPdf = args.pdf ?? ctx.cfg.outputs.pdf;
      const wantDocx = args.docx ?? ctx.cfg.outputs.docx;
      if (wantPdf && args.render !== false) { const p = r.html.replace(/\.html$/, '.pdf'); const s = await exportPdf(r.html, p); log.ok(`${path.relative(ctx.project, p)} (${Math.round(s / 1024)} KB)`); }
      if (wantDocx && args.render !== false) { const p = r.html.replace(/\.html$/, '.docx'); const s = await exportDocx(r.html, p); log.ok(`${path.relative(ctx.project, p)} (${Math.round(s / 1024)} KB)`); }
      const v = validateDocument(ctx, doc, { buildReport: r });
      report(v, doc);
      if (!v.ok) failed++;
    }
  } finally {
    await closeBrowser();
  }
  return args.strict && failed ? 1 : 0;
}

function report(v, doc) {
  const icon = v.ok ? c.green('✔') : c.red('✖');
  console.log(`${icon} validate ${doc}: score ${v.score}/100 — ${v.errors.length} error(s), ${v.warnings.length} warning(s)`);
  const show = [...v.errors, ...v.warnings.slice(0, Math.max(0, 25 - v.errors.length))];
  for (const i of show.slice(0, 40)) console.log(`   ${i.level === 'error' ? c.red('error') : c.yellow('warn ')} ${c.dim(i.code)} ${i.message}${i.where ? c.dim('  ' + i.where) : ''}`);
  const hidden = v.errors.length + v.warnings.length - Math.min(40, show.length);
  if (hidden > 0) console.log(c.dim(`   … ${hidden} more (tadforce validate --json)`));
}

export async function validate(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const results = {};
  try {
    for (const doc of docsOf(args)) {
      if (!exists(ctx.p('src', doc))) continue;
      // dry build (no browser) into the cache, so that anchors and placeholders are checked too
      const cfgOut = { ...ctx, cfg: { ...ctx.cfg, outputs: { ...ctx.cfg.outputs, dir: '.cache/validate' } } };
      const r = await buildDocument(cfgOut, doc, { render: false });
      results[doc] = validateDocument(ctx, doc, { buildReport: r });
      if (!args.json) report(results[doc], doc);
    }
  } finally { await closeBrowser(); }
  if (args.json) console.log(JSON.stringify(results, null, 2));
  return Object.values(results).every((r) => r.ok) ? 0 : 1;
}

export async function comments(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const doc = args.doc && args.doc !== 'all' ? args.doc : 'tad';
  const file = args._[1] ? path.resolve(args._[1]) : path.join(ctx.p(ctx.cfg.outputs.dir || 'out'), outputName(ctx.cfg, doc) + '.html');
  if (!exists(file)) throw new Error(`No such file: ${file}`);
  const list = readComments(readText(file)).filter((x) => args.all || x.status !== 'resolved');
  if (args.json) { console.log(stableStringify(list.map((x) => ({ ...x, image: x.image ? '[image attached]' : null })))); return 0; }
  log.banner(`comments · ${path.basename(file)}`);
  if (!list.length) { log.ok('No open comment.'); return 0; }
  list.forEach((x, i) => {
    console.log(`${c.bold('#' + (i + 1))} ${c.dim(x.id)} [${x.section}] ${x.quote ? '« ' + x.quote.slice(0, 160) + ' »' : c.dim('(captured area' + (x.image ? ', image attached' : '') + ')')}`);
    console.log(`   → ${x.comment}`);
  });
  return 0;
}

export async function status(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const f = loadFacts(ctx.ws);
  const line = (ok, s) => console.log(`${ok ? c.green('✔') : c.dim('○')} ${s}`);
  log.banner('status');
  line(!!ctx.cfg.org.alias, `org: ${ctx.cfg.org.alias || 'not set'}`);
  line(exists(ctx.p('.snapshot', 'package.xml')), 'manifest');
  line(exists(ctx.p(ctx.cfg.source.dir)), 'snapshot retrieved');
  line(!!f, `facts${f ? ` (${f.inventory.length} components${f.org ? ', org facts' : ''})` : ''}`);
  for (const doc of DOCS) {
    const dir = ctx.p('src', doc);
    if (!exists(dir)) { line(false, `src/${doc}`); continue; }
    const text = fs.readdirSync(dir).filter((x) => x.endsWith('.md')).map((x) => readText(path.join(dir, x))).join('\n');
    const pending = (text.match(/<!--\s*tad:pending/g) || []).length;
    line(pending === 0, `src/${doc}: ${pending ? pending + ' section(s) to write' : 'written'}`);
  }
  return 0;
}

/** Deterministic part of the pipeline in one go: manifest → retrieve → facts (--org) → scaffold. */
export async function prepare(args) {
  const steps = [];
  if (!args.skipRetrieve) { steps.push(['manifest', org.manifest], ['retrieve', org.retrieve]); }
  for (const [, fn] of steps) { const code = await fn(args); if (code) return code; }
  const code = await facts({ ...args, org: args.org === false ? false : (args.org || true) });
  if (code) return code;
  return scaffold(args);
}
