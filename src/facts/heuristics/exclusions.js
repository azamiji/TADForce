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
  return applied.sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));
}

const SUSPICIOUS = new Set(['test', 'tests', 'poc', 'demo', 'demos', 'sample', 'samples', 'dryrun', 'repro', 'tmp', 'temp', 'old', 'deprecated', 'obsolete', 'backup', 'bkp', 'copy', 'draft', 'example', 'examples', 'playground', 'todelete', 'unused', 'legacy', 'dummy', 'fake', 'mock']);

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
export function exclusionCandidates(facts, refs) {
  const out = [];
  const add = (type, name, reason) => out.push({ type, name, reason });
  for (const [type, get, field] of COLLECTIONS) {
    const list = get(facts) || [];
    for (const item of list) {
      const name = keyOf(item, field);
      if (type === 'apex' && item.test) continue;
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
    if (merged[k]) { if (!merged[k].reasons.includes(c.reason)) merged[k].reasons.push(c.reason); } else merged[k] = { type: c.type, name: c.name, reasons: [c.reason] };
  }
  return Object.values(merged).sort((a, b) => (a.type + a.name).localeCompare(b.type + b.name));
}
