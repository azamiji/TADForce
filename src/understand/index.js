// The build loop: UNDERSTAND → WRITE → REVIEW → RENDER, decided from the state of the workspace.
// Each call of `tadforce build --json` returns the next phase with self-contained work packages for agents
// (in parallel when the agent can spawn subagents, one after the other otherwise).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exists, readText, writeJson, safeReadJson, walk, toPosix } from '../util/fsx.js';
import { sourceDirs, sourceFlags } from '../util/config.js';
import { resolveConditionals } from '../build/directives.js';
import { buildGraph, GRAPH_VERSION, indexGraph } from './graph.js';
import { planUnderstanding, fingerprintOf } from './plan.js';
import { validateModel, normalizeId, MODEL_VERSION, CARD_KEYS } from './schema.js';
import { sectionFilter } from '../facts/outline.js';
import { writeBrief, groundTruth } from './brief.js';
import { skeletonMap, figureOwnership, groupFigures, writeFigures, docContext, sectionParts, resumeHint, readQuestions } from './doc.js';

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const rel = (ctx, ...p) => toPosix(path.relative(ctx.project, ctx.p(...p)));
export const DOCS_ORDER = ['tad', 'axes'];

/** Fingerprint of facts.json as written (deterministic extraction: same metadata, same bytes). */
export function factsFingerprint(ctx) {
  const p = ctx.p('facts', 'facts.json');
  return exists(p) ? sha(readText(p)) : null;
}

/** graph.json, rebuilt when missing or older than facts.json. */
export function ensureGraph(ctx, facts, { force = false } = {}) {
  const fp = factsFingerprint(ctx);
  const file = ctx.p('facts', 'graph.json');
  const old = safeReadJson(file);
  if (!force && old && old.version === GRAPH_VERSION && old.factsFingerprint === fp) return { graph: old, rebuilt: false };
  const dirs = sourceDirs(ctx);
  const graph = { ...buildGraph(dirs, facts, { base: ctx.project }), factsFingerprint: fp };
  writeJson(file, graph);
  return { graph, rebuilt: true };
}

// ---------------------------------------------------------------- understand

const partFile = (ctx, id) => ctx.p('understanding', 'parts', `${id}.json`);

/** The planned tasks and the state of their parts: done (fresh part), stale (older inputs) or missing. */
export function understandingState(ctx, facts, graph) {
  const fp = factsFingerprint(ctx);
  const plan = planUnderstanding(ctx, facts, graph, { dirs: sourceDirs(ctx), factsFingerprint: fp });
  const all = [...plan.developer, plan.analyst, plan.architect];
  const parts = {};
  for (const t of all) {
    const p = safeReadJson(partFile(ctx, t.id));
    parts[t.id] = !p ? 'missing' : p.fingerprint !== t.fingerprint ? 'stale' : 'done';
  }
  const model = safeReadJson(ctx.p('understanding', 'model.json'));
  const expected = Object.fromEntries(all.map((t) => [t.id, t.fingerprint]));
  const sorted = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
  const fresh = !!model && model.version === MODEL_VERSION && sorted(model.parts) === sorted(expected);
  return { plan, all, parts, model, fresh, expected };
}

/** Merge the parts into model.json; written only when it validates (errors are returned otherwise). */
export function mergeUnderstanding(ctx, facts, graph, state) {
  const known = new Set([...(facts.inventory || []), ...(facts.data?.objects || []).map((o) => o.name)]);
  const norm = (v) => normalizeId(v, known);
  const normList = (l) => (Array.isArray(l) ? [...new Set(l.map(norm))] : l);
  const read = (id) => safeReadJson(partFile(ctx, id)) || {};
  const model = { version: MODEL_VERSION, generatedAt: new Date().toISOString(), actors: [], domains: [], processes: [], lifecycles: [], componentCards: {}, findings: [] };
  const sources = {};
  for (const d of state.plan.developer) {
    const p = read(d.id);
    for (const [id, card] of Object.entries(p.cards || {})) {
      const key = norm(id);
      if (!card || typeof card !== 'object') { model.componentCards[key] = card; continue; }
      model.componentCards[key] = { ...Object.fromEntries(CARD_KEYS.map((k) => [k, ['reads', 'writes', 'calls'].includes(k) ? [] : ''])), ...card, reads: normList(card.reads || []), writes: normList(card.writes || []), calls: normList(card.calls || []) };
      sources[`componentCards[${key}]`] = d.id;
    }
    for (const f of p.findings || []) model.findings.push({ ...f, _from: d.id });
  }
  const analyst = read('analyst'), architect = read('architect');
  const byId = (list) => new Map((list || []).filter((x) => x && x.id).map((x) => [x.id, x]));
  model.actors = (analyst.actors || []).map((a) => ({ apps: [], evidence: [], ...a, evidence: normList(a.evidence || []) }));
  const domains = byId(analyst.domains);
  for (const d of architect.domains || []) {
    if (!d || !d.id) continue;
    const base = domains.get(d.id) || { id: d.id, name: d.name, summary: d.summary || '', objects: [], components: [], actors: [] };
    domains.set(d.id, { ...base, ...Object.fromEntries(Object.entries(d).filter(([k, v]) => v && !Array.isArray(v))), objects: [...new Set([...(base.objects || []), ...(d.objects || [])])], components: [...new Set([...(base.components || []), ...(d.components || [])])], actors: [...new Set([...(base.actors || []), ...(d.actors || [])])] });
  }
  model.domains = [...domains.values()].map((d) => ({ summary: '', objects: [], components: [], actors: [], ...d, components: normList(d.components || []) }));
  model.lifecycles = (analyst.lifecycles || []).map((l) => ({ final: [], transitions: [], ...l, transitions: (l.transitions || []).map((t) => ({ evidence: [], ...t, evidence: normList(t.evidence || []) })) }));
  model.processes = (architect.processes || []).map((p) => ({
    participants: [], steps: [], ...p,
    // a component participant keeps its local id (used by the steps); its component id goes to ref when they differ
    participants: (p.participants || []).map((x) => {
      if (!x || x.kind !== 'component') return x;
      const ref = norm(x.ref || x.id);
      return ref === x.id ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'ref')) : { ...x, ref };
    }),
    steps: (p.steps || []).map((s) => ({ async: false, reply: false, group: null, evidence: [], ...s, evidence: normList(s.evidence || []) })),
  }));
  for (const f of analyst.findings || []) model.findings.push({ ...f, _from: 'analyst' });
  for (const f of architect.findings || []) model.findings.push({ ...f, _from: 'architect' });
  for (const d of model.domains) sources[`domains[${d.id}]`] = byId(analyst.domains).has(d.id) ? 'analyst' : 'architect';
  // findings get stable ids when the agents left them out
  model.findings = model.findings.filter((f) => f && typeof f === 'object').map((f, i) => {
    const { _from, ...rest } = f;
    const id = f.id || `f-${String(i + 1).padStart(2, '0')}`;
    sources[`findings[${id}]`] = _from;
    return { evidence: [], ...rest, id, evidence: normList(rest.evidence || []) };
  });
  model.factsFingerprint = factsFingerprint(ctx);
  model.parts = state.expected;
  model.stats = { actors: model.actors.length, domains: model.domains.length, processes: model.processes.length, lifecycles: model.lifecycles.length, cards: Object.keys(model.componentCards).length, findings: model.findings.length };
  const result = validateModel(model, facts, graph);
  // which part file each error comes from, so that the right agent fixes it
  const origin = (where) => {
    const head = where.replace(/\].*$/, ']');
    if (sources[head]) return sources[head];
    return where.startsWith('processes') ? 'architect' : 'analyst';
  };
  const errors = result.errors.map((e) => ({ ...e, part: rel(ctx, 'understanding', 'parts', `${origin(e.where)}.json`) }));
  // cards expected but missing: an empty card is a hole in the understanding
  const missingCards = state.plan.developer.flatMap((d) => d.components.filter((c) => !model.componentCards[c.id]).map((c) => ({ where: `componentCards[${c.id}]`, message: 'no card written for this component', part: rel(ctx, 'understanding', 'parts', `${d.id}.json`) })));
  const warnings = [...result.warnings, ...missingCards];
  if (!errors.length) writeJson(ctx.p('understanding', 'model.json'), model);
  else writeJson(ctx.p('understanding', 'model.draft.json'), model);
  writeJson(ctx.p('understanding', 'validation.json'), { errors, warnings });
  return { model, errors, warnings };
}

/**
 * Each work package is also written to understanding/tasks/<id>.json: on a large org the orchestrator can
 * hand a subagent the path of its package instead of pasting it.
 */
function withTaskFiles(ctx, list) {
  return list.map((t) => {
    const taskFile = rel(ctx, 'understanding', 'tasks', `${t.id}.json`);
    const out = { ...t, taskFile };
    writeJson(ctx.p('understanding', 'tasks', `${t.id}.json`), out);
    return out;
  });
}

/** The understand phase payload, or null when the model is up to date. */
export function understandPhase(ctx, facts, graph) {
  const state = understandingState(ctx, facts, graph);
  writeJson(ctx.p('understanding', 'tasks.json'), { developer: state.plan.developer.map((t) => ({ id: t.id, fingerprint: t.fingerprint, components: t.components.map((c) => c.id) })), analyst: { fingerprint: state.plan.analyst.fingerprint }, architect: { fingerprint: state.plan.architect.fingerprint, after: state.plan.architect.after } });
  if (state.fresh) {
    const v = validateModel(state.model, facts, graph);
    if (!v.errors.length) return null;
  }
  const todo = (t) => state.parts[t.id] !== 'done';
  const first = [...state.plan.developer, state.plan.analyst].filter(todo);
  const files = { graph: state.plan.files.graph, model: state.plan.files.model, parts: rel(ctx, 'understanding', 'parts') };
  if (first.length) return { phase: 'understand', stage: 'cards', parallel: true, tasks: withTaskFiles(ctx, first), waiting: ['architect'], files, done: [...state.plan.developer, state.plan.analyst].filter((t) => !todo(t)).map((t) => t.id) };
  if (todo(state.plan.architect)) return { phase: 'understand', stage: 'processes', parallel: false, tasks: withTaskFiles(ctx, [state.plan.architect]), files };
  const merged = mergeUnderstanding(ctx, facts, graph, state);
  if (!merged.errors.length) return null;
  // group the errors by part file: one fix task per agent output
  const byPart = new Map();
  for (const e of merged.errors) (byPart.get(e.part) || byPart.set(e.part, []).get(e.part)).push({ where: e.where, message: e.message });
  return {
    phase: 'understand', stage: 'fix', parallel: true, files,
    tasks: withTaskFiles(ctx, [...byPart.entries()].map(([part, errors], i) => ({ id: `fix-${String(i + 1).padStart(2, '0')}`, role: 'fixer', file: part, errors: errors.slice(0, 80), instructions: 'Fix these errors in the part file (keep its task and fingerprint fields): use only ids that exist in facts.json › inventory and knowledge/glossary.yml › systems; drop what cannot be evidenced and turn it into a finding of kind question. Then call `tadforce build --json` again.' }))),
    draft: rel(ctx, 'understanding', 'model.draft.json'),
  };
}

// ---------------------------------------------------------------- write

/** Writing stages: groups of one stage can be written in parallel; a stage starts when the previous is written. */
export const WRITE_STAGES = [
  { doc: 'tad', chapters: ['06', '07', '08', '09', '10', '11', '12', '13'] },
  { doc: 'tad', chapters: ['05'] },
  { doc: 'tad', chapters: ['04', '14', '15'] },
  { doc: 'tad', chapters: ['02', '03'] },
  { doc: 'tad', chapters: ['01', '00', '99'] },
  { doc: 'axes', chapters: null, single: true },
];

/** Sections still to write, per doc and chapter file (only the sections active for this org). */
export function pendingSections(ctx, facts) {
  const scope = { modules: facts.modules, counts: facts.counts, org: facts.org, cfg: ctx.cfg, facts, glossary: ctx.glossary(), source: sourceFlags(ctx.cfg) };
  const out = [];
  for (const doc of DOCS_ORDER) {
    const dir = ctx.p('src', doc);
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      const raw = readText(path.join(dir, f));
      const active = resolveConditionals(raw, scope);
      const lines = raw.split('\n');
      for (const m of active.matchAll(/<!--\s*tad:pending\s+([\w.-]+)\s*-->/g)) {
        out.push({ doc, chapter: f.slice(0, 2), file: rel(ctx, 'src', doc, f), id: m[1], marker: m[0], line: lines.findIndex((l) => l.includes(m[0])) + 1 });
      }
    }
  }
  return out;
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** The part of the model a chapter is written from (the whole model stays readable in model.json). */
export function modelSlice(model, graph, doc, chapter) {
  if (!model) return null;
  const g = indexGraph(graph);
  const kindOf = (id) => g.byName.get(id)?.kind;
  const cards = (pred) => Object.fromEntries(Object.entries(model.componentCards || {}).filter(([id]) => pred(id, kindOf(id))));
  const processSummary = (model.processes || []).map((p) => pick(p, ['id', 'name', 'domain', 'summary', 'trigger']));
  const domainSummary = (model.domains || []).map((d) => pick(d, ['id', 'name', 'summary', 'objects', 'actors']));
  const figures = {
    sequences: (model.processes || []).map((p) => `@@SEQ:${p.id}@@`),
    states: (model.lifecycles || []).map((l) => `@@STATE:${l.id}@@`),
    domainErds: (model.domains || []).filter((d) => (d.objects || []).length).map((d) => `@@ERD-DOMAIN:${d.id}@@`),
  };
  if (doc === 'axes') return { findings: model.findings || [], processes: processSummary, domains: domainSummary };
  const callsOut = (id) => g.out(`${kindOf(id)}:${id}`).some((e) => /^namedCredential:/.test(e.to));
  switch (chapter) {
    case '05': return { actors: model.actors, domains: model.domains, processes: model.processes, lifecycles: model.lifecycles, figures };
    case '06': return { domains: model.domains, lifecycles: model.lifecycles, figures: { domainErds: figures.domainErds, states: figures.states } };
    case '07': return { domains: domainSummary, processes: processSummary, componentCards: cards((id, k) => ['apex', 'trigger', 'flow', 'omniscript', 'ip', 'datamapper'].includes(k)) };
    case '08': return { actors: model.actors, domains: domainSummary, componentCards: cards((id, k) => ['lwc', 'aura', 'vf'].includes(k)) };
    case '09': return { processes: (model.processes || []).filter((p) => (p.participants || []).some((x) => x.kind === 'external')), componentCards: cards((id, k) => callsOut(id) || (g.byName.get(id)?.kinds || []).some((x) => ['rest', 'soap', 'callout'].includes(x)) || ['ip', 'datamapper'].includes(k)), figures: { sequences: figures.sequences } };
    case '10': return { actors: model.actors, domains: domainSummary, componentCards: cards((id) => (g.byName.get(id)?.kinds || []).some((x) => ['rest', 'soap', 'registrationHandler'].includes(x))) };
    case '12': return { processes: processSummary, componentCards: cards((id) => (g.byName.get(id)?.kinds || []).some((x) => ['batch', 'queueable', 'schedulable', 'future'].includes(x)) || g.byName.get(id)?.schedule) };
    default: return { actors: model.actors, domains: domainSummary, processes: processSummary, lifecycles: (model.lifecycles || []).map((l) => pick(l, ['id', 'object', 'field'])) };
  }
}

const scopeOf = (ctx, facts) => ({ modules: facts.modules, counts: facts.counts, org: facts.org, cfg: ctx.cfg, facts, glossary: ctx.glossary(), source: sourceFlags(ctx.cfg) });

/** Figure ownership of the model, written to understanding/figures.json. */
export function ensureFigures(ctx, facts, model) {
  return writeFigures(ctx, figureOwnership(model, sectionFilter(facts)));
}

/** The write phase payload, or null when every section is written. */
export function writePhase(ctx, facts, graph, model, { specOf }) {
  const pending = pendingSections(ctx, facts);
  // the ground truth and the figure ownership are refreshed at each call (the model or the org facts may change)
  const brief = writeBrief(ctx, facts, model, graph);
  const ownership = ensureFigures(ctx, facts, model);
  if (!pending.length) return null;
  const skeleton = skeletonMap(ctx);
  const isActive = sectionFilter(facts);
  const scope = scopeOf(ctx, facts);
  const stageIndex = WRITE_STAGES.findIndex((s) => pending.some((p) => p.doc === s.doc && (!s.chapters || s.chapters.includes(p.chapter))));
  // a chapter outside every stage (custom file) is written with the first stage
  const stage = stageIndex >= 0 ? WRITE_STAGES[stageIndex] : WRITE_STAGES[0];
  const inStage = (p) => (stageIndex < 0 ? true : p.doc === stage.doc && (!stage.chapters || stage.chapters.includes(p.chapter)));
  const groups = new Map();
  for (const p of pending.filter(inStage)) {
    const key = stage.single ? p.doc : `${p.doc}-${p.chapter}`;
    if (!groups.has(key)) groups.set(key, { id: key, doc: p.doc, chapters: [], files: [], sections: [] });
    const gr = groups.get(key);
    if (!gr.chapters.includes(p.chapter)) gr.chapters.push(p.chapter);
    if (!gr.files.includes(p.file)) gr.files.push(p.file);
    gr.sections.push({ id: p.id, file: p.file, line: p.line, marker: p.marker, spec: specOf(p.id) || { id: p.id } });
  }
  const files = { model: rel(ctx, 'understanding', 'model.json'), graph: rel(ctx, 'facts', 'graph.json'), facts: rel(ctx, 'facts', 'facts.json'), brief: rel(ctx, 'understanding', 'brief.md'), figures: rel(ctx, 'understanding', 'figures.json'), questions: rel(ctx, 'understanding', 'questions.md') };
  const questions = readQuestions(ctx);
  return {
    phase: 'write', stage: `${stageIndex + 1}/${WRITE_STAGES.length}`, parallel: groups.size > 1, remaining: pending.length, files,
    groups: withTaskFiles(ctx, [...groups.values()].map((gr) => {
      const ids = gr.sections.map((s) => s.id);
      const parts = sectionParts(gr.sections);
      const figures = gr.doc === 'tad' ? groupFigures(ownership, ids, skeleton) : { own: [], link: [] };
      const slice = modelSlice(model, graph, gr.doc, gr.chapters[0]);
      // the slice lists only the figures this group draws: the others are linked (figures.link), never redrawn
      if (slice && slice.figures) {
        const owned = new Set(figures.own.map((f) => f.directive));
        const kept = Object.fromEntries(Object.entries(slice.figures).map(([k, v]) => [k, v.filter((d) => owned.has(d))]).filter(([, v]) => v.length));
        if (Object.keys(kept).length) slice.figures = kept; else delete slice.figures;
      }
      const out = {
        ...gr,
        read: ['tadforce/understanding/brief.md', 'references/style-guide.md', 'references/writing-rules.md', 'references/markdown-conventions.md', 'references/figure-rules.md'],
        instructions: 'Read the brief first: it is the ground truth of the org (what exists, what is absent, what never to claim); a sentence that contradicts it is wrong. Replace each pending marker of these files with the section content, following its spec, part after part, saving the file after each section. Write from the model slice (what the org does), the component cards, the facts and the code — never invent a name, a count or a system. Draw only the figures of figures.own, each under a heading carrying its anchor; for every other figure link with its ref ({{ref:…}}), never redraw it. Do not repeat what the chapters of context already say: link to them. State only what is proven; a doubt is not written: it is already a finding of the model, or add it to tadforce/understanding/questions.md as « - <section.id>: question ». Keep headings and {#anchors}. Never write a section about an absent module.',
        brief,
        figures,
        context: docContext(ctx, scope, { docs: gr.doc === 'axes' ? ['tad', 'axes'] : [gr.doc], exclude: gr.chapters.map((c) => `${gr.doc}-${c}`) }),
        parts,
        resume: resumeHint(skeleton, gr.chapters, gr.doc, ids, isActive),
        model: slice,
      };
      if (gr.doc === 'axes') out.inputs = { questions, questionsFile: files.questions };
      return out;
    })),
  };
}

// ---------------------------------------------------------------- review

/** Fingerprint of the written sources: a review is valid for the sources it read (and the fixes it applied). */
export function sourcesFingerprint(ctx) {
  const list = DOCS_ORDER.flatMap((doc) => walk(ctx.p('src', doc)).filter((f) => f.endsWith('.md')));
  return sha(list.map((f) => toPosix(path.relative(ctx.ws, f)) + '\n' + readText(f)).join('\n\0'));
}

/**
 * Review state. A review.json freshly written by the reviewer (no fingerprint yet) is stamped with the
 * sources as they stand after its fixes; a later change of the sources asks for a new review.
 */
export function reviewState(ctx) {
  const file = ctx.p('understanding', 'review.json');
  const r = safeReadJson(file);
  const fp = sourcesFingerprint(ctx);
  if (!r) return { done: false, review: null, fingerprint: fp };
  if (!r.sourcesFingerprint) { const stamped = { ...r, sourcesFingerprint: fp, stampedAt: new Date().toISOString() }; writeJson(file, stamped); return { done: true, review: stamped, fingerprint: fp }; }
  return { done: r.sourcesFingerprint === fp, review: r, fingerprint: fp, stale: r.sourcesFingerprint !== fp };
}

export const REVIEW_CHECKS = [
  'claims without evidence (P1 metadata/code, P2/P3 inputs): remove or rewrite as proven fact',
  'invented names: every name in code font exists in facts.json › inventory; systems only from knowledge/glossary.yml',
  'missing key processes: every process of model.json has its subsection and figure in chapter 5',
  'inconsistent numbers: counts are {{n:…}} placeholders, never typed; the same thing has the same number everywhere',
  'sections about absent things: no paragraph on a module, product or component the org does not have; no empty or « to be completed » section',
  'debt, risks or recommendations in the TAD: they go to the Improvement Axes',
  'style: chapter lead paragraph, Component | Role tables, one INTEGRATOR callout per major mechanism, numbered figures with captions (references/style-guide.md)',
  'excluded or decommissioned components mentioned anywhere',
  'ground truth: no sentence contradicts the brief (inputs.brief, understanding/brief.md) — a schedule that does not exist, a product, a site, Permission Set Groups or « Production » the org does not have',
  'automatic claims check (inputs.claims): each issue is fixed in the sources or listed as remaining with the reason',
  'figure ownership (understanding/figures.json): every @@SEQ@@, @@STATE@@ and @@ERD-DOMAIN@@ appears once, in its owner section; elsewhere a {{ref:…}} link',
  'no repetition: chapter 5 tells the business view of a process, chapter 7 the technical mechanism; the same paragraph or table never appears in both',
];

export function reviewTask(ctx, built, { brief = null, claims = null } = {}) {
  return withTaskFiles(ctx, [{
    id: 'review', role: 'reviewer',
    title: 'Independent review of the written documents',
    read: ['tadforce/understanding/brief.md', 'references/style-guide.md', 'references/evidence-rules.md', 'references/writing-rules.md', 'references/axes-rules.md'],
    instructions: 'You did not write these documents. Read the brief first (the ground truth of the org), then the documents as a senior Salesforce architect would before sending them to the client: the built HTML for the reading, the markdown sources for the fixes. Check every point of `checks` against the brief, the model, the cards and the facts; go through every issue of the automatic claims check. Fix in the sources (tadforce/src/**.md) what you can prove; list the rest as remaining with the reason. Then write the output file and call `tadforce build --json` again.',
    checks: REVIEW_CHECKS,
    inputs: {
      brief: brief || undefined,
      figures: rel(ctx, 'understanding', 'figures.json'),
      ...(claims ? { claims } : {}),
      questions: readQuestions(ctx),
      html: built.map((b) => b.html),
      sources: DOCS_ORDER.map((d) => rel(ctx, 'src', d)),
      model: rel(ctx, 'understanding', 'model.json'),
      graph: rel(ctx, 'facts', 'graph.json'),
      facts: rel(ctx, 'facts', 'facts.json'),
      validation: Object.fromEntries(built.map((b) => [b.doc, { score: b.validation.score, errors: b.validation.errors.slice(0, 40).map((e) => pick(e, ['code', 'message', 'where'])), warnings: b.validation.warnings.slice(0, 40).map((e) => pick(e, ['code', 'message', 'where'])) }])),
    },
    output: {
      file: rel(ctx, 'understanding', 'review.json'),
      format: { version: 1, reviewer: 'agent', summary: 'one paragraph', fixed: [{ where: 'src/tad/07-application.md#app-triggers', issue: '…', fix: '…' }], remaining: [{ where: '…', issue: '…', why: 'not provable from the metadata' }] },
    },
  }])[0];
}

/** Points to hand over at the end: open questions of the model, remaining review issues. */
export function finalReport(ctx) {
  const model = safeReadJson(ctx.p('understanding', 'model.json'));
  const review = safeReadJson(ctx.p('understanding', 'review.json'));
  const findings = (model?.findings || []);
  const fromModel = findings.filter((f) => f.kind === 'question').map((f) => pick(f, ['id', 'text', 'evidence']));
  // the doubts the writers noted (understanding/questions.md), once per section, after the model's
  const norm = (s) => String(s || '').toLowerCase().replace(/\W+/g, ' ').trim();
  const known = new Set(fromModel.map((q) => norm(q.text)));
  const perSection = new Map();
  const fromWriters = [];
  for (const q of readQuestions(ctx)) {
    if (known.has(norm(q.text))) continue;
    known.add(norm(q.text));
    const key = q.section || 'general';
    const n = (perSection.get(key) || 0) + 1;
    perSection.set(key, n);
    fromWriters.push({ id: `q-${key}-${n}`, text: q.text, section: q.section || null, source: 'questions.md' });
  }
  return {
    questions: [...fromModel, ...fromWriters],
    axesFindings: findings.filter((f) => f.kind !== 'question').length,
    reviewRemaining: review?.remaining || [],
    reviewFixed: (review?.fixed || []).length,
  };
}

export { fingerprintOf, groundTruth, readQuestions };
