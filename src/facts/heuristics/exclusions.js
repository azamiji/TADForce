// Exclusions are decided by humans (knowledge/exclusions.yml). Heuristics only propose candidates.

/** Every component collection of facts.json, addressable by a short type name. */
export const COLLECTIONS = [
  ['apex', (f) => f.apex.classes],
  ['trigger', (f) => f.apex.triggers],
  ['lwc', (f) => f.ui.lwc],
  ['aura', (f) => f.ui.aura],
  ['vfPage', (f) => f.ui.vfPages],
  ['flexipage', (f) => f.ui.flexipages],
  ['app', (f) => f.ui.apps],
  ['tab', (f) => f.ui.tabs],
  ['quickAction', (f) => f.ui.quickActions],
  ['flow', (f) => f.automation.flows],
  ['omniScript', (f) => f.automation.omnistudio.omniScripts],
  ['integrationProcedure', (f) => f.automation.omnistudio.integrationProcedures],
  ['dataMapper', (f) => f.automation.omnistudio.dataMappers],
  ['flexCard', (f) => f.automation.omnistudio.flexCards],
  ['object', (f) => f.data.objects],
  ['cmdt', (f) => f.data.cmdtTypes, 'type'],
  ['profile', (f) => f.security.profiles],
  ['permissionSet', (f) => f.security.permissionSets],
  ['permissionSetGroup', (f) => f.security.permissionSetGroups],
  ['role', (f) => f.security.roles],
  ['queue', (f) => f.security.queues],
  ['namedCredential', (f) => f.integration.namedCredentials],
  ['externalCredential', (f) => f.integration.externalCredentials],
  ['remoteSite', (f) => f.integration.remoteSites],
  ['cspTrustedSite', (f) => f.integration.cspTrustedSites],
  ['connectedApp', (f) => f.integration.connectedApps],
  ['authProvider', (f) => f.integration.authProviders],
  ['report', (f) => f.misc.reports.names, null],
  ['dashboard', (f) => f.misc.dashboards.names, null],
  ['emailTemplate', (f) => f.misc.emailTemplates, null],
  ['staticResource', (f) => f.misc.staticResources, null],
];

const keyOf = (item, field) => (field === null ? item : item[field || 'name']);

function matcher(pattern) {
  const re = new RegExp('^' + String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
  return (s) => re.test(String(s));
}

/** Remove excluded components from facts (in place). Returns the list of applied exclusions. */
export function applyExclusions(facts, knowledge = {}) {
  const rules = [...(knowledge.exclude || [])];
  for (const feat of knowledge.features || []) {
    for (const c of feat.components || []) rules.push({ name: typeof c === 'string' ? c : c.name, type: c.type, reason: `${feat.name}${feat.note ? ' — ' + feat.note : ''}`, feature: feat.name });
  }
  const applied = [];
  for (const rule of rules) {
    if (!rule || !rule.name) continue;
    const match = matcher(rule.name);
    for (const [type, get, field] of COLLECTIONS) {
      if (rule.type && rule.type !== 'any' && rule.type !== type) continue;
      const list = get(facts);
      if (!Array.isArray(list)) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        const k = keyOf(list[i], field);
        if (match(k)) {
          applied.push({ type, name: k, reason: rule.reason || null, feature: rule.feature || null });
          list.splice(i, 1);
        }
      }
    }
  }
  // the tests of an excluded class leave with it (LegacyRateHelper → LegacyRateHelperTest, …_Test, …Tests)
  const gone = new Set(applied.filter((a) => a.type === 'apex').map((a) => String(a.name).toLowerCase()));
  const classes = facts.apex.classes;
  for (let i = classes.length - 1; i >= 0; i--) {
    const base = String(classes[i].name).toLowerCase().replace(/_?tests?$/, '');
    if (classes[i].test && base !== String(classes[i].name).toLowerCase() && gone.has(base)) {
      applied.push({ type: 'apex', name: classes[i].name, reason: `test of an excluded class`, feature: null });
      classes.splice(i, 1);
    }
  }
  return applied.sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));
}

// Org-wide components (profiles, roles, queues, report folders…) are shared by every project: never scoped out.
const SCOPED_TYPES = new Set(['apex', 'trigger', 'lwc', 'aura', 'vfPage', 'flexipage', 'app', 'tab', 'quickAction', 'flow', 'omniScript', 'integrationProcedure', 'dataMapper', 'flexCard', 'object', 'cmdt', 'permissionSet', 'permissionSetGroup', 'namedCredential', 'externalCredential', 'remoteSite', 'cspTrustedSite', 'connectedApp', 'authProvider', 'staticResource']);

/**
 * Keep only the part of the org a project owns (tadforce.config.json › scope.include, name patterns with `*`).
 * Standard objects stay: a project extends them, it does not own them. Returns the components set aside.
 */
export function applyScope(facts, scope = {}) {
  const include = (scope.include || []).filter(Boolean).map(matcher);
  if (!include.length) return [];
  const out = [];
  for (const [type, get, field] of COLLECTIONS) {
    if (!SCOPED_TYPES.has(type)) continue;
    const list = get(facts);
    if (!Array.isArray(list)) continue;
    for (let i = list.length - 1; i >= 0; i--) {
      const k = keyOf(list[i], field);
      if (type === 'object' && !String(k).includes('__')) continue;
      if (type === 'apex' && list[i].test && include.some((m) => m(String(k).replace(/_?Tests?$/i, '')))) continue;
      if (!include.some((m) => m(k))) { out.push({ type, name: k }); list.splice(i, 1); }
    }
  }
  return out.sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));
}

const SUSPICIOUS = new Set(['test', 'tests', 'poc', 'demo', 'demos', 'sample', 'samples', 'dryrun', 'repro', 'tmp', 'temp', 'old', 'deprecated', 'obsolete', 'backup', 'bkp', 'copy', 'draft', 'example', 'examples', 'playground', 'todelete', 'unused', 'legacy', 'dummy', 'fake', 'mock']);
// Words of demo and test leftovers (the recommended answer is « exclude »); the other suspicious words are left to the human.
const DEMO_WORDS = new Set(['test', 'tests', 'poc', 'demo', 'demos', 'sample', 'samples', 'dryrun', 'repro', 'example', 'examples', 'playground', 'todelete', 'dummy', 'fake', 'mock']);
// Tutorial and sample-app names (Trailhead, sample galleries, first steps).
const DEMO_NAME = /^(hello_?world|shopping_?list|todo_?list|my_?first|trailhead|dreamhouse|ebikes?|lwc_?recipes?|apex_?recipes?)|^(Store|Item|Test|Todo|Shopping_List|Property|Broker)__c$/i;
// In-house DevOps tooling stored in the org (pipelines, user stories, pull requests…): not the business solution.
const DEVOPS_OBJECT = /^(Pipeline|Pipeline_?Stage|Pull_?Request|User_?Story|User_?Story_\w+|Sprint|Epic|Deployment|Deployment_?Step|Promotion|Git_?Commit|Git_?Repository|Git_?Branch|Release_?Note|Work_?Item|Build_?Run|Test_?Run|Environment_?Variable|DevOps\w*)__c$/i;

/**
 * Open-source libraries deployed without a namespace (unlocked or unmanaged): known by a signature
 * (components that only the library has) and by the names of its components. `alias` matches the
 * package names installed in the org or declared in sfdx-project.json › packageAliases.
 */
export const LIBRARIES = [
  { id: 'nebula-logger', name: 'Nebula Logger', alias: /nebula|logger/i,
    signature: (has) => (has('object', 'Log__c') && has('object', 'LogEntry__c')) || has('object', 'LoggerSettings__c'),
    match: /^(Log__c|LogEntry__c|LogEntryTag__c|LoggerTag__c|LoggerScenario__c|LoggerSettings__c|LogEntryEvent__e|Logger\w*__mdt|LogStatus__mdt|LogEntryDataMaskRule__mdt|Logger\w*|LogEntry\w*|LogBatchPurge\w*|LogHandler|LogManagementDataSelector|LogMassDeleteExtension|LogRecordPage|logViewer|logEntry\w*|logger\w*|relatedLogEntries\w*|RelatedLogEntries\w*)$/ },
  { id: 'fflib', name: 'Apex Enterprise Patterns / Apex Mocks (fflib)', alias: /fflib|apex-?common|apex-?mocks/i, signature: (has, any) => any(/^fflib_/i), match: /^fflib_/i },
  { id: 'rflib', name: 'RFLIB', alias: /rflib/i, signature: (has, any) => any(/^rflib_?/i), match: /^rflib_?/i },
  { id: 'dlrs', name: 'Declarative Lookup Rollup Summaries (unmanaged)', alias: /dlrs|rollup/i, signature: (has, any) => any(/^dlrs_/i), match: /^dlrs_/i },
  { id: 'trigger-actions', name: 'Trigger Actions Framework', alias: /trigger.?actions/i,
    signature: (has) => has('object', 'Trigger_Action__mdt') || has('object', 'sObject_Trigger_Setting__mdt'),
    match: /^(Trigger_Action__mdt|sObject_Trigger_Setting__mdt|TriggerBase|TriggerAction\w*|MetadataTriggerHandler|FinalizerHandler|TriggerActionFlow\w*|TriggerTestUtility|FormulaFilter)$/ },
  { id: 'trigger-handler', name: 'sfdc-trigger-framework (TriggerHandler)', alias: /trigger.?(framework|handler)/i, signature: (has) => has('apex', 'TriggerHandler'), match: /^TriggerHandler$/ },
];

const LANGS = 'English|French|Spanish|German|Italian|Portuguese|Dutch|Japanese|Arabic|Chinese|Korean|Russian|Turkish|Polish|Swedish|Danish|Norwegian|Finnish|Hebrew|MultiLanguage|Multi_Language';
const OMNI_LWC = new RegExp(`^(cf[A-Z0-9]\\w*|[a-z]\\w{3,}(${LANGS})|\\w+_\\d+_[A-Za-z]\\w*)$`);
const clean = (s) => String(s || '').replace(/[^A-Za-z0-9]/g, '');

/** LWC compiled by OmniStudio from OmniScripts and FlexCards: generated code, not components the project wrote. */
export function omniGenerated(facts) {
  const o = facts.automation.omnistudio;
  const names = new Set();
  for (const s of o.omniScripts) { const t = clean(s.type); names.add(t.charAt(0).toLowerCase() + t.slice(1) + clean(s.subType) + clean(s.language)); }
  for (const c of o.flexCards) names.add('cf' + clean(c.name));
  return new Set(facts.ui.lwc.filter((l) => l.runtimeNamespace || names.has(l.name) || OMNI_LWC.test(l.name)).map((l) => l.name));
}

/**
 * Standard objects the project uses: extended (custom fields, record types, rules), placed on a page, a
 * trigger or flow on them, a queue, a lookup from a custom field, read in code, LWC, flows or OmniStudio.
 */
export function usedStandardObjects(facts, usageTokens = new Set()) {
  const used = new Set();
  const std = new Set(facts.data.objects.filter((o) => o.kind === 'standard').map((o) => o.name));
  const add = (n) => { if (std.has(n)) used.add(n); };
  for (const o of facts.data.objects) {
    if (o.kind === 'standard' && (o.customFields > 0 || o.recordTypes.length || o.validationRules.length)) used.add(o.name);
    for (const r of o.relations) if (String(r.field).endsWith('__c')) r.to.forEach(add);
  }
  for (const p of facts.ui.flexipages) add(p.object);
  for (const t of facts.apex.triggers) add(t.object);
  for (const fl of facts.automation.flows) add(fl.object);
  for (const q of facts.security.queues) q.objects.forEach(add);
  for (const l of facts.ui.lwc) (l.objects || []).forEach(add);
  for (const a of facts.ui.apps) for (const t of a.tabs) add(String(t).replace(/^standard-/, ''));
  for (const n of std) if (usageTokens.has(n)) used.add(n);
  return used;
}

/**
 * Components that are not the project's own solution, proposed with a recommended « exclude »: libraries
 * deployed without namespace, OmniStudio-generated LWC, DevOps tooling objects, demo and test leftovers,
 * standard objects the project does not use. hints: { packages: installed package names without namespace,
 * aliases: sfdx-project.json packageAliases }.
 */
export function scopeCandidates(facts, refs = {}, hints = {}) {
  const out = [];
  const add = (type, name, reason, category) => out.push({ type, name, reason, category });
  const names = [];
  for (const [type, get, field] of COLLECTIONS) for (const item of get(facts) || []) names.push({ type, name: String(keyOf(item, field)), test: type === 'apex' && item.test });
  const has = (type, n) => names.some((x) => (type === 'object' || type === 'apex' ? x.type === type : true) && x.name === n);
  const any = (re) => names.some((x) => re.test(x.name));
  const declared = [...(hints.packages || []), ...(hints.aliases || [])].map(String);
  for (const lib of LIBRARIES) {
    const named = declared.find((p) => lib.alias.test(p));
    if (!lib.signature(has, any) && !named) continue;
    for (const x of names) if (!x.test && lib.match.test(x.name)) add(x.type, x.name, `component of ${lib.name}${named ? ` (package « ${named} »)` : ''}, deployed without namespace`, 'library');
  }
  for (const n of omniGenerated(facts)) add('lwc', n, 'LWC generated by OmniStudio from an OmniScript or a FlexCard', 'omnistudio-generated');
  const devops = new Set();
  for (const o of facts.data.objects) if (o.kind === 'custom' && !o.namespace && DEVOPS_OBJECT.test(o.name)) { devops.add(o.name); add('object', o.name, 'DevOps tooling stored in the org (pipelines, user stories, pull requests…)', 'devops'); }
  for (const t of facts.apex.triggers) if (devops.has(t.object)) add('trigger', t.name, 'DevOps tooling stored in the org (pipelines, user stories, pull requests…)', 'devops');
  for (const x of names) {
    if (x.test || (x.type === 'object' && !x.name.includes('__'))) continue;
    if (DEMO_NAME.test(x.name) || nameWords(x.name).some((w) => DEMO_WORDS.has(w)) || /helloworld/i.test(x.name)) add(x.type, x.name, 'demo, sample or test leftover (by its name)', 'demo');
  }
  const used = refs.usedStandard || usedStandardObjects(facts, refs.usageTokens);
  for (const o of facts.data.objects) if (o.kind === 'standard' && !o.namespace && !used.has(o.name)) add('object', o.name, 'standard object the project does not use (no custom field, record type, rule, page, automation, code or relationship)', 'standard-unused');
  return out;
}

/** The recommended answer per candidate category: what is surely not the project's own work is excluded. */
export const RECOMMENDED = { library: 'exclude', 'omnistudio-generated': 'exclude', devops: 'exclude', demo: 'exclude', 'standard-unused': 'exclude' };

export function nameWords(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .split(/[^A-Za-z]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/**
 * Propose exclusion candidates (never applied automatically): suspicious names, components
 * placed nowhere, inactive automation, Apex referenced only by tests.
 */
export function exclusionCandidates(facts, refs, hints = {}) {
  // what is surely not the project's own work comes first: its reason names the group of the question
  const out = scopeCandidates(facts, refs, hints);
  const add = (type, name, reason) => out.push({ type, name, reason });
  for (const [type, get, field] of COLLECTIONS) {
    const list = get(facts) || [];
    for (const item of list) {
      const name = keyOf(item, field);
      if (type === 'apex' && item.test) continue;
      if (type === 'object' && !String(name).includes('__')) continue; // standard objects (AiEval…TestCase, Devops…Test) are Salesforce's
      const bad = nameWords(name).filter((w) => SUSPICIOUS.has(w));
      if (bad.length) add(type, name, `name suggests ${bad.join('/')}`);
    }
  }
  for (const l of facts.ui.lwc) if (!refs.placements[l.name]) add('lwc', l.name, 'not placed on any page, app, tab, action, flow or OmniStudio component in the snapshot');
  for (const a of facts.ui.aura) if (a.type === 'component' && !refs.placements[a.name]) add('aura', a.name, 'not referenced by any page, app, tab, action or component in the snapshot');
  for (const fl of facts.automation.flows) if (!fl.active) add('flow', fl.name, `flow status is ${fl.status}`);
  for (const k of ['omniScripts', 'integrationProcedures', 'dataMappers', 'flexCards']) {
    for (const o of facts.automation.omnistudio[k]) if (!o.active) add(k.replace(/s$/, ''), o.name, 'inactive version');
  }
  const ENTRY = new Set(['rest', 'soap', 'schedulable', 'invocable', 'registrationHandler', 'emailHandler', 'global']);
  for (const c of facts.apex.classes) {
    if (c.test || c.kinds.some((k) => ENTRY.has(k))) continue;
    if (!refs.apexReferenced.has(c.name)) add('apex', c.name, refs.apexReferencedByTests.has(c.name) ? 'referenced only by test classes' : 'not referenced by any other component in the snapshot');
  }
  for (const p of facts.ui.flexipages) {
    if (!refs.flexipageAssigned.has(p.name)) add('flexipage', p.name, 'not assigned to any app, object override or tab in the snapshot');
  }
  // merge duplicates (one entry per component, reasons joined)
  const merged = {};
  for (const c of out) {
    const k = c.type + ':' + c.name;
    if (merged[k]) { if (!merged[k].reasons.includes(c.reason)) merged[k].reasons.push(c.reason); } else merged[k] = { type: c.type, name: c.name, reasons: [c.reason], ...(c.category ? { category: c.category } : {}) };
  }
  return Object.values(merged).sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));
}
