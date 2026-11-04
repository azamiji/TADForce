// Deterministic call graph of the org: who triggers, calls, reads, writes, publishes what.
// Pragmatic parsing (regular expressions on Apex and LWC sources, XML for flows and OmniStudio):
// it sees what is written statically in the metadata, never what is computed at run time.
//
// Known limits (documented in references/understand.md):
// - Apex: calls are `Class.method(` and `new Class(`; dynamic dispatch (Type.forName, interfaces resolved at
//   run time, custom metadata naming a class) is not followed. DML targets are typed from local declarations
//   and SOQL assignments (best effort); field assignments on Trigger.new are not counted as writes.
// - SOQL built from string concatenation is read only when the literal starts with SELECT and names FROM.
//   Relationship paths (Parent__r.Name) and child subqueries (FROM Children__r) are resolved through the
//   relations of facts.json: the parent and child objects are read too.
// - Flows: Apex actions, subflows, record elements, screen components, $Record assignments of a before-save
//   flow (a write of the triggering record); decisions and formulas are not
//   evaluated. OmniStudio: keys found in the element JSON (integrationProcedureKey, bundle, remoteClass,
//   lwcName, namedCredential, callout:). Test classes are left out of the graph.
// - Only components present in facts.json are nodes (scope and exclusions applied). Objects referenced by
//   code but absent from the snapshot become object nodes with `retrieved: false`.
import path from 'node:path';
import crypto from 'node:crypto';
import { findMetadataRoots, files, bundles, readXml, arr, str, safeRead } from '../facts/xml.js';
import { scanApex } from '../facts/extractors/apex.js';
import { toPosix } from '../util/fsx.js';

export const GRAPH_VERSION = 2;
/** Kinds of nodes that hold behaviour: each one gets a component card in the understanding model. */
export const CODE_KINDS = ['apex', 'trigger', 'flow', 'lwc', 'aura', 'vf', 'omniscript', 'ip', 'datamapper'];
export const EDGE_KINDS = ['triggers-on', 'delegates', 'calls', 'extends', 'reads', 'writes', 'publishes', 'subscribes', 'places', 'references', 'serves'];

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const lower = (s) => String(s).toLowerCase();
// standard objects a DML or a variable may name without the snapshot describing them
const STANDARD_SOBJECTS = new Set(['Account', 'Contact', 'Lead', 'Opportunity', 'OpportunityLineItem', 'OpportunityContactRole', 'Case', 'CaseComment', 'Task', 'Event', 'User', 'Group', 'GroupMember', 'Campaign', 'CampaignMember', 'Contract', 'Order', 'OrderItem', 'Product2', 'Pricebook2', 'PricebookEntry', 'Quote', 'QuoteLineItem', 'Asset', 'Entitlement', 'WorkOrder', 'WorkOrderLineItem', 'ServiceAppointment', 'ContentVersion', 'ContentDocument', 'ContentDocumentLink', 'Attachment', 'Note', 'FeedItem', 'EmailMessage', 'AccountContactRelation', 'AccountTeamMember', 'OpportunityTeamMember', 'PermissionSetAssignment', 'Individual', 'ContactPointEmail', 'ContactPointPhone']);

/**
 * The Apex kinds of facts.json, corrected from the code: a class is `auraEnabled` (a controller) only when a
 * method carries @AuraEnabled; @AuraEnabled on properties only (an inner wrapper class) makes it `auraEnabledFields`.
 */
export function apexKinds(kinds = [], code = '') {
  // the facts already keep auraEnabled for classes with an @AuraEnabled method only (0.6): mark properties-only ones here
  if (!kinds.includes('auraEnabled') && !/@AuraEnabled\b/i.test(code)) return kinds;
  const method = /@AuraEnabled\b(?:\s*\([^)]*\))?\s*(?:(?:public|global|private|protected|static|override|virtual|webservice)\s+)+[\w<>\[\],.\s]*?\w+\s*\(/i.test(code);
  return method ? [...new Set([...kinds, 'auraEnabled'])].sort() : [...new Set([...kinds.filter((k) => k !== 'auraEnabled'), 'auraEnabledFields'])].sort();
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Build the graph from the metadata directories, keeping only the components that facts.json documents.
 * @param {string[]} dirs  source directories (snapshot or package directories)
 * @param {object} facts   facts.json (exclusions and scope already applied)
 * @param {object} [opts]  { base: folder the file paths are relative to (the project) }
 */
export function buildGraph(dirs, facts, opts = {}) {
  const roots = findMetadataRoots(dirs);
  const rel = (f) => (opts.base ? toPosix(path.relative(opts.base, f)) : toPosix(f));
  const nodes = new Map();
  const edges = new Map();

  const addNode = (kind, name, extra = {}) => {
    const id = `${kind}:${name}`;
    if (!nodes.has(id)) nodes.set(id, { id, kind, name, ...extra });
    else Object.assign(nodes.get(id), extra);
    return id;
  };
  const addEdge = (from, to, kind, detail = {}) => {
    if (!from || !to || from === to) return;
    const key = `${from}|${kind}|${to}`;
    const e = edges.get(key);
    if (!e) { edges.set(key, { from, to, kind, ...clean(detail) }); return; }
    for (const [k, v] of Object.entries(clean(detail))) {
      if (Array.isArray(v)) e[k] = [...new Set([...(e[k] || []), ...v])].sort();
      else if (e[k] === undefined) e[k] = v;
    }
  };

  // --- indexes of what facts.json documents (case-insensitive like Salesforce API names)
  const idx = (list, key = 'name') => new Map((list || []).map((x) => [lower(typeof x === 'string' ? x : x[key]), typeof x === 'string' ? { name: x } : x]));
  const classes = idx((facts.apex?.classes || []).filter((c) => !c.test));
  const triggers = idx(facts.apex?.triggers);
  const flows = idx(facts.automation?.flows);
  const lwcs = idx(facts.ui?.lwc);
  const auras = idx(facts.ui?.aura);
  const vfs = idx(facts.ui?.vfPages);
  const flexipages = idx(facts.ui?.flexipages);
  const quickActions = idx(facts.ui?.quickActions);
  const channels = idx(facts.ui?.messageChannels);
  const omni = facts.automation?.omnistudio || {};
  const scripts = idx(omni.omniScripts);
  const ips = idx(omni.integrationProcedures);
  const mappers = idx(omni.dataMappers);
  const ncs = idx(facts.integration?.namedCredentials);
  const queues = idx(facts.security?.queues);
  const objects = idx(facts.data?.objects);
  for (const t of facts.data?.cmdtTypes || []) if (!objects.has(lower(t.type))) objects.set(lower(t.type), { name: t.type, kind: 'customMetadataType' });

  const objKind = (o) => (o.kind === 'platformEvent' || /__e$/i.test(o.name) ? 'platformEvent' : o.kind === 'customMetadataType' || /__mdt$/i.test(o.name) ? 'cmdt' : 'object');
  /** Node id of an SObject API name; unknown names become `retrieved: false` object nodes when they look like one. */
  const objectId = (name, { create = true } = {}) => {
    if (!name) return null;
    const o = objects.get(lower(name));
    if (o) return addNode(objKind(o), o.name, { label: o.label || undefined });
    if (!create || !/^[A-Z][A-Za-z0-9_]*$/.test(name) || /^(Id|String|Integer|Decimal|Boolean|Date|Datetime|Object|SObject|List|Set|Map)$/.test(name)) return null;
    return addNode(/__e$/.test(name) ? 'platformEvent' : /__mdt$/.test(name) ? 'cmdt' : 'object', name, { retrieved: false });
  };
  const classId = (name) => { const c = classes.get(lower(name)); return c ? `apex:${c.name}` : null; };

  // --- SOQL relationships, resolved through the relations of facts.json (field → target objects)
  const relationsOf = (obj) => objects.get(lower(obj))?.relations || [];
  /** Objects a relationship name of `obj` points to: Parent__r → Parent__c's targets, Account → AccountId's. */
  const parentTargets = (obj, relName) => {
    const field = /__r$/i.test(relName) ? relName.replace(/__r$/i, '__c') : `${relName}Id`;
    const r = relationsOf(obj).find((x) => lower(x.field) === lower(field) || lower(x.field) === lower(relName));
    if (r) return r.to || [];
    // not described in the snapshot: Parent__r is read as Parent__c when that object exists
    if (/__r$/i.test(relName) && objects.has(lower(field))) return [objects.get(lower(field)).name];
    if (!/__r$/i.test(relName) && objects.has(lower(relName)) && objects.get(lower(relName)).kind === 'standard') return [objects.get(lower(relName)).name];
    return [];
  };
  /** Objects read through the parent paths of a query on `from` (Parent__r.Name, Parent__r.Grand__r.Code__c). */
  const relationshipReads = (from, query) => {
    const out = new Set();
    const select = query.replace(/\bFROM\s+\w+/i, ' ');
    for (const m of select.matchAll(/(?<![:.\w])((?:\w+\.)+)\w+/g)) {
      let cur = [from];
      for (const hop of m[1].split('.').filter(Boolean)) {
        const next = [...new Set(cur.flatMap((o) => parentTargets(o, hop)))];
        if (!next.length) break;
        for (const o of next) if (lower(o) !== lower(from)) out.add(o);
        cur = next;
      }
    }
    return [...out].filter((o) => objects.has(lower(o)));
  };
  /** The child object of a subquery (FROM Children__r): the object whose relation to `parent` has that name. */
  const childObject = (parent, name) => {
    const rel = name.replace(/__r$/i, '');
    for (const o of objects.values()) {
      if ((o.relations || []).some((r) => lower(r.relationshipName || '') === lower(rel) && (r.to || []).some((t) => lower(t) === lower(parent)))) return o.name;
    }
    // a semi-join (WHERE Id IN (SELECT … FROM Other__c)) reads that object
    return objects.has(lower(name)) ? objects.get(lower(name)).name : null;
  };

  // --- Apex classes and triggers
  const apexSources = [];
  for (const f of files(roots, 'classes', '.cls')) {
    const c = classes.get(lower(path.basename(f, '.cls')));
    if (!c) continue;
    const raw = safeRead(f);
    const scanned = scanApex(raw);
    addNode('apex', c.name, { file: rel(f), hash: sha(raw), lines: c.lines, kinds: apexKinds(c.kinds, scanned.code), sharing: c.sharing, restUrl: c.restUrl || undefined });
    apexSources.push({ id: `apex:${c.name}`, self: c.name, ...scanned });
  }
  for (const f of files(roots, 'triggers', '.trigger')) {
    const t = triggers.get(lower(path.basename(f, '.trigger')));
    if (!t) continue;
    const raw = safeRead(f);
    const id = addNode('trigger', t.name, { file: rel(f), hash: sha(raw), events: t.events, active: t.active });
    const target = objectId(t.object);
    if (target) addEdge(id, target, /__e$/i.test(t.object) ? 'subscribes' : 'triggers-on', { events: t.events });
    apexSources.push({ id, self: t.name, trigger: true, ...scanApex(raw) });
  }
  // @future methods, per class: a call to one of them is asynchronous
  const futures = new Map();
  for (const s of apexSources) {
    const names = [...s.code.matchAll(/@future\b[^)]*\)?\s*(?:(?:public|global|private|protected|static|void|override)\s+)*(?:\w+\s+)?(\w+)\s*\(/gi)].map((m) => lower(m[1]));
    if (names.length) futures.set(lower(s.self), new Set(names));
  }
  const queueNames = new Map([...queues.values()].map((q) => [q.name, q]));
  for (const s of apexSources) analyseApex(s);

  function analyseApex({ id, self, code, strings, trigger }) {
    const call = trigger ? 'delegates' : 'calls';
    // local variable types, for DML targets and async calls on variables
    const vars = new Map();
    for (const m of code.matchAll(/\b(?:List|Set)\s*<\s*(\w+)\s*>\s+(\w+)/g)) vars.set(lower(m[2]), m[1]);
    for (const m of code.matchAll(/\bMap\s*<\s*\w+\s*,\s*(\w+)\s*>\s+(\w+)/g)) vars.set(lower(m[2]), m[1]);
    for (const m of code.matchAll(/\b(\w+)\s*\[\s*\]\s+(\w+)/g)) vars.set(lower(m[2]), m[1]);
    for (const m of code.matchAll(/\b([A-Za-z]\w*)\s+(\w+)\s*(?==|;|:|,|\))/g)) {
      if (/^(return|new|else|throw|case|when|insert|update|upsert|delete|undelete|merge)$/i.test(m[1])) continue;
      if (objects.has(lower(m[1])) || classes.has(lower(m[1]))) vars.set(lower(m[2]), m[1]);
    }
    // the objects this source queries: a variable of an SObject type it queries is a record, retrieved or not
    const queried = new Set();
    for (const m of code.matchAll(/\[\s*SELECT\b[^\]]*?\bFROM\s+(\w+)/gi)) queried.add(lower(m[1]));
    for (const s of strings) { const m = /^\s*SELECT\b[\s\S]*?\bFROM\s+(\w+)/i.exec(s); if (m) queried.add(lower(m[1])); }
    // a variable assigned from a query is typed by its FROM (List<SObject> x = [SELECT … FROM Booking__c])
    for (const m of code.matchAll(/\b(\w+)\s*=\s*\[\s*SELECT\b(?:[^\]\(]|\([^)]*\))*?\bFROM\s+(\w+)/gi)) {
      const cur = vars.get(lower(m[1]));
      if (!cur || /^S?Object$/i.test(cur)) vars.set(lower(m[1]), m[2]);
    }
    for (const m of code.matchAll(/\b(?:List|Set)\s*<\s*(\w+)\s*>\s+(\w+)\s*=\s*Database\s*\.\s*query\s*\(/gi)) if (!vars.has(lower(m[2]))) vars.set(lower(m[2]), m[1]);
    const typeOf = (expr) => {
      const n = /^new\s+(?:List\s*<\s*)?(\w+)/i.exec(expr);
      if (n) return n[1];
      const q = /^\[\s*SELECT\b[\s\S]*?\bFROM\s+(\w+)/i.exec(expr);
      if (q) return q[1];
      return vars.get(lower(expr)) || null;
    };
    const isRecordType = (type) => !!type && !classes.has(lower(type)) && (objects.has(lower(type)) || /__(c|e|mdt|b|x)$/i.test(type) || queried.has(lower(type)) || STANDARD_SOBJECTS.has(type));
    // asynchronous starts first, so that the same class is not also listed as a plain call
    const asyncTargets = new Map();
    const asyncCall = (re, mode) => {
      for (const m of code.matchAll(re)) {
        const target = classId(typeOf(m[1].trim()) || '');
        if (target) asyncTargets.set(target, mode);
      }
    };
    asyncCall(/Database\s*\.\s*executeBatch\s*\(\s*(new\s+\w+|\w+)/gi, 'batch');
    asyncCall(/System\s*\.\s*enqueueJob\s*\(\s*(new\s+\w+|\w+)/gi, 'queueable');
    asyncCall(/System\s*\.\s*schedule(?:Batch)?\s*\([^;]*?,\s*(new\s+\w+|\w+)\s*(?:\(|,|\))/gi, 'schedule');
    for (const [target, mode] of asyncTargets) addEdge(id, target, call, { async: mode });

    for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*\.\s*([A-Za-z_]\w*)\s*\(/g)) {
      const target = classId(m[1]);
      if (!target || lower(m[1]) === lower(self)) continue;
      const isFuture = futures.get(lower(m[1]))?.has(lower(m[2]));
      addEdge(id, target, call, { methods: [m[2]], ...(isFuture ? { async: 'future' } : {}) });
    }
    for (const m of code.matchAll(/\bnew\s+([A-Za-z_]\w*)\s*\(/g)) {
      const target = classId(m[1]);
      if (!target || lower(m[1]) === lower(self) || asyncTargets.has(target)) continue;
      addEdge(id, target, call, { via: 'new' });
    }
    if (!trigger) {
      const decl = /\bclass\s+\w+\s*(?:extends\s+([\w.]+))?\s*(?:implements\s+([^{]+))?\{/i.exec(code);
      if (decl) for (const t of [decl[1], ...(decl[2] || '').split(',')].filter(Boolean)) { const target = classId(t.trim().replace(/<.*$/, '')); if (target) addEdge(id, target, 'extends'); }
    }
    // callouts through named credentials
    for (const s of strings) {
      const nc = /^callout:([A-Za-z0-9_]+)/.exec(s);
      if (nc) addEdge(id, ncs.has(lower(nc[1])) ? addNode('namedCredential', ncs.get(lower(nc[1])).name) : addNode('namedCredential', nc[1], { retrieved: false }), 'calls', { via: 'callout' });
    }
    // SOQL, static and dynamic
    const soql = (q, via) => {
      const subs = [];
      let outer = q;
      while (/\(\s*SELECT\b[^()]*\)/i.test(outer)) outer = outer.replace(/\(\s*SELECT\b[^()]*\)/gi, (s) => { subs.push(s); return ' '; });
      const from = /\bFROM\s+(\w+)/i.exec(outer);
      if (!from) return;
      addEdge(id, objectId(from[1]), 'reads', { via });
      for (const o of relationshipReads(from[1], outer)) addEdge(id, objectId(o), 'reads', { via: 'soql-relationship' });
      // child subqueries: (SELECT … FROM Children__r) reads the child object, and its own parent paths
      for (const s of subs) {
        const child = /\bFROM\s+(\w+)/i.exec(s);
        const obj = child && childObject(from[1], child[1]);
        if (!obj) continue;
        addEdge(id, objectId(obj), 'reads', { via: 'soql-relationship' });
        for (const o of relationshipReads(obj, s.replace(/\bFROM\s+\w+/i, ' '))) addEdge(id, objectId(o), 'reads', { via: 'soql-relationship' });
      }
    };
    for (const m of code.matchAll(/\[\s*SELECT\b[^\]]*\]/gi)) soql(m[0], 'soql');
    for (const s of strings) if (/^\s*SELECT\b/i.test(s)) soql(s, 'dynamic-soql');
    // custom metadata and custom settings read through their methods
    for (const m of code.matchAll(/\b(\w+__(?:mdt|c))\s*\.\s*(getAll|getInstance|getOrgDefaults|getValues)\s*\(/gi)) addEdge(id, objectId(m[1]), 'reads', { via: m[2] });
    // DML and events
    const dml = (op, expr) => {
      const type = typeOf(expr.trim());
      const target = isRecordType(type) ? objectId(type) : null;
      if (!target) return;
      if (/^platformEvent:/.test(target)) addEdge(id, target, 'publishes', { via: op });
      else addEdge(id, target, 'writes', { ops: [lower(op)] });
    };
    // the operand: new X(…), a variable (or a field of this: this.x, a map's values()), or an inline query
    const OPERAND = String.raw`(new\s+(?:List\s*<\s*)?\w+|\[\s*SELECT\b[^\]]*\]|(?:this\s*\.\s*)?\w+)`;
    for (const m of code.matchAll(new RegExp(String.raw`(?<![.\w])(insert|update|upsert|delete|undelete|merge)\s+(?:as\s+(?:user|system)\s+)?${OPERAND}`, 'gi'))) dml(m[1], m[2].replace(/^this\s*\.\s*/i, ''));
    for (const m of code.matchAll(new RegExp(String.raw`\bDatabase\s*\.\s*(insert|update|upsert|delete|undelete|merge)(?:Immediate|Async)?\s*\(\s*${OPERAND}`, 'gi'))) dml(m[1], m[2].replace(/^this\s*\.\s*/i, ''));
    for (const m of code.matchAll(/\bEventBus\s*\.\s*publish\s*\(\s*(new\s+(?:List\s*<\s*)?\w+|\w+)/gi)) {
      const type = typeOf(m[1].trim());
      const target = type ? objectId(type) : null;
      if (target) addEdge(id, target, 'publishes', { via: 'EventBus.publish' });
    }
    // queues named in the code (owner assignment, membership checks)
    for (const s of strings) if (queueNames.has(s)) addEdge(id, addNode('queue', s), 'references');
  }

  // --- Flows
  for (const f of files(roots, 'flows', '.flow-meta.xml')) {
    const fl = flows.get(lower(path.basename(f, '.flow-meta.xml')));
    if (!fl) continue;
    const raw = safeRead(f);
    const x = readXml(f);
    const start = x.start || {};
    const id = addNode('flow', fl.name, { file: rel(f), hash: sha(raw), label: fl.label || undefined, processType: fl.processType, triggerType: fl.triggerType || undefined, active: fl.active, schedule: str(start.schedule?.frequency) || undefined });
    const startObj = str(start.object);
    if (startObj) {
      const target = objectId(startObj);
      if (fl.triggerType === 'PlatformEvent') addEdge(id, target, 'subscribes');
      else if (/^Record/.test(fl.triggerType || '')) addEdge(id, target, 'triggers-on', { events: [[fl.triggerType, fl.recordTriggerType].filter(Boolean).join(' ')] });
      else if (fl.triggerType === 'Scheduled') addEdge(id, target, 'reads', { via: 'scheduled-start' });
    }
    for (const a of arr(x.actionCalls)) {
      const type = str(a.actionType), name = str(a.actionName);
      if (type === 'apex' && name) { const target = classId(name.split('.')[0]); if (target) addEdge(id, target, 'calls', { via: 'invocable' }); }
      if (type === 'flow' && name) { const t = flows.get(lower(name)); if (t) addEdge(id, `flow:${t.name}`, 'calls', { via: 'subflow' }); }
    }
    for (const s of arr(x.subflows)) { const t = flows.get(lower(str(s.flowName) || '')); if (t) addEdge(id, addNode('flow', t.name), 'calls', { via: 'subflow' }); }
    const recordEls = [['recordLookups', 'reads', null], ['recordCreates', 'writes', 'create'], ['recordUpdates', 'writes', 'update'], ['recordDeletes', 'writes', 'delete']];
    for (const [tag, kind, op] of recordEls) {
      for (const el of arr(x[tag])) {
        let obj = str(el.object);
        if (!obj && /^\$Record\b/.test(str(el.inputReference) || '') && startObj) obj = startObj;
        const target = objectId(obj);
        if (!target) continue;
        if (kind === 'writes' && /^platformEvent:/.test(target)) addEdge(id, target, 'publishes', { via: tag });
        else addEdge(id, target, kind, op ? { ops: [op] } : { via: 'record-lookup' });
      }
    }
    // a before-save flow changes its triggering record by assignment ($Record.Field), without a record element
    if (startObj && fl.triggerType === 'RecordBeforeSave') {
      const assigned = arr(x.assignments).flatMap((a) => arr(a.assignmentItems)).some((it) => /^\$Record\./.test(str(it.assignToReference) || ''));
      if (assigned) addEdge(id, objectId(startObj), 'writes', { ops: ['update'], via: 'before-save' });
    }
    for (const m of raw.matchAll(/<extensionName>c:([A-Za-z0-9_]+)<\/extensionName>/g)) {
      const l = lwcs.get(lower(m[1])) || auras.get(lower(m[1]));
      if (l) addEdge(id, addNode(lwcs.has(lower(m[1])) ? 'lwc' : 'aura', l.name), 'calls', { via: 'screen' });
    }
    for (const m of raw.matchAll(/<stringValue>([A-Za-z0-9_]+)<\/stringValue>/g)) if (queueNames.has(m[1])) addEdge(id, addNode('queue', m[1]), 'references');
  }

  // --- LWC, Aura, Visualforce, pages, quick actions
  for (const b of bundles(roots, 'lwc')) {
    const l = lwcs.get(lower(b.name));
    if (!l) continue;
    const js = files([b.dir], '.', '.js').map(safeRead).join('\n');
    const html = files([b.dir], '.', '.html').map(safeRead).join('\n');
    const id = addNode('lwc', l.name, { file: rel(b.dir), hash: sha(js + html), exposed: l.exposed, targets: l.targets });
    for (const m of js.matchAll(/import\s+(\w+)\s+from\s+['"]@salesforce\/apex\/(\w+)\.(\w+)['"]/g)) {
      const target = classId(m[2]);
      if (!target) continue;
      const wired = new RegExp(`@wire\\s*\\(\\s*${m[1]}\\b`).test(js);
      addEdge(id, target, 'calls', { methods: [m[3]], modes: [wired ? 'wire' : 'imperative'] });
    }
    for (const child of l.children || []) {
      if (lwcs.has(lower(child))) addEdge(id, addNode('lwc', lwcs.get(lower(child)).name), 'calls', { via: 'child' });
    }
    for (const m of js.matchAll(/@salesforce\/schema\/(\w+)/g)) { const t = objectId(m[1], { create: false }); if (t) addEdge(id, t, 'reads', { via: 'lds' }); }
    for (const m of js.matchAll(/import\s+(\w+)\s+from\s+['"]@salesforce\/messageChannel\/(\w+?)(?:__c)?['"]/g)) {
      const ch = channels.get(lower(m[2])) || channels.get(lower(m[2] + '__c'));
      if (!ch) continue;
      const target = addNode('messageChannel', ch.name);
      if (new RegExp(`\\bpublish\\s*\\([^)]*\\b${m[1]}\\b`).test(js)) addEdge(id, target, 'publishes', { via: 'lms' });
      if (new RegExp(`\\bsubscribe\\s*\\([^)]*\\b${m[1]}\\b`).test(js)) addEdge(id, target, 'subscribes', { via: 'lms' });
    }
  }
  for (const b of bundles(roots, 'aura')) {
    const a = auras.get(lower(b.name));
    if (!a) continue;
    const markup = files([b.dir], '.', '').map(safeRead).join('\n');
    const id = addNode('aura', a.name, { file: rel(b.dir), hash: sha(markup), type: a.type });
    if (a.controller) { const t = classId(a.controller.split('.').pop()); if (t) addEdge(id, t, 'calls', { via: 'controller' }); }
    for (const child of a.children || []) {
      if (lwcs.has(lower(child))) addEdge(id, addNode('lwc', lwcs.get(lower(child)).name), 'calls', { via: 'child' });
      else if (auras.has(lower(child))) addEdge(id, addNode('aura', auras.get(lower(child)).name), 'calls', { via: 'child' });
    }
  }
  for (const f of files(roots, 'pages', '.page')) {
    const p = vfs.get(lower(path.basename(f, '.page')));
    if (!p) continue;
    const id = addNode('vf', p.name, { file: rel(f), hash: sha(safeRead(f)) });
    for (const c of [p.controller, ...(p.extensions || [])].filter(Boolean)) { const t = classId(c); if (t) addEdge(id, t, 'calls', { via: 'controller' }); }
  }
  for (const p of flexipages.values()) {
    const placed = (p.customComponents || []).filter((c) => lwcs.has(lower(c)) || auras.has(lower(c)));
    if (!placed.length) continue;
    const id = addNode('flexipage', p.name, { type: p.type || undefined, object: p.object || undefined });
    for (const c of placed) addEdge(id, addNode(lwcs.has(lower(c)) ? 'lwc' : 'aura', (lwcs.get(lower(c)) || auras.get(lower(c))).name), 'places');
  }
  for (const t of facts.ui?.tabs || []) {
    const target = (t.lwc && lwcs.get(lower(t.lwc)) && `lwc:${lwcs.get(lower(t.lwc)).name}`) || (t.aura && auras.get(lower(t.aura)) && `aura:${auras.get(lower(t.aura)).name}`);
    if (target) addEdge(addNode('tab', t.name, { label: t.label || undefined }), target, 'places');
  }
  for (const q of quickActions.values()) {
    const targets = [[q.lwc, 'lwc', lwcs], [q.aura, 'aura', auras], [q.flow, 'flow', flows]].filter(([n, , m]) => n && m.has(lower(n)));
    if (!targets.length) continue;
    const id = addNode('quickAction', q.name, { object: q.object || q.name.split('.')[0] });
    for (const [n, kind, m] of targets) addEdge(id, addNode(kind, m.get(lower(n)).name), 'places');
  }

  // --- OmniStudio
  const ipByKey = new Map();
  for (const ip of ips.values()) { if (ip.type && ip.subType) { ipByKey.set(lower(`${ip.type}_${ip.subType}`), ip); ipByKey.set(lower(`${ip.type}/${ip.subType}`), ip); } }
  const mapperByBundle = new Map();
  for (const d of mappers.values()) { mapperByBundle.set(lower(d.name), d); if (d.label) mapperByBundle.set(lower(d.label), d); mapperByBundle.set(lower(d.name.replace(/_\d+$/, '')), d); }
  const omniRefs = (id, text) => {
    for (const m of text.matchAll(/"integrationProcedureKey"\s*:\s*"([^"]+)"/g)) { const t = ipByKey.get(lower(m[1])); if (t && `ip:${t.name}` !== id) addEdge(id, addNode('ip', t.name), 'calls', { via: 'ip-action' }); }
    for (const m of text.matchAll(/"bundle"\s*:\s*"([^"]+)"/g)) { const t = mapperByBundle.get(lower(m[1])); if (t) addEdge(id, addNode('datamapper', t.name), 'calls', { via: 'data-mapper' }); }
    for (const m of text.matchAll(/"remoteClass"\s*:\s*"([^"]+)"/g)) { const t = classId(m[1]); if (t) addEdge(id, t, 'calls', { via: 'remote-action' }); }
    for (const m of text.matchAll(/"lwcName"\s*:\s*"([^"]+)"/g)) { const l = lwcs.get(lower(m[1])); if (l) addEdge(id, addNode('lwc', l.name), 'calls', { via: 'custom-lwc' }); }
    const ncNames = [...text.matchAll(/"namedCredential"\s*:\s*"([^"]+)"/g), ...text.matchAll(/callout:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    for (const n of ncNames) { const t = ncs.get(lower(n)); if (t) addEdge(id, addNode('namedCredential', t.name), 'calls', { via: 'http-action' }); }
  };
  for (const [folder, suffix, kind, index] of [['omniScripts', '.os-meta.xml', 'omniscript', scripts], ['omniIntegrationProcedures', '.oip-meta.xml', 'ip', ips]]) {
    for (const f of files(roots, folder, suffix)) {
      const item = index.get(lower(path.basename(f, suffix)));
      if (!item) continue;
      const raw = safeRead(f);
      const id = addNode(kind, item.name, { file: rel(f), hash: sha(raw), active: item.active, type: item.type || undefined, subType: item.subType || undefined });
      omniRefs(id, decode(raw));
    }
  }
  for (const f of files(roots, 'omniDataTransforms', '.rpt-meta.xml')) {
    const d = mappers.get(lower(path.basename(f, '.rpt-meta.xml')));
    if (!d) continue;
    const raw = safeRead(f);
    const id = addNode('datamapper', d.name, { file: rel(f), hash: sha(raw), active: d.active, type: d.type || undefined });
    const load = /load/i.test(d.type || '');
    for (const m of raw.matchAll(/<inputObjectName>([A-Za-z0-9_]+)<\/inputObjectName>/g)) if (!load) addEdge(id, objectId(m[1]), 'reads', { via: 'data-mapper' });
    for (const m of raw.matchAll(/<outputObjectName>([A-Za-z0-9_]+)<\/outputObjectName>/g)) if (load) addEdge(id, objectId(m[1]), 'writes', { ops: ['upsert'] });
  }

  // --- Named credentials, queues, objects: the nodes code points at
  for (const n of ncs.values()) addNode('namedCredential', n.name, { host: n.host || undefined, externalCredential: n.externalCredential || undefined });
  for (const q of queues.values()) {
    const id = addNode('queue', q.name, { label: q.label || undefined });
    for (const o of q.objects || []) addEdge(id, objectId(o), 'serves');
  }
  for (const o of facts.data?.objects || []) if (!o.namespace || nodes.has(`${objKind(o)}:${o.name}`)) objectId(o.name);

  const edgeList = [...edges.values()].filter((e) => nodes.has(e.from) && nodes.has(e.to)).sort((a, b) => (a.from + a.kind + a.to).localeCompare(b.from + b.kind + b.to));
  // invocable actions no flow of the snapshot calls: flagged, so that dead code can be found (an agent, a
  // Process Builder outside the snapshot or a REST call may still use them: the edge is absent, not proven dead)
  const invoked = new Set(edgeList.filter((e) => e.kind === 'calls' && e.via === 'invocable').map((e) => e.to));
  for (const n of nodes.values()) if (n.kind === 'apex' && (n.kinds || []).includes('invocable') && !invoked.has(n.id)) n.invocableUncalled = true;
  const nodeList = [...nodes.values()].map(clean).sort((a, b) => a.id.localeCompare(b.id));
  return { version: GRAPH_VERSION, nodes: nodeList, edges: edgeList, stats: stats(nodeList, edgeList) };
}

function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)));
}

function stats(nodes, edges) {
  const byKind = (list, key) => list.reduce((m, x) => ({ ...m, [x[key]]: (m[x[key]] || 0) + 1 }), {});
  return { nodes: nodes.length, edges: edges.length, nodeKinds: byKind(nodes, 'kind'), edgeKinds: byKind(edges, 'kind') };
}

/** Name → node, and the out / in edges of each node. */
export function indexGraph(graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const byName = new Map();
  for (const n of graph.nodes) if (!byName.has(n.name)) byName.set(n.name, n);
  const out = new Map(), inc = new Map();
  for (const e of graph.edges) {
    (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    (inc.get(e.to) || inc.set(e.to, []).get(e.to)).push(e);
  }
  return { byId, byName, out: (id) => out.get(id) || [], in: (id) => inc.get(id) || [] };
}
