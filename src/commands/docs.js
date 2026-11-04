// facts, scaffold, build (understand → write → review → render), validate, comments, status, prepare.
import fs from 'node:fs';
import path from 'node:path';
import { exists, writeJson, writeText, readText, readJson, stableStringify, walk } from '../util/fsx.js';
import { loadWorkspace, sourceDirs, sourceFlags, runnerOf } from '../util/config.js';
import { resolveConditionals } from '../build/directives.js';
import { TEMPLATES } from '../util/paths.js';
import { LANGUAGES, normalizeLang, templateLang } from '../util/i18n.js';
import { extractFacts, readCodeAnalyzer, loadFacts } from '../facts/index.js';
import { collectOrgFacts } from '../facts/org.js';
import { fingerprints } from '../facts/fingerprints.js';
import { RECOMMENDED } from '../facts/heuristics/exclusions.js';
import { sectionFilter, filterSkeleton, syncSkeleton } from '../facts/outline.js';
import { buildDocument, readComments, outputName, DOCS } from '../build/render.js';
import { exportPdf, exportDocx } from '../build/export.js';
import { closeBrowser, findBrowser } from '../build/browser.js';
import { figureQA } from '../build/figqa.js';
import { writeInventoryXlsx } from '../build/xlsx.js';
import { validateDocument, qualityGate } from '../validate/index.js';
import { log, c, setQuiet } from '../util/log.js';
import * as org from './org.js';
import { specWithFacts } from './spec.js';
import * as understand from '../understand/index.js';
import { installedAgents, insideAgent, launchAgent } from '../util/agents.js';

const docsOf = (args) => (!args.doc || args.doc === 'all' ? DOCS : String(args.doc).split(','));

export async function facts(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  if (args.json) setQuiet(true); // stdout carries the JSON only
  // --source names a folder: one that does not exist is an error, never an empty inventory
  if (typeof args.source === 'string' && !exists(path.resolve(args.source))) throw new Error(`--source: no such folder ${path.resolve(args.source)} (use the folder that holds the metadata, e.g. force-app).`);
  const dirs = typeof args.source === 'string' ? [path.resolve(args.source)] : sourceDirs(ctx);
  if (!dirs.length) throw new Error('No metadata found: run `tadforce retrieve` (or point --source at a force-app folder).');
  log.banner('facts');
  log.step(`Reading metadata from ${dirs.map((d) => path.relative(ctx.project, d) || '.').join(', ')}`);
  let orgFacts = exists(ctx.p('facts', 'org.json')) ? JSON.parse(readText(ctx.p('facts', 'org.json'))) : null;
  const knowledge = { exclusions: ctx.exclusions(), glossary: ctx.glossary(), scope: ctx.cfg.scope };
  const extra = { retrieve: typeof args.source === 'string' ? null : retrieveInfo(ctx, dirs), hints: { aliases: packageAliases(ctx.project) } };
  let f = extractFacts(dirs, knowledge, { base: ctx.project, org: orgFacts, codeAnalyzer: readCodeAnalyzer(ctx.ws), ...extra });
  if (args.org) {
    const alias = typeof args.org === 'string' ? args.org : ctx.cfg.org.alias;
    if (!alias) throw new Error('No org alias for --org.');
    log.step('Collecting aggregated org facts (counts, users per profile, jobs, coverage)…');
    orgFacts = await collectOrgFacts(alias, f, { onProgress: (s) => log.info(s) });
    writeJson(ctx.p('facts', 'org.json'), orgFacts);
    f = extractFacts(dirs, knowledge, { base: ctx.project, org: orgFacts, codeAnalyzer: readCodeAnalyzer(ctx.ws), ...extra });
    if (orgFacts.errors.length) log.warn(`${orgFacts.errors.length} org query(ies) failed — see facts/org.json`);
  }
  writeJson(ctx.p('facts', 'facts.json'), f);
  // baseline for `tadforce update`: what this version of the document was written from
  writeJson(ctx.p('facts', 'fingerprints.json'), fingerprints(dirs));
  const questions = buildQuestions(f, orgFacts);
  writeJson(ctx.p('facts', 'questions.json'), questions);
  const k = f.counts;
  if (args.json) { console.log(JSON.stringify({ components: f.inventory.length, counts: k, modules: f.modules.products, sources: f.sources, questions: { systems: questions.systems.length, exclusions: questions.exclusions.total } }, null, 2)); return f.inventory.length ? 0 : 1; }
  const missing = Object.entries(f.coverageByCount).filter(([, v]) => v === 'missing').map(([k]) => k);
  if (missing.length) log.info(`not collected (written « not collected », not 0): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` … +${missing.length - 8}` : ''}`);
  if (!f.inventory.length) log.warn(`No component found in ${dirs.map((d) => path.relative(ctx.project, d) || '.').join(', ')}: is the metadata there?`);
  log.ok(`facts.json: ${k.apex.classes} classes (+${k.apex.tests} tests), ${k.apex.triggers} triggers, ${k.flows.active} active flows, ${k.ui.lwc} LWC, ${k.objects.custom} custom objects, ${k.security.permissionSetGroups} PSG`);
  log.info(`modules: ${Object.entries(f.modules).filter(([kk, v]) => v === true).map(([kk]) => kk).join(', ') || 'none'}${f.modules.products.length ? ' · products: ' + f.modules.products.join(', ') : ''}`);
  if (questions.systems.length) log.human(`${questions.systems.length} external endpoint(s) need a system name → knowledge/glossary.yml (see facts/questions.json).`);
  if (questions.exclusions.total) log.human(`${questions.exclusions.total} component(s) look unused → confirm or reject in knowledge/exclusions.yml.`);
  return 0;
}

/** What TADForce's own retrieve asked for and got: the types of the manifest, the failed and the unsupported ones. */
function retrieveInfo(ctx, dirs) {
  const snap = ctx.p(ctx.cfg.source.dir);
  const mr = ctx.p('.snapshot', 'manifest-report.json');
  if (!dirs.some((d) => path.resolve(d) === path.resolve(snap)) || !exists(mr)) return null;
  const m = readJson(mr);
  const rr = ctx.p('.snapshot', 'retrieve-report.json');
  const report = exists(rr) ? readJson(rr) : {};
  // a type every org has that came back empty was missed by the retrieve: not collected, not a measured 0
  const failed = [...(report.failed || []).map((x) => x.type), ...(report.suspicious || [])];
  return { requested: m.kept || [], dropped: m.dropped || [], failed };
}

/** Packages the project depends on (sfdx-project.json › packageAliases, dependencies): libraries are found by them too. */
function packageAliases(project) {
  const p = path.join(project, 'sfdx-project.json');
  if (!exists(p)) return [];
  try {
    const j = readJson(p);
    const deps = (j.packageDirectories || []).flatMap((d) => (d.dependencies || []).map((x) => x.package)).filter(Boolean);
    return [...new Set([...Object.keys(j.packageAliases || {}).map((k) => k.replace(/@.*$/, '')), ...deps.map((d) => String(d).replace(/@.*$/, ''))])].sort();
  } catch { return []; }
}

/** What only a human can answer, grouped so it can be confirmed in one pass. */
export function buildQuestions(f, orgFacts) {
  const byReason = {};
  const recommended = {};
  for (const cnd of f.exclusions.candidates) {
    const key = cnd.reasons[0].replace(/^component of (.+?)( \(package .*\))?, deployed without namespace$/, 'components of $1, a library deployed without namespace').replace(/name suggests .*/, 'name suggests an unused component (test, demo, POC, sample, old, legacy…)');
    (byReason[key] ||= []).push(`${cnd.type}:${cnd.name}`);
    // the group's recommendation comes from the category of its candidates (never « exclude » for a mere suspicion)
    if (!(key in recommended)) recommended[key] = (cnd.category && RECOMMENDED[cnd.category]) || 'none';
  }
  if (orgFacts && orgFacts.volumes) {
    const empty = orgFacts.volumes.filter((v) => v.records === 0).map((v) => `object:${v.object}`);
    if (empty.length) { byReason['object with no record in the org'] = empty; recommended['object with no record in the org'] = 'none'; }
  }
  const hosts = new Map();
  for (const e of f.systems.unnamed) { const key = e.host || `${e.kind}:${e.name}`; if (!hosts.has(key)) hosts.set(key, []); hosts.get(key).push(`${e.kind}:${e.name}`); }
  const groups = Object.entries(byReason).map(([reason, items]) => ({ reason, count: items.length, items, recommended: recommended[reason] }));
  return {
    systems: [...hosts.entries()].map(([key, endpoints]) => ({ key, endpoints, question: 'Which system is this? (name as the client calls it)' })),
    exclusions: { total: f.exclusions.candidates.length, groups },
    // unlocked or unmanaged packages without namespace: their components look like the project's
    packages: (f.exclusions.packagesWithoutNamespace || []).map((name) => ({ name, question: `Package « ${name} » is installed without namespace: name patterns of its components to exclude (blank: none)` })),
    modules: f.modules,
    language: orgFacts && orgFacts.organization ? orgFacts.organization.language : null,
  };
}

export async function scaffold(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const lang = templateLang(ctx.cfg.language);
  const target = normalizeLang(ctx.cfg.language);
  // Any other language: English skeletons and labels, translated once by the agent in the workspace.
  if (!LANGUAGES.includes(target)) {
    const own = ctx.p('i18n', `${target}.json`);
    if (!exists(own)) {
      const en = JSON.parse(readText(path.join(TEMPLATES, 'i18n', 'en.json')));
      en.meta.htmlLang = target;
      en._translate = `Translate every value of this file into the document language (${target}); keep the keys and the {placeholders}. Then delete this line.`;
      writeJson(own, en);
    }
    log.human(`document language "${target}": the skeletons are in English. Your agent translates the headings of src/*/*.md (keep the {#anchors}) and the labels of tadforce/i18n/${target}.json, once.`);
  }
  const r = syncOutline(ctx, { docs: docsOf(args), force: !!args.force });
  for (const [doc, n] of Object.entries(r.files)) log.ok(`src/${doc}: ${n.total} chapter file(s)${n.kept && !args.force ? ' (existing files kept)' : ''}`);
  if (r.added.length) log.ok(`outline: ${r.added.length} section(s) added (the org now has what they describe): ${r.added.map((x) => x.id).join(', ')}`);
  if (r.removed.length) log.ok(`outline: ${r.removed.length} section(s) left out (nothing in the org to describe): ${r.removed.map((x) => x.id).slice(0, 12).join(', ')}${r.removed.length > 12 ? '…' : ''}`);
  for (const k of r.kept) log.warn(`${k.file}: section « ${k.id} » is written but the org no longer has what it describes — review it (never deleted automatically).`);
  return 0;
}

/**
 * Write the skeletons of the active outline (sections.yml › when, evaluated on the facts): missing chapter
 * files are written without the sections the org does not need; existing ones gain the sections that became
 * active and lose those that became inactive while still pending. Written text is never removed.
 */
export function syncOutline(ctx, { docs = DOCS, force = false } = {}) {
  const lang = templateLang(ctx.cfg.language);
  const f = loadFacts(ctx.ws);
  const isActive = f ? sectionFilter(f) : () => true;
  const out = { added: [], removed: [], kept: [], files: {} };
  for (const doc of docs) {
    const src = path.join(TEMPLATES, doc, lang);
    const dst = ctx.p('src', doc);
    let kept = 0;
    for (const file of walk(src)) {
      const rel = path.relative(src, file);
      const target = path.join(dst, rel);
      const where = `src/${doc}/${rel.split(path.sep).join('/')}`;
      if (!file.endsWith('.md')) { if (force || !exists(target)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(file, target); } continue; }
      const tpl = readText(file);
      if (force || !exists(target)) {
        const r = filterSkeleton(tpl, isActive);
        writeText(target, r.text);
        out.removed.push(...r.removed.map((id) => ({ id, file: where })));
        continue;
      }
      kept++;
      const cur = readText(target);
      const r = syncSkeleton(tpl, cur, isActive);
      if (r.added.length || r.removed.length) writeText(target, r.text);
      out.added.push(...r.added.map((id) => ({ id, file: where })));
      out.removed.push(...r.removed.filter((id) => !r.kept.includes(id)).map((id) => ({ id, file: where })));
      out.kept.push(...r.kept.map((id) => ({ id, file: where })));
    }
    out.files[doc] = { total: exists(dst) ? fs.readdirSync(dst).filter((x) => x.endsWith('.md')).length : 0, kept };
  }
  return out;
}

/**
 * `tadforce build`: UNDERSTAND → WRITE → REVIEW → RENDER, the phase decided from the workspace.
 * --json returns the next phase with its work packages (the agent runs them, then calls build again);
 * a person in a terminal is handed over to the AI agent; --render-only renders what is written (CI, experts).
 */
export async function build(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  if (args.json) setQuiet(true); // stdout carries the JSON only
  if (args.renderOnly) {
    log.banner('build · render');
    const r = await renderDocuments(ctx, args);
    if (args.json) console.log(JSON.stringify({ phase: 'render', outputs: r.outputs, validation: r.validation, report: understand.finalReport(ctx) }, null, 2));
    return r.code;
  }
  log.banner('build');
  const facts = loadFacts(ctx.ws);
  if (!facts) throw new Error('No facts yet: run `tadforce doctor` first (it reads the metadata and extracts the facts).');
  if (!exists(ctx.p('src', 'tad'))) await scaffold({ cwd: ctx.project });
  const { graph, rebuilt } = understand.ensureGraph(ctx, facts);
  if (rebuilt) log.ok(`facts/graph.json: ${graph.stats.nodes} components, ${graph.stats.edges} edges`);

  if (args.mergeUnderstanding) {
    const state = understand.understandingState(ctx, facts, graph);
    const missing = state.all.filter((t) => state.parts[t.id] !== 'done').map((t) => `${t.id} (${state.parts[t.id]})`);
    const r = missing.length ? { errors: [{ where: 'parts', message: `parts not written yet: ${missing.join(', ')}` }], warnings: [], model: null } : understand.mergeUnderstanding(ctx, facts, graph, state);
    const out = { merged: !r.errors.length, errors: r.errors, warnings: r.warnings, stats: r.model ? r.model.stats : null };
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else if (out.merged) log.ok(`understanding/model.json: ${Object.entries(out.stats).map(([k, v]) => `${v} ${k}`).join(', ')}${r.warnings.length ? ` — ${r.warnings.length} warning(s)` : ''}`);
    else { log.fail(`model not merged: ${r.errors.length} error(s)`); for (const e of r.errors.slice(0, 20)) console.log(`   ${c.red('error')} ${e.where}: ${e.message}`); }
    return out.merged ? 0 : 1;
  }

  const payload = await nextPhase(ctx, facts, graph, args);
  if (payload.phase === 'render') {
    const r = await renderDocuments(ctx, args);
    if (args.json) console.log(JSON.stringify({ phase: 'render', outputs: r.outputs, validation: r.validation, report: understand.finalReport(ctx) }, null, 2));
    else printReport(understand.finalReport(ctx));
    return r.code;
  }
  if (args.json) { console.log(JSON.stringify(payload, null, 2)); return 0; }
  printPhase(payload);
  // a person in a terminal: the agent runs the loop; CI and agent sessions get a preview of what is written
  if (process.stdin.isTTY && !insideAgent() && args.launch !== false) {
    const found = installedAgents();
    const wanted = typeof args.agent === 'string' ? args.agent : ctx.cfg.setup.agent;
    const agent = found.find((a) => a.id === wanted) || (wanted ? null : found[0]);
    if (agent) {
      ctx.cfg.setup.agent = agent.id; ctx.save(ctx.cfg);
      log.step(`Handing over to ${agent.name}: it runs the build loop (understand → write → review → render)…`);
      return launchAgent(agent, ctx.project, runnerOf(ctx.cfg));
    }
    log.human(found.length ? `agent "${wanted}" not found; installed: ${found.map((a) => a.id).join(', ')} (--agent <id>).` : 'open your AI agent (Claude Code, Codex, Cursor, Copilot…) in this folder and type /tadforce: it runs the build loop.');
  } else log.info(`The agent drives this loop with \`${runnerOf(ctx.cfg)} build --json\`. Preview of what is written so far:`);
  return (await renderDocuments(ctx, args)).code;
}

/** The next phase of the build loop, from the state of the workspace. */
export async function nextPhase(ctx, facts, graph, args = {}) {
  const u = understand.understandPhase(ctx, facts, graph);
  if (u) return u;
  const model = JSON.parse(readText(ctx.p('understanding', 'model.json')));
  const w = understand.writePhase(ctx, facts, graph, model, { specOf: (id) => specWithFacts(ctx, id) });
  if (w) return w;
  if (args.review !== false) {
    const rs = understand.reviewState(ctx);
    if (!rs.done) {
      // a dry build (no browser) for the reviewer to read, with the validation of each document
      const built = [];
      try {
        for (const doc of docsOf(args)) {
          if (!exists(ctx.p('src', doc))) continue;
          const dry = { ...ctx, cfg: { ...ctx.cfg, outputs: { ...ctx.cfg.outputs, dir: '.cache/review' } } };
          const r = await buildDocument(dry, doc, { render: false });
          built.push({ doc, html: path.relative(ctx.project, r.html).split(path.sep).join('/'), validation: validateDocument(ctx, doc, { buildReport: r }) });
        }
      } finally { await closeBrowser(); }
      const brief = understand.groundTruth(ctx, facts, model, graph);
      const claims = await claimsOf(ctx, built.map((b) => b.doc));
      return { phase: 'review', stale: !!rs.stale, task: understand.reviewTask(ctx, built, { brief, claims }) };
    }
  }
  return { phase: 'render' };
}

/**
 * The automatic claims check of each document (src/validate/claims.js › claimsCheck(ctx, doc)), for the
 * reviewer; null when the check is not available in this version.
 */
export async function claimsOf(ctx, docs) {
  let mod;
  try { mod = await import('../validate/claims.js'); } catch { return null; }
  if (!mod || typeof mod.claimsCheck !== 'function') return null;
  const out = {};
  for (const doc of docs) {
    try {
      const r = await mod.claimsCheck(ctx, doc);
      const issues = Array.isArray(r) ? r : (r && Array.isArray(r.issues) ? r.issues : []);
      out[doc] = issues.slice(0, 80);
    } catch (e) { out[doc] = [{ level: 'warning', code: 'claims-check-failed', message: String(e && e.message || e) }]; }
  }
  return out;
}

const PHASES = { understand: 'UNDERSTAND', write: 'WRITE', review: 'REVIEW', render: 'RENDER' };

function printPhase(p) {
  const steps = Object.keys(PHASES).map((k) => (k === p.phase ? c.bold(c.cyan(PHASES[k])) : c.dim(PHASES[k]))).join(c.dim(' → '));
  console.log(`  ${steps}`);
  if (p.phase === 'understand') {
    const what = { cards: 'developers read the code (one card per component) and the functional analyst maps actors, domains and lifecycles', processes: 'the architect assembles the end-to-end processes from the cards and the call graph', fix: 'the model does not validate: fix the part files listed' }[p.stage];
    log.step(`Understand · ${p.stage}: ${what}.`);
    for (const t of p.tasks) console.log(`   ${c.dim(t.id.padEnd(10))} ${t.role.padEnd(18)} ${t.title || (t.errors ? `${t.errors.length} error(s) in ${t.file}` : '')}`);
  } else if (p.phase === 'write') {
    log.step(`Write · stage ${p.stage}: ${p.remaining} section(s) still to write; ${p.groups.length} group(s) now${p.parallel ? ', in parallel' : ''}.`);
    for (const g of p.groups) console.log(`   ${c.dim(g.id.padEnd(10))} ${g.sections.length} section(s)${(g.parts || []).length > 1 ? ` in ${g.parts.length} parts` : ''}${g.resume && g.resume.written.length ? `, ${g.resume.written.length} already written` : ''} · ${g.files.join(', ')}`);
  } else if (p.phase === 'review') {
    log.step(`Review: an independent reviewer reads the documents against the model and the facts${p.stale ? ' (the sources changed since the last review)' : ''}.`);
    for (const [doc, v] of Object.entries(p.task.inputs.validation)) console.log(`   ${c.dim(doc.padEnd(10))} score ${v.score}/100 · ${v.errors.length} error(s), ${v.warnings.length} warning(s)`);
  }
}

function printReport(r) {
  if (r.questions.length) { log.human(`${r.questions.length} point(s) the metadata could not settle (not in the document):`); for (const q of r.questions.slice(0, 15)) console.log(`   ${c.dim(q.id)} ${q.text}`); }
  if (r.reviewRemaining.length) { log.warn(`${r.reviewRemaining.length} review point(s) left open (understanding/review.json):`); for (const x of r.reviewRemaining.slice(0, 15)) console.log(`   ${x.where || ''} ${x.issue || ''}${x.why ? c.dim(' — ' + x.why) : ''}`); }
}

/** RENDER: HTML always, PDF and Word on demand, then validate (the build of 0.4, kept as is). */
async function renderDocuments(ctx, args) {
  // HTML always; PDF and Word on demand (asked once in a terminal when neither flag nor config says).
  if (args.pdf === undefined && args.docx === undefined && process.stdin.isTTY && !args.json && !args.yes) {
    const rl = (await import('node:readline/promises')).createInterface({ input: process.stdin, output: process.stdout });
    try {
      const a = (await rl.question('  Formats besides HTML — pdf, docx, both or none? [both] ')).trim().toLowerCase() || 'both';
      args.pdf = a === 'both' || a.includes('pdf');
      args.docx = a === 'both' || a.includes('doc');
    } finally { rl.close(); }
  }
  let failed = 0;
  const built = [];
  const outputs = [];
  const validation = {};
  const relp = (p) => path.relative(ctx.project, p).split(path.sep).join('/');
  try {
    for (const doc of docsOf(args)) {
      if (!exists(ctx.p('src', doc))) { log.warn(`src/${doc} missing — skipped`); continue; }
      const r = await buildDocument(ctx, doc, { render: args.render !== false });
      built.push(r);
      if (r.pending.length) log.warn(`${r.pending.length} section(s) of ${doc} still to write — your agent writes them (${runnerOf(ctx.cfg)} build --json), then build again.`);
      log.ok(`${relp(r.html)} (${r.sizeKB} KB, ${r.figures} figures)`);
      const out = { doc, html: relp(r.html) };
      // figures photographed and checked before the exports: an unreadable figure marks PDF and Word as DRAFT too
      let gate = r.gate || null;
      if (args.render !== false && args.figures !== false && findBrowser()) {
        const figures = await figureQA(ctx, r.html, doc);
        gate = await qualityGate(ctx, doc, { html: r.html, report: r, figures });
        out.figures = figures.figures.map((x) => ({ n: x.n, caption: x.caption, png: x.png && relp(x.png), issues: x.issues }));
      }
      if (gate) out.gate = { ok: gate.ok, draft: !!gate.draft, score: gate.score, errors: gate.errors.length };
      if (gate && gate.draft && !args.json) log.warn(`${doc}: quality gate not passed — marked ${c.bold('DRAFT')} until the errors are fixed.`);
      // naming one format (--pdf) means that one only; with no flag, the config decides
      const named = args.pdf !== undefined || args.docx !== undefined;
      const wantPdf = named ? args.pdf === true : ctx.cfg.outputs.pdf;
      const wantDocx = named ? args.docx === true : ctx.cfg.outputs.docx;
      const archive = path.join(path.dirname(r.html), outputName(ctx.cfg, doc, { versioned: true }));
      if (wantPdf && args.render !== false) { const p = archive + '.pdf'; const s = await exportPdf(r.html, p); out.pdf = relp(p); log.ok(`${relp(p)} (${Math.round(s / 1024)} KB)`); }
      if (wantDocx && args.render !== false) { const p = archive + '.docx'; const s = await exportDocx(r.html, p); out.docx = relp(p); log.ok(`${relp(p)} (${Math.round(s / 1024)} KB)`); }
      // the full inventory goes to a workbook; the annexes keep only what a reader needs
      const f = doc === 'tad' && args.render !== false && exists(ctx.p('facts', 'facts.json')) && readJson(ctx.p('facts', 'facts.json'));
      if (f) { const x = writeInventoryXlsx(ctx, f, path.join(path.dirname(r.html), `${outputName(ctx.cfg, doc)}_inventory.xlsx`)); out.xlsx = relp(x.path); log.ok(`${relp(x.path)} (${x.sheets.length} sheets)`); }
      outputs.push(out);
      const v = validateDocument(ctx, doc, { buildReport: r });
      validation[doc] = { ok: v.ok, score: v.score, errors: v.errors.length, warnings: v.warnings.length, first: [...v.errors, ...v.warnings].slice(0, 20).map((i) => ({ level: i.level, code: i.code, message: i.message, where: i.where })) };
      if (!args.json) report(v, doc);
      if (!v.ok) failed++;
    }
  } finally {
    await closeBrowser();
  }
  // the sections listed by `update` are now in a built document: a later update starts afresh
  const upd = ctx.p('facts', 'update.json');
  if (built.length && exists(upd)) { const u = JSON.parse(readText(upd)); if (!u.built) writeJson(upd, { ...u, built: true }); }
  if (args.open && built[0]) { const { open } = await import('./review.js'); await open(built[0].html); }
  return { code: args.strict && failed ? 1 : 0, built, outputs, validation };
}

function report(v, doc) {
  const icon = v.ok ? c.green('✔') : c.red('✖');
  console.log(`${icon} validate ${doc}: score ${v.score}/100 — ${v.errors.length} error(s), ${v.warnings.length} warning(s)`);
  // what a reader must act on first, then real problems, then the sections still to write (often many)
  const urgent = (w) => ['comment-reopened', 'open-comments', 'backup', 'comments-missing'].includes(w.code);
  const pending = v.errors.filter((e) => e.code === 'pending');
  const show = [...v.warnings.filter(urgent), ...v.errors.filter((e) => e.code !== 'pending'), ...v.warnings.filter((w) => !urgent(w)), ...pending];
  for (const i of show.slice(0, 40)) console.log(`   ${i.level === 'error' ? c.red('error') : c.yellow('warn ')} ${c.dim(i.code)} ${i.message}${i.where ? c.dim('  ' + i.where) : ''}`);
  const hidden = v.errors.length + v.warnings.length - Math.min(40, show.length);
  if (hidden > 0) console.log(c.dim(`   … ${hidden} more (tadforce validate --json)`));
}

export async function validate(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const results = {};
  // the visual QA of the figures needs a browser: on when one is found (--no-figures skips it)
  const qa = args.figures !== false && !!findBrowser();
  try {
    for (const doc of docsOf(args)) {
      if (!exists(ctx.p('src', doc))) continue;
      // build into the cache, so that anchors, placeholders and figures are checked too
      const cfgOut = { ...ctx, cfg: { ...ctx.cfg, outputs: { ...ctx.cfg.outputs, dir: '.cache/validate' } } };
      const r = await buildDocument(cfgOut, doc, { render: qa, gate: false });
      // a figure with issues is drawn once more in its simplified variant (split ERD, merged lanes…) before the gate decides
      const figures = qa ? await figureQA(ctx, r.html, doc, { report: r }) : null;
      results[doc] = await qualityGate(ctx, doc, { html: r.html, report: r, figures });
      if (figures && figures.retried) results[doc].simplified = figures.retried;
      if (!args.json) {
        report(results[doc], doc);
        if (figures && figures.retried) log.info(`${figures.retried.length} figure(s) redrawn in their simplified variant: ${figures.retried.join(', ')}`);
        if (figures) log.info(`${figures.figures.length} figure(s) checked and photographed → ${path.relative(ctx.project, ctx.p('out', 'figures'))}/${doc}-fig-<n>.png (look at them, fix the sources, validate again)`);
        else log.info('figures not checked (no Chrome / Edge found, or --no-figures)');
        if (results[doc].draft) log.warn(`${doc}: quality gate not passed — the build is marked ${c.bold('DRAFT')} until the errors are fixed.`);
      }
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
  const report = { source: ctx.cfg.source.mode || 'org', org: ctx.cfg.org.alias || null, components: f ? f.inventory.length : 0, pending: {} };
  const line = (ok, s) => { if (!args.json) console.log(`${ok ? c.green('✔') : c.dim('○')} ${s}`); };
  if (!args.json) log.banner('status');
  if (ctx.cfg.source.mode === 'local') line(true, 'source: local metadata of the project');
  else {
    line(!!ctx.cfg.org.alias, `org: ${ctx.cfg.org.alias || 'not chosen yet (tadforce doctor)'}`);
    line(exists(ctx.p(ctx.cfg.source.dir)), 'metadata retrieved from the org');
  }
  line(!!f, `facts${f ? ` (${f.inventory.length} components${f.org ? ', org facts' : ''})` : ''}`);
  for (const doc of DOCS) {
    const dir = ctx.p('src', doc);
    if (!exists(dir)) { line(false, `src/${doc}`); continue; }
    // same count as next and validate: sections inside a false <!-- tad:if --> are not part of this document
    const scope = f ? { modules: f.modules, counts: f.counts, org: f.org, cfg: ctx.cfg, facts: f, glossary: ctx.glossary(), source: sourceFlags(ctx.cfg) } : {};
    const text = fs.readdirSync(dir).filter((x) => x.endsWith('.md')).map((x) => resolveConditionals(readText(path.join(dir, x)), scope)).join('\n');
    // sections whose `when` is false (sections.yml) are not part of this org's document either
    const isActive = f ? sectionFilter(f) : () => true;
    const pending = [...text.matchAll(/<!--\s*tad:pending\s+([\w.-]+)\s*-->/g)].filter((m) => isActive(m[1])).length;
    report.pending[doc] = pending;
    line(pending === 0, `src/${doc}: ${pending ? pending + ' section(s) to write' : 'written'}`);
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
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
