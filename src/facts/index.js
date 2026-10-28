import fs from 'node:fs';
import path from 'node:path';
import { readJson, exists, toPosix, safeReadJson } from '../util/fsx.js';
import { findMetadataRoots, files, safeRead, clearReadCache } from './xml.js';
import { extractApex, tokens } from './extractors/apex.js';
import { extractData } from './extractors/data.js';
import { extractAutomation } from './extractors/automation.js';
import { extractUi, placements } from './extractors/ui.js';
import { extractSecurity } from './extractors/security.js';
import { extractIntegration } from './extractors/integration.js';
import { extractMisc, detectNamespaces } from './extractors/misc.js';
import { applyExclusions, exclusionCandidates } from './heuristics/exclusions.js';
import { detectModules } from './heuristics/modules.js';
import { detectNaming } from './heuristics/naming.js';
import { computeSignals } from './heuristics/signals.js';

export const FACTS_SCHEMA = 1;

/**
 * Build facts.json from source-format metadata. Pure and deterministic: same input, same bytes.
 * @param {string[]} dirs   source directories (snapshot or package directories)
 * @param {object} knowledge { exclusions, glossary }
 * @param {object} [opts]   { base: path used to relativise roots, org: org facts, codeAnalyzer }
 */
export function extractFacts(dirs, knowledge = {}, opts = {}) {
  const roots = findMetadataRoots(dirs);
  const apex = extractApex(roots);
  const data = extractData(roots);
  const automation = extractAutomation(roots);
  const ui = extractUi(roots);
  const security = extractSecurity(roots);
  const integration = extractIntegration(roots);
  const misc = extractMisc(roots);
  const namespaces = detectNamespaces(roots, misc.installedPackages);

  const refs = references(roots, apex, ui, automation, integration);
  const facts = { schema: FACTS_SCHEMA, apex, data, automation, ui, security, integration, misc, namespaces };

  const applied = applyExclusions(facts, knowledge.exclusions || {});
  // placements are recomputed so that excluded containers no longer count as usages
  const placementsAfter = {};
  const live = new Set([...facts.ui.flexipages.map((p) => 'flexipage:' + p.name), ...facts.ui.lwc.map((l) => 'lwc:' + l.name), ...facts.ui.aura.map((a) => 'aura:' + a.name)]);
  for (const [comp, uses] of Object.entries(refs.placements)) {
    const kept = uses.filter((u) => !['flexipage', 'lwc', 'aura'].includes(u.kind) || live.has(u.kind + ':' + u.name));
    if (kept.length) placementsAfter[comp] = kept;
  }
  refs.placements = placementsAfter;
  for (const l of facts.ui.lwc) l.placedIn = placementsAfter[l.name] || [];
  for (const a of facts.ui.aura) a.placedIn = placementsAfter[a.name] || [];

  facts.exclusions = { applied, candidates: exclusionCandidates(facts, refs) };
  facts.modules = detectModules(facts);
  // Products used without metadata traces are declared by a human in glossary.yml › products.
  for (const p of (knowledge.glossary && knowledge.glossary.products) || []) {
    if (!p || !p.name || facts.modules.clouds.some((c) => c.name === p.name)) continue;
    facts.modules.clouds.push({ id: p.id || p.name, name: p.name, reference: p.reference || null, evidence: ['declared'] });
    if (p.id) facts.modules[p.id] = true;
    if (p.reference && !facts.modules.references.includes(p.reference)) facts.modules.references.push(p.reference);
    if (!facts.modules.products.includes(p.name)) facts.modules.products.push(p.name);
  }
  facts.naming = detectNaming(facts);
  facts.systems = externalSystems(facts, knowledge.glossary || {});
  facts.counts = counts(facts);
  facts.inventory = inventory(facts);
  facts.signals = computeSignals(facts, opts.org || null, opts.codeAnalyzer || null);
  facts.sources = roots.map((r) => (opts.base ? toPosix(path.relative(opts.base, r)) || '.' : toPosix(r)));

  // internal token sets are not serialised
  for (const c of facts.apex.classes) delete c._tokens;
  for (const t of facts.apex.triggers) delete t._tokens;
  clearReadCache();
  return facts;
}

/** Cross-references: where Apex classes, LWC/Aura and FlexiPages are used. */
function references(roots, apex, ui, automation, integration) {
  const nonTest = apex.classes.filter((c) => !c.test);
  const testTokens = new Set();
  for (const c of apex.classes.filter((c) => c.test)) for (const t of c._tokens) testTokens.add(t);
  const prodTokens = new Map(); // token -> count of producing files
  const bump = (set, self) => { for (const t of set) if (t !== self) prodTokens.set(t, (prodTokens.get(t) || 0) + 1); };
  for (const c of nonTest) bump(c._tokens, c.name);
  for (const t of apex.triggers) bump(t._tokens, null);
  const textFolders = ['flows', 'omniScripts', 'omniIntegrationProcedures', 'omniDataTransforms', 'omniUiCard', 'aura', 'lwc', 'pages', 'components', 'authproviders', 'quickActions', 'customMetadata', 'experiences', 'digitalExperiences', 'emailservices', 'objects', 'permissionsets', 'profiles', 'flexipages'];
  for (const folder of textFolders) {
    for (const f of files(roots, folder, '', { recursive: true })) {
      if (!/\.(xml|js|html|cmp|app|page|component|json|design|evt)$/.test(f)) continue;
      if (folder === 'permissionsets' || folder === 'profiles') continue; // class access grants are not usages
      bump(tokens(safeRead(f)), null);
    }
  }
  const apexReferenced = new Set(nonTest.filter((c) => prodTokens.has(c.name)).map((c) => c.name));
  for (const l of ui.lwc) for (const a of l.apex) apexReferenced.add(a);
  const apexReferencedByTests = new Set(nonTest.filter((c) => testTokens.has(c.name)).map((c) => c.name));

  const assignTokens = new Set();
  for (const folder of ['applications', 'objects', 'tabs', 'customApplications']) {
    for (const f of files(roots, folder, '', { recursive: true })) if (/\.(app-meta|object-meta|tab-meta)\.xml$/.test(f)) for (const t of tokens(safeRead(f))) assignTokens.add(t);
  }
  const flexipageAssigned = new Set(ui.flexipages.filter((p) => assignTokens.has(p.name) || p.type === 'UtilityBar' && ui.apps.some((a) => a.utilityBar === p.name)).map((p) => p.name));
  return { placements: placements(roots, ui), apexReferenced, apexReferencedByTests, flexipageAssigned };
}

/** External systems seen from Salesforce, grouped by host, and named from the glossary when possible. */
function externalSystems(f, glossary) {
  const endpoints = [];
  for (const n of f.integration.namedCredentials) endpoints.push({ kind: 'namedCredential', name: n.name, host: n.host });
  for (const r of f.integration.remoteSites) endpoints.push({ kind: 'remoteSite', name: r.name, host: r.host });
  for (const c of f.integration.cspTrustedSites) endpoints.push({ kind: 'cspTrustedSite', name: c.name, host: c.host });
  for (const a of f.integration.authProviders) endpoints.push({ kind: 'authProvider', name: a.name, host: null });
  for (const a of f.integration.connectedApps) endpoints.push({ kind: 'connectedApp', name: a.name, host: null });
  for (const c of f.integration.callCenters) endpoints.push({ kind: 'callCenter', name: c.name, host: c.adapterHost });
  const systems = (glossary.systems || []).map((s) => ({ id: s.id || s.name, name: s.name, description: s.description || null, match: (s.match || []).map(String), endpoints: [] }));
  const unnamed = [];
  for (const e of endpoints) {
    const sys = systems.find((s) => s.match.some((m) => m.toLowerCase() === String(e.name).toLowerCase() || (e.host && (e.host === m.toLowerCase() || e.host.endsWith('.' + m.toLowerCase())))));
    if (sys) sys.endpoints.push(e); else unnamed.push(e);
  }
  for (const s of systems) { s.endpoints.sort((a, b) => (a.kind + a.name).localeCompare(b.kind + b.name)); delete s.match; }
  return { named: systems, unnamed: unnamed.sort((a, b) => (a.kind + a.name).localeCompare(b.kind + b.name)) };
}

function counts(f) {
  const app = f.apex.classes.filter((c) => !c.test);
  const kind = (k) => app.filter((c) => c.kinds.includes(k)).length;
  const local = f.data.objects.filter((o) => !o.namespace);
  const o = f.automation.omnistudio;
  return {
    apex: { classes: app.length, tests: f.apex.classes.filter((c) => c.test).length, triggers: f.apex.triggers.length, batch: kind('batch'), queueable: kind('queueable'), schedulable: kind('schedulable'), future: kind('future'), rest: kind('rest'), soap: kind('soap'), invocable: kind('invocable'), auraEnabled: kind('auraEnabled'), callout: kind('callout'), lines: app.reduce((n, c) => n + c.lines, 0), withSharing: app.filter((c) => c.sharing === 'with').length, withoutSharing: app.filter((c) => c.sharing === 'without').length, inheritedSharing: app.filter((c) => c.sharing === 'inherited').length },
    objects: { custom: local.filter((x) => x.kind === 'custom').length, standard: local.filter((x) => x.kind === 'standard').length, managed: f.data.objects.filter((x) => x.namespace).length, platformEvents: local.filter((x) => x.kind === 'platformEvent').length, customSettings: local.filter((x) => x.kind === 'customSetting').length, cmdtTypes: f.data.cmdtTypes.length, bigObjects: local.filter((x) => x.kind === 'bigObject').length, externalObjects: local.filter((x) => x.kind === 'externalObject').length },
    fields: { custom: f.data.objects.reduce((n, x) => n + x.customFields, 0), externalIds: f.data.objects.reduce((n, x) => n + x.externalIds.length, 0), relations: f.data.objects.reduce((n, x) => n + x.relations.length, 0), formulas: f.data.objects.reduce((n, x) => n + x.formulaFields, 0) },
    recordTypes: f.data.objects.reduce((n, x) => n + x.recordTypes.length, 0),
    validationRules: { total: f.data.objects.reduce((n, x) => n + x.validationRules.length, 0), active: f.data.objects.reduce((n, x) => n + x.validationRules.filter((v) => v.active).length, 0) },
    cmdt: { types: f.data.cmdtTypes.length, records: f.data.cmdtTypes.reduce((n, t) => n + t.records, 0) },
    flows: { total: f.automation.flows.length, active: f.automation.flows.filter((x) => x.active).length, recordTriggered: f.automation.flows.filter((x) => x.active && /Record/.test(x.triggerType || '')).length, scheduled: f.automation.flows.filter((x) => x.active && x.triggerType === 'Scheduled').length, screen: f.automation.flows.filter((x) => x.active && x.processType === 'Flow').length, autolaunched: f.automation.flows.filter((x) => x.active && x.processType === 'AutoLaunchedFlow' && !x.triggerType).length, platformEvent: f.automation.flows.filter((x) => x.active && x.triggerType === 'PlatformEvent').length },
    omni: { scripts: o.omniScripts.length, scriptsActive: o.omniScripts.filter((x) => x.active).length, ips: o.integrationProcedures.length, ipsActive: o.integrationProcedures.filter((x) => x.active).length, dataMappers: o.dataMappers.length, dataMappersActive: o.dataMappers.filter((x) => x.active).length, cards: o.flexCards.length, cardsActive: o.flexCards.filter((x) => x.active).length },
    ui: { apps: f.ui.apps.length, consoleApps: f.ui.apps.filter((a) => a.console).length, flexipages: f.ui.flexipages.length, recordPages: f.ui.flexipages.filter((p) => p.type === 'RecordPage').length, lwc: f.ui.lwc.length, aura: f.ui.aura.length, vfPages: f.ui.vfPages.length, tabs: f.ui.tabs.length, quickActions: f.ui.quickActions.length, messageChannels: f.ui.messageChannels.length },
    security: { profiles: f.security.profiles.length, permissionSets: f.security.permissionSets.length, permissionSetGroups: f.security.permissionSetGroups.length, roles: f.security.roles.length, queues: f.security.queues.length, groups: f.security.groups.length, sharingRules: f.security.sharingRules.reduce((n, s) => n + s.rules.length, 0), customPermissions: f.security.customPermissions.length },
    integration: { namedCredentials: f.integration.namedCredentials.length, externalCredentials: f.integration.externalCredentials.length, remoteSites: f.integration.remoteSites.length, connectedApps: f.integration.connectedApps.length, authProviders: f.integration.authProviders.length, cspTrustedSites: f.integration.cspTrustedSites.length, corsOrigins: f.integration.corsOrigins.length, restResources: kind('rest'), callCenters: f.integration.callCenters.length, externalServices: f.integration.externalServices.length, systems: f.systems.named.length },
    misc: { labels: f.misc.labels.length, staticResources: f.misc.staticResources.length, reports: f.misc.reports.names.length, dashboards: f.misc.dashboards.names.length, reportTypes: f.misc.reportTypes.length, emailTemplates: f.misc.emailTemplates.length, namespaces: f.namespaces.length },
    exclusions: { applied: f.exclusions.applied.length, candidates: f.exclusions.candidates.length },
  };
}

/** Every documented component name, used by `tadforce validate` to check identifiers in the text. */
function inventory(f) {
  const names = new Set();
  const addAll = (xs, k = 'name') => xs.forEach((x) => names.add(typeof x === 'string' ? x : x[k]));
  addAll(f.apex.classes); addAll(f.apex.triggers); addAll(f.ui.lwc); addAll(f.ui.aura); addAll(f.ui.vfPages); addAll(f.ui.flexipages); addAll(f.ui.apps); addAll(f.ui.tabs); addAll(f.ui.quickActions);
  addAll(f.automation.flows);
  for (const k of Object.keys(f.automation.omnistudio)) {
    addAll(f.automation.omnistudio[k]);
    f.automation.omnistudio[k].forEach((x) => { [x.type, x.subType, x.label].forEach((v) => v && names.add(v)); if (x.type && x.subType) { names.add(`${x.type}_${x.subType}`); names.add(`${x.type}/${x.subType}`); } });
  }
  for (const list of Object.values(f.misc.named || {})) addAll(list);
  for (const o of f.data.objects) { names.add(o.name); (o.customFieldNames || []).forEach((x) => { names.add(x); names.add(`${o.name}.${x}`); }); o.externalIds.forEach((x) => { names.add(x); names.add(`${o.name}.${x}`); }); o.relations.forEach((r) => { names.add(r.field); names.add(`${o.name}.${r.field}`); r.to.forEach((x) => names.add(x)); }); o.recordTypes.forEach((r) => names.add(r.name)); o.validationRules.forEach((v) => names.add(v.name)); }
  for (const t of f.data.cmdtTypes) { names.add(t.type); t.names.forEach((n) => names.add(n)); }
  addAll(f.security.profiles); addAll(f.security.permissionSets); addAll(f.security.permissionSetGroups); addAll(f.security.roles); addAll(f.security.queues); addAll(f.security.groups); addAll(f.security.customPermissions);
  f.security.sharingRules.forEach((s) => s.rules.forEach((r) => names.add(r.name)));
  addAll(f.integration.namedCredentials); addAll(f.integration.externalCredentials); addAll(f.integration.remoteSites); addAll(f.integration.connectedApps); addAll(f.integration.authProviders); addAll(f.integration.cspTrustedSites); addAll(f.integration.callCenters);
  f.apex.classes.forEach((c) => c.restUrl && names.add(c.restUrl));
  addAll(f.ui.messageChannels); addAll(f.misc.reports.folders);
  f.integration.connectedApps.forEach((a) => a.scopes.forEach((s) => names.add(s)));
  [...f.security.profiles, ...f.security.permissionSets].forEach((p) => p.powerful.forEach((x) => names.add(x)));
  addAll(f.misc.labels); addAll(f.misc.staticResources); addAll(f.misc.reports.names); addAll(f.misc.dashboards.names); addAll(f.misc.reportTypes); addAll(f.misc.emailTemplates); addAll(f.data.globalValueSets);
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function loadFacts(ws) {
  const p = path.join(ws, 'facts', 'facts.json');
  if (!exists(p)) return null;
  const facts = readJson(p);
  const orgP = path.join(ws, 'facts', 'org.json');
  facts.org = exists(orgP) ? readJson(orgP) : null;
  return facts;
}

/** Summarise a Code Analyzer JSON report (sf code-analyzer run --output-file x.json) if the user provided one. */
export function readCodeAnalyzer(ws) {
  const dir = path.join(ws, 'knowledge', 'inputs');
  if (!exists(dir)) return null;
  const f = fs.readdirSync(dir).find((n) => /code-analyzer.*\.json$/i.test(n));
  if (!f) return null;
  const j = safeReadJson(path.join(dir, f));
  const violations = j?.violations || j?.results?.flatMap?.((r) => r.violations || []) || [];
  if (!violations.length) return null;
  const bySeverity = {}, byRule = {};
  for (const v of violations) {
    const sev = String(v.severity ?? v.sev ?? 3);
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    const rule = v.rule || v.ruleName || 'rule';
    byRule[rule] = (byRule[rule] || 0) + 1;
  }
  return { file: f, total: violations.length, bySeverity, topRules: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([rule, count]) => ({ rule, count })) };
}
