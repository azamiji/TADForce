// What Salesforce ships with an org, and the samples of a Developer Edition or a trial: never the project's
// architecture. Recognised from a list (shipped.json: type, name pattern, host, folder, org edition) and set
// aside before anything is counted. facts.salesforceShipped says what left and why.
import fs from 'node:fs';
import path from 'node:path';
import { files } from '../xml.js';

export const SHIPPED_DATA = JSON.parse(fs.readFileSync(new URL('./shipped.json', import.meta.url), 'utf8'));
const PREFIX = new RegExp(SHIPPED_DATA.prefixes.pattern);
export const isShippedName = (name) => PREFIX.test(String(name));

// type → [facts path, list getter, key of the name (null: the item is the name)]
const NAMED = { serviceChannel: 'serviceChannels', routingConfig: 'queueRoutingConfigs', presenceStatus: 'servicePresenceStatuses', presenceConfig: 'presenceUserConfigs', bot: 'bots',
  genAiPlanner: 'genAiPlanners', genAiPlannerBundle: 'genAiPlannerBundles', genAiPlugin: 'genAiPlugins', genAiFunction: 'genAiFunctions', genAiPromptTemplate: 'genAiPromptTemplates' };
const RULE_KINDS = { assignmentRule: 'assignment', escalationRule: 'escalation', autoResponseRule: 'autoResponse' };
function target(f, type) {
  switch (type) {
    case 'apex': return ['apex.classes', f.apex.classes, 'name'];
    case 'vfPage': return ['ui.vfPages', f.ui.vfPages, 'name'];
    case 'staticResource': return ['misc.staticResources', f.misc.staticResources, null];
    case 'remoteSite': return ['integration.remoteSites', f.integration.remoteSites, 'name'];
    case 'emailTemplate': return ['misc.emailTemplates', f.misc.emailTemplates, null];
    case 'namespace': return ['namespaces', f.namespaces, 'namespace'];
    case 'callCenter': return ['integration.callCenters', f.integration.callCenters, 'name'];
    default:
      if (RULE_KINDS[type]) return ['automation.ruleEntries', f.automation.ruleEntries || [], 'name', (x) => x.kind === RULE_KINDS[type]];
      if (NAMED[type]) return [`misc.named.${NAMED[type]}`, (f.misc.named || {})[NAMED[type]] || [], null];
      return null;
  }
}

/** Email template name → folders (unfiled$public…), from the sources. */
function emailFolders(roots) {
  const out = new Map();
  for (const file of files(roots, 'email', '.email-meta.xml', { recursive: true })) {
    const name = path.basename(file).slice(0, -'.email-meta.xml'.length);
    if (!out.has(name)) out.set(name, new Set());
    out.get(name).add(path.basename(path.dirname(file)));
  }
  return out;
}

/**
 * Set aside the components Salesforce ships and the samples (in place). Returns
 * { counts: { <facts path>: n }, reasons: [{ path, type, reason, names }] }.
 * @param ctx { roots, org }: metadata roots (email folders) and org facts (edition, users per role)
 */
export function setAsideShipped(f, { roots = [], org = null } = {}) {
  const removed = []; // { path, type, name, reason }
  const take = (pathKey, list, i, type, name, reason) => {
    const [item] = list.splice(i, 1);
    removed.push({ path: pathKey, type, name: String(name), reason, object: item && typeof item === 'object' ? item.object : undefined });
  };

  // standard apps, platform permission sets, default policies and flows (prefixes); the utility bars of
  // Salesforce's own apps go with them, and so do the utility bars no app of the org uses (one per industry console)
  const bars = new Set(f.ui.apps.filter((x) => isShippedName(x.name) && x.utilityBar).map((x) => x.utilityBar));
  const used = new Set(f.ui.apps.filter((x) => !isShippedName(x.name)).map((x) => x.utilityBar).filter(Boolean));
  for (const p of f.ui.flexipages) if (p.type === 'UtilityBar' && !used.has(p.name)) bars.add(p.name);
  for (let i = f.ui.flexipages.length - 1; i >= 0; i--) if (bars.has(f.ui.flexipages[i].name)) take('ui.utilityBars', f.ui.flexipages, i, 'flexipage', f.ui.flexipages[i].name, 'utility bar of a Salesforce app, or used by no app of the org');
  for (const [key, type, list] of [['ui.apps', 'app', f.ui.apps], ['ui.tabs', 'tab', f.ui.tabs], ['ui.flexipages', 'flexipage', f.ui.flexipages], ['security.permissionSets', 'permissionSet', f.security.permissionSets], ['security.permissionSetGroups', 'permissionSetGroup', f.security.permissionSetGroups], ['automation.flows', 'flow', f.automation.flows || []]]) {
    for (let i = list.length - 1; i >= 0; i--) if (isShippedName(list[i].name)) take(key, list, i, type, list[i].name, SHIPPED_DATA.prefixes.reason);
  }

  // listed components and samples
  const edition = org && org.organization ? String(org.organization.edition || '') : null;
  let folders = null;
  for (const rule of SHIPPED_DATA.rules) {
    const t = target(f, rule.type);
    if (!t) continue;
    if (rule.edition && !(edition && new RegExp(rule.edition, 'i').test(edition))) continue;
    const [pathKey, list, key, filter] = t;
    const nameRe = rule.name ? new RegExp(rule.name, rule.flags ?? 'i') : null;
    const hostRe = rule.host ? new RegExp(rule.host, 'i') : null;
    if (rule.folder && !folders) folders = emailFolders(roots);
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (filter && !filter(item)) continue;
      const name = key ? item[key] : item;
      if (nameRe && !nameRe.test(String(name))) continue;
      if (hostRe && !hostRe.test(String(item.host || ''))) continue;
      if (rule.folder && !(folders.get(String(name)) || new Set()).has(rule.folder)) continue;
      take(pathKey, list, i, rule.type, pathKey === 'automation.ruleEntries' ? `${item.object}.${name}` : name, rule.reason);
    }
  }
  // a sample package leaves with its namespace
  const goneNs = new Set(removed.filter((r) => r.type === 'namespace').map((r) => r.name));
  for (let i = (f.misc.installedPackages || []).length - 1; i >= 0; i--) if (goneNs.has(f.misc.installedPackages[i].namespace)) take('misc.installedPackages', f.misc.installedPackages, i, 'installedPackage', f.misc.installedPackages[i].namespace, 'sample package of a Developer Edition');
  // rule files whose every rule left are no longer counted
  recountRules(f, removed);

  // the sample role hierarchy of a Developer Edition, when no active user holds a role
  const roles = sampleRoleHierarchy(f, org);
  f.security.roleHierarchy = { sample: !!roles };
  if (roles) for (let i = f.security.roles.length - 1; i >= 0; i--) take('security.roles', f.security.roles, i, 'role', f.security.roles[i].name, SHIPPED_DATA.sampleRoles.reason);

  const counts = {};
  for (const r of removed) counts[r.path] = (counts[r.path] || 0) + 1;
  // the raw signal counts follow (« 2 service channels » never counts the platform's)
  const SIGNALS = { 'misc.named.serviceChannels': 'serviceChannels', 'misc.named.queueRoutingConfigs': 'routingConfigs', 'misc.named.servicePresenceStatuses': 'presenceStatuses', 'misc.named.presenceUserConfigs': 'presenceConfigs', 'misc.named.bots': 'bots' };
  for (const [p, k] of Object.entries(SIGNALS)) if (counts[p] && f.misc.signals && typeof f.misc.signals[k] === 'number') f.misc.signals[k] = Math.max(0, f.misc.signals[k] - counts[p]);
  for (const k of Object.keys(f.misc.named || {})) if (!f.misc.named[k].length) delete f.misc.named[k];
  const groups = new Map();
  for (const r of removed) {
    const k = `${r.path}\u0000${r.type}\u0000${r.reason}`;
    if (!groups.has(k)) groups.set(k, { path: r.path, type: r.type, reason: r.reason, names: [] });
    groups.get(k).names.push(r.name);
  }
  const reasons = [...groups.values()].map((g) => ({ ...g, names: [...new Set(g.names)].sort() }))
    .sort((a, b) => `${a.path}/${a.type}/${a.reason}`.localeCompare(`${b.path}/${b.type}/${b.reason}`));
  return { counts, reasons };
}

/** Assignment, escalation and auto-response counts are per object file: a file whose every rule left is not counted. */
function recountRules(f, removed) {
  const entries = f.automation.ruleEntries || [];
  for (const [kind, countKey] of [['assignment', 'assignmentRules'], ['escalation', 'escalationRules'], ['autoResponse', 'autoResponseRules']]) {
    const gone = new Set();
    for (const r of removed) if (r.path === 'automation.ruleEntries' && RULE_KINDS[r.type] === kind) gone.add(r.object);
    if (!gone.size) continue;
    const left = new Set(entries.filter((e) => e.kind === kind).map((e) => e.object));
    const emptied = [...gone].filter((o) => !left.has(o)).length;
    f.automation.rules[countKey] = Math.max(0, (f.automation.rules[countKey] || 0) - emptied);
  }
}

/**
 * true when the role hierarchy is the sample of a Developer Edition: most roles of the org are sample roles
 * (and enough of them), and the org facts say that no active user holds any role. Without org facts: never.
 */
export function sampleRoleHierarchy(f, org) {
  const S = SHIPPED_DATA.sampleRoles;
  const roles = f.security.roles || [];
  if (!roles.length || !org || !Array.isArray(org.usersByRole) || !org.usersByRole.length) return false;
  const noRole = (r) => !r.role || /^(EMPTY_ID|null|none)$/i.test(String(r.role));
  if (org.usersByRole.some((r) => !noRole(r) && r.users > 0)) return false;
  const sample = new Set(S.names.map((n) => n.toLowerCase()));
  const hits = roles.filter((r) => sample.has(String(r.name).toLowerCase())).length;
  return hits >= S.minimum && hits / roles.length >= S.share;
}
