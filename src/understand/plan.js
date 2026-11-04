// The work packages of the UNDERSTAND phase: self-contained tasks that agents can run in parallel.
//   developer  — one slice of components (grouped by call-graph connected components and objects): read the
//                code, fill one card per component
//   analyst    — actors, domains, lifecycles, from objects, record types, status picklists, paths, apps, queues
//   architect  — end-to-end processes assembled from the cards and the observed edges, findings
// Each task carries a fingerprint of its input DATA: a part written for an older fingerprint is redone.
// The fingerprint never depends on TADForce's own code (a better parser, new lifecycle candidates, an extra
// edge kind): it hashes the files the task reads and the slice of facts it is written from, plus the
// schema version of its output (TASK_SCHEMA) — bumping that version is the only way the CLI forces a redo.
import path from 'node:path';
import crypto from 'node:crypto';
import { findMetadataRoots, files, bundles, readXml, arr, str, safeRead } from '../facts/xml.js';
import { CODE_KINDS, indexGraph } from './graph.js';
import { CARD_KEYS } from './schema.js';

const sha = (s) => crypto.createHash('sha1').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex').slice(0, 12);
export const fingerprintOf = sha;

/** Version of the output format of each role: bump one only when its part files must be rewritten. */
export const TASK_SCHEMA = { developer: 1, analyst: 1, architect: 1 };

/**
 * Fingerprint of a developer slice: its components and the contents of their files. The edges the parser
 * draws are derived from the same files: they do not enter the fingerprint (a new parser keeps the cards).
 */
export function developerFingerprint(nodes) {
  return sha(['developer', TASK_SCHEMA.developer, nodes.map((n) => [n.id, n.hash || null]).sort((a, b) => a[0].localeCompare(b[0]))]);
}

/** Hash of the metadata files the analyst's candidates come from (value sets, path assistants, objects). */
export function analystSourceHash(dirs, facts) {
  const roots = findMetadataRoots(dirs);
  const known = new Set((facts.data?.objects || []).map((o) => o.name));
  const list = [
    ...files(roots, 'globalValueSets', '.globalValueSet-meta.xml'),
    ...files(roots, 'standardValueSets', '.standardValueSet-meta.xml'),
    ...files(roots, 'pathAssistants', '.pathAssistant-meta.xml'),
    ...bundles(roots, 'objects').filter((b) => known.has(b.name)).flatMap((b) => files([b.dir], 'fields', '.field-meta.xml')),
  ];
  const rel = (f) => { const r = roots.find((x) => f.startsWith(x)); return (r ? path.relative(r, f) : path.basename(f)).split(path.sep).join('/'); };
  return sha(list.map((f) => [rel(f), sha(safeRead(f))]).sort((a, b) => a[0].localeCompare(b[0])));
}

const MAX_NODES = 30;
const MAX_LINES = 5000;
const CALL_EDGES = new Set(['calls', 'delegates', 'extends']);

/** Components that get a card: behaviour holders, active ones only. */
export function cardNodes(graph) {
  return graph.nodes.filter((n) => CODE_KINDS.includes(n.kind) && n.active !== false);
}

const weight = (n) => (n.kind === 'apex' || n.kind === 'trigger' ? Math.max(20, n.lines || 0) : 60);

/** Developer slices: connected components of the code graph, singletons grouped by their main object. */
export function developerSlices(graph) {
  const g = indexGraph(graph);
  const code = cardNodes(graph);
  const inCode = new Set(code.map((n) => n.id));
  const parent = new Map(code.map((n) => [n.id, n.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const e of graph.edges) if (CALL_EDGES.has(e.kind) && inCode.has(e.from) && inCode.has(e.to)) parent.set(find(e.from), find(e.to));
  const groups = new Map();
  for (const n of code) { const r = find(n.id); (groups.get(r) || groups.set(r, []).get(r)).push(n); }
  // singletons travel with the other components of their main object
  const mainObject = (n) => {
    const count = new Map();
    for (const e of g.out(n.id)) if (/^(object|platformEvent|cmdt):/.test(e.to)) count.set(e.to, (count.get(e.to) || 0) + (e.kind === 'triggers-on' ? 3 : 1));
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || `kind:${n.kind}`;
  };
  const merged = new Map();
  for (const list of groups.values()) {
    const key = list.length > 1 ? `cc:${list.map((n) => n.id).sort()[0]}` : `obj:${mainObject(list[0])}`;
    (merged.get(key) || merged.set(key, []).get(key)).push(...list);
  }
  // pack, largest first; a group larger than a slice is cut in its own order
  const chunks = [];
  for (const list of [...merged.values()].map((l) => l.sort((a, b) => a.id.localeCompare(b.id)))) {
    let cur = [], lines = 0;
    for (const n of list) {
      if (cur.length && (cur.length >= MAX_NODES || lines + weight(n) > MAX_LINES)) { chunks.push(cur); cur = []; lines = 0; }
      cur.push(n); lines += weight(n);
    }
    if (cur.length) chunks.push(cur);
  }
  chunks.sort((a, b) => b.reduce((s, n) => s + weight(n), 0) - a.reduce((s, n) => s + weight(n), 0) || a[0].id.localeCompare(b[0].id));
  const slices = [];
  for (const c of chunks) {
    const lines = c.reduce((s, n) => s + weight(n), 0);
    const fit = slices.find((s) => s.nodes.length + c.length <= MAX_NODES && s.lines + lines <= MAX_LINES);
    if (fit) { fit.nodes.push(...c); fit.lines += lines; } else slices.push({ nodes: [...c], lines });
  }
  return slices.map((s, i) => ({ id: `dev-${String(i + 1).padStart(2, '0')}`, nodes: s.nodes.sort((a, b) => a.id.localeCompare(b.id)), lines: s.lines }));
}

const edgeView = (e, other, g) => {
  const n = g.byId.get(other);
  const v = { edge: e.kind, [e.from === other ? 'from' : 'to']: n ? n.name : other, kind: n ? n.kind : undefined };
  for (const k of ['async', 'methods', 'modes', 'via', 'ops', 'events']) if (e[k] !== undefined) v[k] = e[k];
  return v;
};

/** Candidate status fields (lifecycles): picklists named like a status, path assistants. */
export function lifecycleCandidates(dirs, facts) {
  const roots = findMetadataRoots(dirs);
  const known = new Set((facts.data?.objects || []).map((o) => o.name));
  const out = [];
  const globals = new Map();
  for (const f of files(roots, 'globalValueSets', '.globalValueSet-meta.xml')) globals.set(path.basename(f, '.globalValueSet-meta.xml'), arr(readXml(f).customValue).map((v) => str(v.fullName)).filter(Boolean));
  const standards = new Map();
  for (const f of files(roots, 'standardValueSets', '.standardValueSet-meta.xml')) standards.set(path.basename(f, '.standardValueSet-meta.xml'), arr(readXml(f).standardValue).map((v) => str(v.fullName)).filter(Boolean));
  const STANDARD = { 'Lead.Status': 'LeadStatus', 'Case.Status': 'CaseStatus', 'Opportunity.StageName': 'OpportunityStage', 'Contract.Status': 'ContractStatus', 'Order.Status': 'OrderStatus', 'Solution.Status': 'SolutionStatus', 'Task.Status': 'TaskStatus', 'Campaign.Status': 'CampaignStatus', 'WorkOrder.Status': 'WorkOrderStatus', 'Quote.Status': 'QuoteStatus' };
  const paths = new Map();
  for (const f of files(roots, 'pathAssistants', '.pathAssistant-meta.xml')) {
    const x = readXml(f);
    const key = `${str(x.entityName) || str(x.sobjectType)}.${str(x.fieldName)}`;
    paths.set(key, { path: path.basename(f, '.pathAssistant-meta.xml'), recordType: str(x.recordTypeName) || undefined, steps: arr(x.pathAssistantSteps).map((s) => str(s.picklistValueName)).filter(Boolean) });
  }
  for (const b of bundles(roots, 'objects')) {
    if (!known.has(b.name)) continue;
    for (const f of files([b.dir], 'fields', '.field-meta.xml')) {
      const field = path.basename(f, '.field-meta.xml');
      const key = `${b.name}.${field}`;
      const x = readXml(f);
      const isPick = /Picklist/.test(str(x.type) || '') || (!x.type && STANDARD[key]);
      if (!isPick || (!/status|stage|state|phase|step|statut|etape/i.test(field) && !paths.has(key))) continue;
      const vs = x.valueSet || {};
      let values = arr(vs.valueSetDefinition?.value).map((v) => str(v.fullName)).filter(Boolean);
      if (!values.length && str(vs.valueSetName)) values = globals.get(str(vs.valueSetName)) || [];
      if (!values.length && STANDARD[key]) values = standards.get(STANDARD[key]) || [];
      out.push({ object: b.name, field, values, ...(paths.has(key) ? { pathAssistant: paths.get(key) } : {}) });
    }
  }
  for (const [key, std] of Object.entries(STANDARD)) {
    const [object, field] = key.split('.');
    if (!known.has(object) || out.some((c) => c.object === object && c.field === field) || !standards.has(std)) continue;
    out.push({ object, field, values: standards.get(std), ...(paths.has(key) ? { pathAssistant: paths.get(key) } : {}) });
  }
  return out.sort((a, b) => (a.object + a.field).localeCompare(b.object + b.field));
}

/**
 * Entry points (what starts something: a user, a caller, a schedule, an event) and the chains of observed
 * edges that follow them. The architect assembles processes from these chains, never from imagination.
 */
export function entryChains(graph, { maxChains = 60, maxSteps = 24 } = {}) {
  const g = indexGraph(graph);
  const entries = [];
  for (const n of graph.nodes) {
    const why = [];
    if (n.kind === 'apex' && (n.kinds || []).some((k) => ['rest', 'soap', 'emailHandler', 'registrationHandler'].includes(k))) why.push((n.kinds || []).includes('rest') ? `REST ${n.restUrl || ''}`.trim() : (n.kinds || []).find((k) => ['soap', 'emailHandler', 'registrationHandler'].includes(k)));
    if (n.kind === 'apex' && (n.kinds || []).includes('schedulable')) why.push('schedulable');
    if (n.kind === 'trigger' && n.active !== false) why.push(`trigger ${(n.events || []).join(', ')}`);
    if (n.kind === 'flow' && n.active !== false && n.triggerType) why.push(`flow ${n.triggerType}${n.schedule ? ' ' + n.schedule : ''}`);
    if (n.kind === 'flow' && n.active !== false && n.processType === 'Flow' && !g.in(n.id).length) why.push('screen flow');
    if (['flexipage', 'tab', 'quickAction', 'vf'].includes(n.kind)) why.push(n.kind);
    if (n.kind === 'omniscript' && n.active !== false) why.push('OmniScript');
    if (why.length) entries.push({ node: n, why: why.join('; ') });
  }
  const FOLLOW = new Set(['calls', 'delegates', 'places', 'publishes', 'writes']);
  const chains = [];
  for (const { node, why } of entries) {
    const steps = [], seen = new Set([node.id]);
    const visit = (id, depth) => {
      if (depth > 8 || steps.length >= maxSteps) return;
      const next = [];
      for (const e of g.out(id)) {
        if (!FOLLOW.has(e.kind) && e.kind !== 'reads' && !(e.kind === 'triggers-on' && depth === 0)) continue;
        next.push({ e, to: e.to });
      }
      // a write fires the triggers and record-triggered flows of the object; an event reaches its subscribers
      if (/^(object|platformEvent):/.test(id)) {
        for (const e of g.in(id)) if (e.kind === 'triggers-on' || e.kind === 'subscribes') next.push({ e: { ...e, kind: e.kind === 'subscribes' ? 'delivers' : 'fires', from: id, to: e.from }, to: e.from });
      }
      for (const { e, to } of next) {
        if (steps.length >= maxSteps) return;
        const target = g.byId.get(to);
        const from = g.byId.get(e.from);
        steps.push({ from: from ? from.name : e.from, to: target ? target.name : to, edge: e.kind, ...(e.async ? { async: e.async } : {}), ...(e.methods ? { methods: e.methods } : {}), ...(e.ops ? { ops: e.ops } : {}), ...(e.via === 'before-save' ? { via: e.via } : {}) });
        // do not walk on from what is only read, nor re-enter the trigger that started the chain; a before-save
        // assignment changes the record being saved: no new save, no trigger fired again
        if (e.kind === 'reads' || e.kind === 'triggers-on' || e.via === 'before-save' || seen.has(to)) continue;
        if (/^(object|platformEvent):/.test(to) && !['writes', 'publishes'].includes(e.kind)) continue;
        seen.add(to);
        visit(to, depth + 1);
      }
    };
    visit(node.id, 0);
    if (steps.length) chains.push({ entry: node.name, kind: node.kind, why, steps });
  }
  return chains.sort((a, b) => b.steps.length - a.steps.length || a.entry.localeCompare(b.entry)).slice(0, maxChains);
}

const rel = (ctx, ...p) => path.relative(ctx.project, ctx.p(...p)).split(path.sep).join('/');

/** Every task of the understand phase, with its fingerprint (deterministic for the same inputs). */
export function planUnderstanding(ctx, facts, graph, { dirs = [], factsFingerprint }) {
  const g = indexGraph(graph);
  const parts = (id) => rel(ctx, 'understanding', 'parts', `${id}.json`);
  const graphPath = rel(ctx, 'facts', 'graph.json');
  const factsPath = rel(ctx, 'facts', 'facts.json');
  const developer = developerSlices(graph).map((s) => {
    const components = s.nodes.map((n) => ({
      id: n.name, kind: n.kind, file: n.file,
      ...(n.kinds ? { apexKinds: n.kinds } : {}), ...(n.triggerType ? { triggerType: n.triggerType } : {}), ...(n.events ? { events: n.events } : {}),
      ...(n.invocableUncalled ? { invocableUncalled: true } : {}),
      out: g.out(n.id).map((e) => edgeView(e, e.to, g)),
      in: g.in(n.id).map((e) => edgeView(e, e.from, g)),
    }));
    const fingerprint = developerFingerprint(s.nodes);
    const objects = [...new Set(s.nodes.flatMap((n) => g.out(n.id).filter((e) => /^(object|platformEvent|cmdt):/.test(e.to)).map((e) => g.byId.get(e.to).name)))].sort().slice(0, 6);
    return {
      id: s.id, role: 'developer', fingerprint,
      title: `Read ${components.length} component(s)${objects.length ? ' around ' + objects.join(', ') : ''}`,
      read: ['references/understand.md › Developer', 'references/evidence-rules.md'],
      instructions: 'Open every file listed (the trigger and its handler, the service behind the controller). For each component write one card: what it does for the business and how (thresholds, conditions, switches, records created or changed, systems called), never a description of the file. Use only names that exist: component ids as given, objects from the code. The graph edges (out / in) are what the parser saw; correct them in the card when the code says otherwise and say so in notes. A component flagged invocableUncalled is an invocable action no flow of the snapshot calls: say what could call it, and add a finding (kind question) when nothing does.',
      components,
      output: { file: parts(s.id), format: { task: s.id, fingerprint, cards: { '<componentId>': Object.fromEntries(CARD_KEYS.map((k) => [k, ['reads', 'writes', 'calls'].includes(k) ? [] : ''])) } } },
      cardSchema: {
        role: 'One sentence: the business responsibility (« Scores a loan application from the rules in ScoringRule__mdt »).',
        triggeredBy: 'What starts it: user action and where (page, tab, quick action), trigger event, schedule, caller component, platform event, inbound call.',
        reads: 'Objects (API names) and configuration read.', writes: 'Objects written, events published.',
        calls: 'Component ids called (Apex, flows, LWC, Integration Procedures) and named credentials (callout:Name).',
        notes: 'Thresholds, conditions, error handling, async boundaries, anything an architect must know. Optional.',
      },
    };
  });

  const objects = (facts.data?.objects || []).filter((o) => !o.namespace || graph.nodes.some((n) => n.name === o.name)).map((o) => ({
    name: o.name, label: o.label, kind: o.kind, customFields: o.customFields,
    recordTypes: (o.recordTypes || []).filter((r) => r.active !== false).map((r) => r.name),
    relations: (o.relations || []).map((r) => `${r.field} → ${r.to.join('|')}`),
    usedBy: g.in(`object:${o.name}`).filter((e) => e.kind !== 'serves').map((e) => g.byId.get(e.from)?.name).filter(Boolean).slice(0, 12),
  }));
  const specs = ((ctx.cfg.inputs && ctx.cfg.inputs.specs) || []).map((p) => rel(ctx, p));
  const analystInputs = {
    objects,
    lifecycleCandidates: lifecycleCandidates(dirs, facts),
    apps: (facts.ui?.apps || []).map((a) => ({ name: a.name, label: a.label, console: a.console, tabs: a.tabs })),
    queues: (facts.security?.queues || []).map((q) => ({ name: q.name, label: q.label, objects: q.objects })),
    permissionSetGroups: (facts.security?.permissionSetGroups || []).map((p) => p.name),
    profiles: (facts.security?.profiles || []).map((p) => p.name),
    roles: (facts.security?.roles || []).length,
    usersByProfile: facts.org?.usersByProfile || null,
    flows: (facts.automation?.flows || []).filter((f) => f.active).map((f) => ({ name: f.name, label: f.label, object: f.object, triggerType: f.triggerType, processType: f.processType })),
    systems: (facts.systems?.named || []).map((s) => ({ id: s.id, name: s.name, description: s.description })),
    products: facts.modules?.products || [],
    specifications: specs,
    glossary: rel(ctx, 'knowledge', 'glossary.yml'),
  };
  // the input data, not what TADForce derives from it (lifecycle candidates, products): a new version of the
  // CLI keeps the analysis; a change of the metadata, the org facts, the specifications or the glossary redoes it
  const analystData = {
    objects: objects.map((o) => [o.name, o.label, o.kind, o.customFields, o.recordTypes, o.relations]),
    sources: analystSourceHash(dirs, facts),
    namespaces: (facts.namespaces || []).map((n) => n.namespace).sort(),
    apps: analystInputs.apps, queues: analystInputs.queues, permissionSetGroups: analystInputs.permissionSetGroups,
    profiles: analystInputs.profiles, roles: analystInputs.roles, usersByProfile: analystInputs.usersByProfile,
    flows: analystInputs.flows, systems: analystInputs.systems,
  };
  const analystFp = sha(['analyst', TASK_SCHEMA.analyst, analystData, specs, ctx.glossary()]);
  const analyst = {
    id: 'analyst', role: 'functional-analyst', fingerprint: analystFp,
    title: 'Actors, business domains and lifecycles',
    read: ['references/understand.md › Functional analyst', 'references/naming-external-systems.md'],
    instructions: 'Decide who uses the platform (actors, from apps, permission set groups, profiles, queues, org user counts) and the business domains (5 to 10 groups of objects and components that serve one business purpose). Model a lifecycle for each status field that drives a process (states from the picklist values, transitions only when a component or a path shows them). Read the functional specifications when there are some: they give the vocabulary and the purpose; the metadata decides what is built. Use the glossary terms. Doubts go to findings (kind question), never into the model as facts.',
    inputs: analystInputs,
    output: { file: parts('analyst'), format: { task: 'analyst', fingerprint: analystFp, actors: [], domains: [], lifecycles: [], findings: [] } },
  };

  // the parts it reads (their fingerprints) and the systems it may name; never the chains (derived by the parser)
  const architectFp = sha(['architect', TASK_SCHEMA.architect, developer.map((d) => d.fingerprint), analyst.fingerprint, (facts.systems?.named || []).map((s) => [s.id, s.name])]);
  const unusedInvocables = graph.nodes.filter((n) => n.invocableUncalled).map((n) => n.name);
  const architect = {
    id: 'architect', role: 'architect', fingerprint: architectFp, after: [...developer.map((d) => d.id), 'analyst'],
    title: 'End-to-end processes and findings',
    read: ['references/understand.md › Architect', 'references/style-guide.md › Processes'],
    instructions: 'Read the cards and the analyst part, then assemble the key end-to-end processes (typically 4 to 12): who starts it, every component it goes through, the objects written, the systems called, asynchronous boundaries, alternatives. Build each process only from observed edges (the chains below, the cards, the graph); a step you cannot evidence is not drawn — write a finding (question) instead. Attach every process to a domain. Add components to the domains when the cards show they belong there. Write findings (debt, risk, question) for the Improvement Axes and the final report: they never reach the TAD.',
    inputs: {
      parts: [...developer.map((d) => d.output.file), analyst.output.file],
      graph: graphPath,
      chains: entryChains(graph),
      systems: (facts.systems?.named || []).map((s) => ({ id: s.id, name: s.name, endpoints: s.endpoints.map((e) => `${e.kind}:${e.name}`) })),
      unnamedEndpoints: (facts.systems?.unnamed || []).map((e) => `${e.kind}:${e.name}`),
      signals: (facts.signals || []).slice(0, 40),
      // invocable actions no flow of the snapshot calls: dead code candidates (a finding when nothing else calls them)
      ...(unusedInvocables.length ? { invocablesUncalled: unusedInvocables } : {}),
    },
    output: { file: parts('architect'), format: { task: 'architect', fingerprint: architectFp, processes: [], domains: [], findings: [] } },
  };
  return { developer, analyst, architect, files: { graph: graphPath, facts: factsPath, model: rel(ctx, 'understanding', 'model.json') } };
}
