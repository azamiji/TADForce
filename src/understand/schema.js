// The understanding model (tadforce/understanding/model.json): what the org does, assembled by the agents
// from the code and the call graph. Contract shared with the renderer (@@SEQ@@, @@STATE@@, @@ERD-DOMAIN@@):
// keep these keys; optional keys may be added.
//
// { version: 1, generatedAt,
//   actors:     [{ id, name, kind: internal|external|system, apps: [appApiName], evidence: [componentId] }],
//   domains:    [{ id, name, summary, objects: [objectApiName], components: [componentId], actors: [actorId] }],
//   processes:  [{ id, name, domain, summary, trigger,
//                  participants: [{ id, label, kind: actor|component|object|external, ref? }],
//                  steps: [{ from, to, label, async, reply, group: { kind: alt|opt|loop|par, label } | null, evidence: [componentId] }] }],
//   lifecycles: [{ id, object, field, states: [{ id, label }], initial, final: [stateId], transitions: [{ from, to, label, evidence }] }],
//   componentCards: { <componentId>: { role, triggeredBy, reads: [], writes: [], calls: [], notes } },
//   findings:   [{ id, kind: debt|risk|question, text, evidence: [] }] }      — Axes and final report only, never the TAD
//
// Component ids are the names of facts.json › inventory (`LeadTriggerHandler`, `customer360`), never invented.
// Optional keys written by TADForce: factsFingerprint, parts (task → fingerprint), stats.

export const MODEL_VERSION = 1;
export const ACTOR_KINDS = ['internal', 'external', 'system'];
export const PARTICIPANT_KINDS = ['actor', 'component', 'object', 'external'];
export const GROUP_KINDS = ['alt', 'opt', 'loop', 'par'];
export const FINDING_KINDS = ['debt', 'risk', 'question'];
export const CARD_KEYS = ['role', 'triggeredBy', 'reads', 'writes', 'calls', 'notes'];

const ID = /^[a-z0-9][a-z0-9-]*$/;
const isArr = Array.isArray;
const lower = (s) => String(s).toLowerCase();

/** Strip a graph kind prefix (`apex:Foo` → `Foo`) when the bare name is a known component. */
export function normalizeId(id, known) {
  if (typeof id !== 'string') return id;
  if (known.has(id)) return id;
  const m = /^[A-Za-z]+:(.+)$/.exec(id);
  return m && known.has(m[1]) ? m[1] : id;
}

/**
 * Check the model against the facts (and the graph when given): unknown component, object, app or actor
 * ids are errors — no invented names. Weak spots (steps without evidence, empty domains) are warnings.
 * @returns {{ errors: {where, message}[], warnings: {where, message}[] }}
 */
export function validateModel(model, facts, graph = null) {
  const errors = [], warnings = [];
  const err = (where, message) => errors.push({ where, message });
  const warn = (where, message) => warnings.push({ where, message });
  if (!model || typeof model !== 'object') { err('model', 'not an object'); return { errors, warnings }; }
  if (model.version !== MODEL_VERSION) err('version', `must be ${MODEL_VERSION}`);

  const inventory = new Set(facts?.inventory || []);
  const objects = new Set((facts?.data?.objects || []).map((o) => o.name));
  for (const t of facts?.data?.cmdtTypes || []) objects.add(t.type);
  const graphObjects = new Set((graph?.nodes || []).filter((n) => ['object', 'platformEvent', 'cmdt'].includes(n.kind)).map((n) => n.name));
  const apps = new Set((facts?.ui?.apps || []).map((a) => a.name));
  const excluded = new Map((facts?.exclusions?.applied || []).map((x) => [x.name, x]));
  const systems = (facts?.systems?.named || []).flatMap((s) => [s.id, s.name]).filter(Boolean).map(lower);
  const endpoints = new Set((facts?.systems?.unnamed || []).map((e) => e.name));

  const component = (where, id) => {
    if (typeof id !== 'string' || !id) { err(where, 'component id must be a non-empty string'); return; }
    if (excluded.has(id)) { err(where, `\`${id}\` is excluded (knowledge/exclusions.yml): it never appears`); return; }
    if (!inventory.has(id) && !objects.has(id)) err(where, `unknown component \`${id}\` (not in facts.json › inventory)`);
  };
  const object = (where, id) => {
    if (excluded.has(id)) { err(where, `\`${id}\` is excluded (knowledge/exclusions.yml): it never appears`); return; }
    if (objects.has(id)) return;
    if (graphObjects.has(id)) { warn(where, `object \`${id}\` is used by the code but its metadata was not retrieved`); return; }
    err(where, `unknown object \`${id}\``);
  };
  const list = (where, v) => { if (v !== undefined && !isArr(v)) { err(where, 'must be an array'); return []; } return v || []; };
  const ids = (where, items) => {
    const seen = new Set();
    for (const [i, x] of items.entries()) {
      if (!x || typeof x !== 'object') { err(`${where}[${i}]`, 'must be an object'); continue; }
      if (typeof x.id !== 'string' || !ID.test(x.id)) err(`${where}[${i}]`, `id "${x.id}" must be lower-case kebab-case (a-z, 0-9, -)`);
      else if (seen.has(x.id)) err(`${where}[${i}]`, `duplicate id "${x.id}"`);
      seen.add(x.id);
    }
    return seen;
  };

  const actors = list('actors', model.actors);
  const actorIds = ids('actors', actors);
  for (const [i, a] of actors.entries()) {
    const w = `actors[${a?.id || i}]`;
    if (!a?.name) err(w, 'name is required');
    if (!ACTOR_KINDS.includes(a?.kind)) err(w, `kind must be one of ${ACTOR_KINDS.join(', ')}`);
    for (const app of list(`${w}.apps`, a?.apps)) if (!apps.has(app)) err(`${w}.apps`, `unknown app \`${app}\``);
    for (const e of list(`${w}.evidence`, a?.evidence)) component(`${w}.evidence`, e);
    if (!(a?.evidence || []).length && !(a?.apps || []).length) warn(w, 'actor without evidence (apps, permission set groups, profiles, queues)');
  }

  const domains = list('domains', model.domains);
  const domainIds = ids('domains', domains);
  for (const [i, d] of domains.entries()) {
    const w = `domains[${d?.id || i}]`;
    if (!d?.name) err(w, 'name is required');
    for (const o of list(`${w}.objects`, d?.objects)) object(`${w}.objects`, o);
    for (const c of list(`${w}.components`, d?.components)) component(`${w}.components`, c);
    for (const a of list(`${w}.actors`, d?.actors)) if (!actorIds.has(a)) err(`${w}.actors`, `unknown actor "${a}"`);
    if (!(d?.objects || []).length && !(d?.components || []).length) warn(w, 'domain without objects nor components: drop it or ground it');
  }

  const processes = list('processes', model.processes);
  ids('processes', processes);
  for (const [i, p] of processes.entries()) {
    const w = `processes[${p?.id || i}]`;
    if (!p?.name) err(w, 'name is required');
    if (p?.domain != null && !domainIds.has(p.domain)) err(w, `unknown domain "${p.domain}"`);
    const parts = list(`${w}.participants`, p?.participants);
    const partIds = new Set();
    for (const [j, x] of parts.entries()) {
      const pw = `${w}.participants[${x?.id || j}]`;
      if (!x || typeof x.id !== 'string' || !x.id) { err(pw, 'id is required'); continue; }
      if (partIds.has(x.id)) err(pw, `duplicate participant "${x.id}"`);
      partIds.add(x.id);
      if (!PARTICIPANT_KINDS.includes(x.kind)) { err(pw, `kind must be one of ${PARTICIPANT_KINDS.join(', ')}`); continue; }
      const ref = x.ref || x.id;
      if (x.kind === 'component') component(pw, ref);
      else if (x.kind === 'object') object(pw, ref);
      else if (x.kind === 'actor' && !actorIds.has(ref)) err(pw, `unknown actor "${ref}" (declare it in actors)`);
      else if (x.kind === 'external') {
        const names = [ref, x.label].filter(Boolean).map(lower);
        if (names.some((n) => systems.includes(n))) continue;
        if (endpoints.has(ref)) warn(pw, `\`${ref}\` is an endpoint with no confirmed system name (knowledge/glossary.yml › systems)`);
        else err(pw, `external system "${x.label || ref}" is not in knowledge/glossary.yml › systems: never invent a system name`);
      }
    }
    const steps = list(`${w}.steps`, p?.steps);
    if (steps.length < 2) warn(w, 'a process needs at least 2 observed steps');
    for (const [j, s] of steps.entries()) {
      const sw = `${w}.steps[${j}]`;
      if (!s || typeof s !== 'object') { err(sw, 'must be an object'); continue; }
      if (!partIds.has(s.from)) err(sw, `from "${s.from}" is not a participant`);
      if (!partIds.has(s.to)) err(sw, `to "${s.to}" is not a participant`);
      if (!s.label) err(sw, 'label is required');
      if (s.group != null && (typeof s.group !== 'object' || !GROUP_KINDS.includes(s.group.kind))) err(sw, `group.kind must be one of ${GROUP_KINDS.join(', ')}`);
      const ev = list(`${sw}.evidence`, s.evidence);
      for (const e of ev) component(`${sw}.evidence`, e);
      if (!ev.length) warn(sw, 'step without evidence');
    }
  }

  const lifecycles = list('lifecycles', model.lifecycles);
  ids('lifecycles', lifecycles);
  for (const [i, l] of lifecycles.entries()) {
    const w = `lifecycles[${l?.id || i}]`;
    if (!l?.object) { err(w, 'object is required'); continue; }
    object(w, l.object);
    const o = (facts?.data?.objects || []).find((x) => x.name === l.object);
    if (!l.field) err(w, 'field is required');
    else if (o && /__c$/.test(l.field) && !(o.customFieldNames || []).includes(l.field)) err(w, `unknown field \`${l.object}.${l.field}\``);
    const states = list(`${w}.states`, l.states);
    const stateIds = new Set(states.map((s) => s?.id));
    if (states.length < 2) warn(w, 'a lifecycle needs at least 2 states');
    if (!stateIds.has(l.initial)) err(w, `initial "${l.initial}" is not a state`);
    for (const f of list(`${w}.final`, l.final)) if (!stateIds.has(f)) err(w, `final "${f}" is not a state`);
    for (const [j, t] of list(`${w}.transitions`, l.transitions).entries()) {
      const tw = `${w}.transitions[${j}]`;
      if (!stateIds.has(t?.from)) err(tw, `from "${t?.from}" is not a state`);
      if (!stateIds.has(t?.to)) err(tw, `to "${t?.to}" is not a state`);
      for (const e of list(`${tw}.evidence`, t?.evidence)) component(`${tw}.evidence`, e);
    }
  }

  const cards = model.componentCards ?? {};
  if (typeof cards !== 'object' || isArr(cards)) err('componentCards', 'must be an object keyed by component id');
  else for (const [id, card] of Object.entries(cards)) {
    const w = `componentCards[${id}]`;
    component(w, id);
    if (!card || typeof card !== 'object') { err(w, 'must be an object'); continue; }
    if (!card.role) err(w, 'role is required: what the component does, in one sentence');
    for (const k of ['reads', 'writes', 'calls']) list(`${w}.${k}`, card[k]);
  }

  const findings = list('findings', model.findings);
  for (const [i, f] of findings.entries()) {
    const w = `findings[${f?.id || i}]`;
    if (!FINDING_KINDS.includes(f?.kind)) err(w, `kind must be one of ${FINDING_KINDS.join(', ')}`);
    if (!f?.text) err(w, 'text is required');
    for (const e of list(`${w}.evidence`, f?.evidence)) if (typeof e !== 'string' || (!inventory.has(e) && !objects.has(e) && !/[/:]/.test(e))) err(`${w}.evidence`, `unknown evidence \`${e}\` (a component id or a file path)`);
  }
  return { errors, warnings };
}
