// The ground-truth brief: what the org IS and IS NOT, computed from facts.json, org.json and the model, so that
// no writer asserts what the org state contradicts (a schedule that does not exist, a portal without a site,
// « Production » for a Developer Edition, Permission Set Groups where there are none).
//   brief = { facts: [short sentences], absent: [what the org does not have], doNotClaim: [what never to write] }
// Every write group and the review task carry it; it is also written to understanding/brief.md.
import { writeText } from '../util/fsx.js';

const list = (xs, max = 12) => (xs.length > max ? `${xs.slice(0, max).join(', ')} … (+${xs.length - max})` : xs.join(', '));
const code = (xs) => xs.map((x) => `\`${x}\``);

// headline products: a flag false means the org does not use the product (not detected in the metadata)
const PRODUCTS = [
  ['serviceCloud', 'Service Cloud'], ['experienceCloud', 'Experience Cloud (sites, portals, communities)'], ['fieldService', 'Field Service'],
  ['marketingCloud', 'Marketing Cloud Connect'], ['accountEngagement', 'Marketing Cloud Account Engagement'], ['commerce', 'Commerce Cloud'],
  ['orderManagement', 'Order Management'], ['cpq', 'Salesforce CPQ'], ['billing', 'Salesforce Billing'], ['revenueCloud', 'Revenue Cloud'],
  ['omnistudio', 'OmniStudio'], ['dataCloud', 'Data Cloud'], ['agentforce', 'Agentforce / Einstein'], ['crmAnalytics', 'CRM Analytics'],
  ['shield', 'Shield (Platform Encryption, Event Monitoring)'], ['slack', 'Slack integration'], ['events', 'Platform Events / Change Data Capture'],
];

// counts at 0 that writers tend to assume: [counts path, what is absent]
const ZEROS = [
  ['security.permissionSetGroups', 'Permission Set Groups'], ['security.queues', 'Queues'], ['security.sharingRules', 'sharing rules'],
  ['security.roles', 'roles (no role hierarchy)'], ['security.customPermissions', 'Custom Permissions'],
  ['integration.namedCredentials', 'Named Credentials'], ['integration.externalCredentials', 'External Credentials'],
  ['integration.connectedApps', 'Connected Apps'], ['integration.remoteSites', 'Remote Site Settings'], ['integration.externalServices', 'External Services'],
  ['integration.restResources', 'Apex REST resources (inbound REST API)'], ['apex.soap', 'Apex SOAP web services'],
  ['apex.triggers', 'Apex triggers'], ['apex.batch', 'Batch Apex'], ['apex.queueable', 'Queueable Apex'], ['apex.schedulable', 'Schedulable Apex'],
  ['apex.future', '@future methods'], ['apex.callout', 'Apex HTTP callouts'], ['flows.scheduled', 'scheduled flows'], ['flows.screen', 'screen flows'],
  ['flows.platformEvent', 'platform-event-triggered flows'], ['objects.platformEvents', 'platform events'], ['cmdt.types', 'Custom Metadata Types'],
  ['ui.lwc', 'Lightning Web Components'], ['ui.aura', 'Aura components'], ['ui.vfPages', 'Visualforce pages'], ['ui.quickActions', 'quick actions'],
  ['misc.reports', 'reports'], ['misc.dashboards', 'dashboards'],
];

const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

/** The products in use: the strong flags of the modules when the facts carry them, else the detected ones. */
function products(modules = {}) {
  const clouds = modules.clouds || [];
  const strong = modules.strong;
  if (Array.isArray(strong)) return { used: clouds.filter((c) => strong.includes(c.id)).map((c) => c.name), weak: clouds.filter((c) => !strong.includes(c.id)).map((c) => c.name) };
  if (strong && typeof strong === 'object') return { used: clouds.filter((c) => strong[c.id]).map((c) => c.name), weak: clouds.filter((c) => !strong[c.id]).map((c) => c.name) };
  if (clouds.some((c) => c.strength || c.strong !== undefined)) {
    const isStrong = (c) => c.strong === true || c.strength === 'strong';
    return { used: clouds.filter(isStrong).map((c) => c.name), weak: clouds.filter((c) => !isStrong(c)).map((c) => c.name) };
  }
  // 0.6 facts: modules.<id> and clouds hold strong evidence only, the weak ones sit in modules.weak
  const weak = Array.isArray(modules.weak) ? modules.weak.map((w) => (typeof w === 'string' ? w : w.name || w.id)) : [];
  return { used: modules.products || clouds.map((c) => c.name), weak };
}

/** Environment of the org from its Organization row (a sandbox or a Developer Edition is never « Production »). */
export function orgEnvironment(organization) {
  if (!organization) return null;
  if (organization.sandbox) return 'Sandbox';
  if (/developer/i.test(String(organization.edition || ''))) return 'Developer Edition';
  if (/trial|demo/i.test(String(organization.edition || ''))) return 'Trial';
  return 'Production';
}

/**
 * Ground truth of the org, for writers and the reviewer.
 * @param {object} ctx    workspace (cfg, glossary())
 * @param {object} facts  facts.json, with facts.org (org.json) when collected
 * @param {object} [model] understanding/model.json (open questions)
 * @param {object} [graph] facts/graph.json (Schedulable classes scheduled from code)
 */
export function groundTruth(ctx, facts, model = null, graph = null) {
  const out = { facts: [], absent: [], doNotClaim: [] };
  const counts = facts.counts || {};
  const collected = (p) => !facts.coverageByCount || facts.coverageByCount[p] !== 'missing';
  const org = facts.org || null;
  const env = ctx.cfg?.document?.environment || null;

  // --- the org itself
  const o = org && org.organization;
  if (o) {
    const actual = orgEnvironment(o);
    out.facts.push(`The org is a ${o.edition || 'Salesforce org'}${o.sandbox ? ', sandbox' : ''} (environment: ${actual}).`);
    if (actual !== 'Production') out.doNotClaim.push(`Never call this org « Production » or describe a production run: it is a ${actual}.`);
    if (env && env !== actual && !(actual === 'Production' && /prod/i.test(env))) out.doNotClaim.push(`The cover says « ${env} » but the org is a ${actual}: describe what the org is, never more.`);
  } else {
    out.absent.push('org facts (edition, active users, scheduled jobs, volumes): not collected');
    out.doNotClaim.push('Never state the edition, a number of users, a licence count, the schedule of a job (other than the start of a scheduled flow) or a data volume: the org facts were not collected.');
    if (env) out.facts.push(`The document describes the environment « ${env} » (from the configuration, not measured).`);
  }

  // --- products
  const p = products(facts.modules);
  if (p.used.length) out.facts.push(`Salesforce products in use: ${list(p.used)}.`);
  if (p.weak.length) out.doNotClaim.push(`Products with weak traces only (do not describe them as used): ${list(p.weak)}.`);
  const off = PRODUCTS.filter(([id]) => facts.modules && facts.modules[id] === false).map(([, name]) => name);
  if (off.length) out.absent.push(`products not used: ${list(off, 20)}`);
  const sites = ['sites', 'networks', 'experiences'].reduce((n, k) => n + (get(facts, `misc.signals.${k}`) || 0), 0);
  if (facts.misc && !sites) {
    if (!(facts.modules && facts.modules.experienceCloud === false)) out.absent.push('Experience Cloud sites, portals or communities (no site, no network)');
    out.doNotClaim.push('Never describe or imply a portal, a community or a site for customers, partners or buyers: the org has none.');
  }

  // --- counts at 0 (only when the type was collected: « not collected » is not 0)
  for (const [path, what] of ZEROS) {
    const v = get(counts, path);
    if (v === 0 && collected(path)) out.absent.push(what);
  }
  if (get(counts, 'security.permissionSetGroups') === 0 && collected('security.permissionSetGroups')) out.doNotClaim.push('Never mention Permission Set Groups or personas built on them: the org has none (access comes from profiles and permission sets).');
  if (get(counts, 'integration.namedCredentials') === 0 && collected('integration.namedCredentials')) out.doNotClaim.push('Never write that callouts go through Named Credentials: the org has none.');
  const notCollected = Object.entries(facts.coverageByCount || {}).filter(([, v]) => v === 'missing').map(([k]) => k);
  if (notCollected.length) out.doNotClaim.push(`Not collected (unknown, never 0 nor « none »): ${list(notCollected, 15)}.`);

  // --- users
  if (org && Array.isArray(org.usersByProfile)) {
    const withUsers = org.usersByProfile.filter((x) => x.users > 0).sort((a, b) => b.users - a.users);
    if (withUsers.length) out.facts.push(`Active users per profile: ${list(withUsers.map((x) => `${x.profile} (${x.users})`), 10)}.`);
    else out.absent.push('active users (no profile holds an active user)');
  }
  if (org && Array.isArray(org.psgAssignments) && (facts.security?.permissionSetGroups || []).length) {
    const by = new Map(org.psgAssignments.map((a) => [a.group, a.users]));
    const groups = facts.security.permissionSetGroups.map((g) => [g.name, by.get(g.name) || 0]);
    out.facts.push(`Users per Permission Set Group: ${list(groups.map(([n, u]) => `${n} (${u})`), 10)}.`);
    const empty = groups.filter(([, u]) => !u).map(([n]) => n);
    if (empty.length) out.doNotClaim.push(`Permission Set Groups assigned to nobody: ${list(code(empty))} — never describe them as the access of a population.`);
  }
  if (org && Array.isArray(org.usersByRole) && get(counts, 'security.roles') > 0) {
    const held = org.usersByRole.filter((r) => r.role && r.users > 0);
    if (!held.length) {
      out.absent.push('users in roles (roles exist, no active user holds one)');
      out.doNotClaim.push('Never describe record access through the role hierarchy for the users: no active user holds a role.');
    } else out.facts.push(`Roles holding active users: ${held.length} of ${get(counts, 'security.roles')}.`);
  }

  // --- schedules
  const schedulable = (facts.apex?.classes || []).filter((c) => !c.test && (c.kinds || []).includes('schedulable')).map((c) => c.name);
  const scheduledFromCode = new Set((graph?.edges || []).filter((e) => e.async === 'schedule').map((e) => e.to.replace(/^apex:/, '')));
  const scheduledFlows = (facts.automation?.flows || []).filter((f) => f.active && f.scheduleFrequency).map((f) => `${f.name} (${f.scheduleFrequency})`);
  if (scheduledFlows.length) out.facts.push(`Scheduled flows (active): ${list(scheduledFlows)}.`);
  if (org && Array.isArray(org.scheduledJobs)) {
    const jobs = org.scheduledJobs;
    if (jobs.length) out.facts.push(`Scheduled jobs in the org: ${list(jobs.map((j) => `${j.name}${j.type ? ` (${j.type}${j.cron ? `, ${j.cron}` : ''})` : ''}`), 15)}.`);
    else {
      out.absent.push('scheduled jobs (no CronTrigger of the project in the org)');
      out.doNotClaim.push('Never write that a job runs on a schedule (hourly, nightly, weekly…): nothing of the project is scheduled in the org.');
    }
    const apexJobs = jobs.filter((j) => !j.type || /apex/i.test(j.type));
    const names = apexJobs.map((j) => String(j.name || '').toLowerCase());
    const unscheduled = schedulable.filter((c) => !names.some((n) => n.includes(c.toLowerCase())));
    if (unscheduled.length) out.doNotClaim.push(`Schedulable classes with no scheduled job in the org (by job name): ${list(code(unscheduled))} — never give them a frequency; say they can be scheduled${unscheduled.some((c) => scheduledFromCode.has(c)) ? ` (scheduled from code: ${list(code(unscheduled.filter((c) => scheduledFromCode.has(c))))})` : ''}.`);
  } else if (schedulable.length) {
    out.doNotClaim.push(`The scheduled jobs were not collected: ${list(code(schedulable))} being Schedulable is no proof that it runs — never give a frequency.`);
  }

  // --- data
  const standard = (facts.data?.objects || []).filter((x) => x.kind === 'standard' && !x.namespace && (x.used || x.customFields > 0)).map((x) => x.name);
  if (standard.length) out.facts.push(`Standard objects used: ${list(standard, 20)}.`);
  const custom = (facts.data?.objects || []).filter((x) => x.kind === 'custom' && !x.namespace).length;
  if (custom === 0 && facts.data) out.absent.push('custom objects');
  if (org && Array.isArray(org.volumes)) {
    const empty = org.volumes.filter((v) => v.records === 0).map((v) => v.object);
    if (empty.length) out.doNotClaim.push(`Objects with no record in the org: ${list(code(empty))} — never describe them as holding business data.`);
  }

  // --- systems
  const systems = ((ctx.glossary && ctx.glossary()) || {}).systems || [];
  if (systems.length) out.facts.push(`External systems (the only names to write, from knowledge/glossary.yml): ${list(systems.map((s) => s.name || s.id))}.`);
  else {
    out.absent.push('confirmed external system names (knowledge/glossary.yml › systems is empty)');
    out.doNotClaim.push('Never name an external system: none is confirmed in the glossary — describe the Salesforce side (Named Credential, class) only.');
  }
  const unnamed = facts.systems?.unnamed || [];
  if (unnamed.length && systems.length) out.doNotClaim.push(`${unnamed.length} endpoint(s) have no confirmed system name: describe them by their Salesforce component, never by a guessed name.`);

  // --- automation that does not run
  const inactive = (facts.automation?.flows || []).filter((f) => !f.active).map((f) => f.name);
  if (inactive.length) out.doNotClaim.push(`Inactive flows are not behaviour of the org: ${list(code(inactive))}.`);
  const legacy = (get(facts, 'automation.rules.workflowRules') || 0) + (get(facts, 'automation.rules.processBuilders') || 0);
  if (facts.automation?.rules && !legacy) out.absent.push('Workflow Rules and Process Builder processes');
  if ((facts.exclusions?.applied || []).length) out.doNotClaim.push(`Excluded components (knowledge/exclusions.yml) never appear: ${list(code(facts.exclusions.applied.map((x) => x.name || x)), 10)}.`);

  // --- open questions of the model: never answered in the documents
  const questions = (model?.findings || []).filter((f) => f.kind === 'question');
  for (const q of questions.slice(0, 15)) out.doNotClaim.push(`Open question ${q.id} — never state an answer: ${String(q.text).slice(0, 200)}`);
  if (questions.length > 15) out.doNotClaim.push(`… and ${questions.length - 15} more open questions in understanding/model.json › findings.`);
  return out;
}

/** The brief as markdown (understanding/brief.md): mandatory reading for every writer and the reviewer. */
export function briefMarkdown(brief) {
  const block = (title, items) => [`## ${title}`, '', ...(items.length ? items.map((x) => `- ${x}`) : ['- (none)']), ''];
  return [
    '# Ground truth of the org',
    '',
    'Computed by TADForce from facts.json, org.json and the understanding model. Mandatory reading before writing or reviewing: a sentence that contradicts this brief is wrong, whatever the code or the specifications suggest.',
    '',
    ...block('Facts', brief.facts),
    ...block('Absent from the org', brief.absent),
    ...block('Never claim', brief.doNotClaim),
  ].join('\n');
}

/** Compute the brief and write understanding/brief.md. */
export function writeBrief(ctx, facts, model, graph) {
  const brief = groundTruth(ctx, facts, model, graph);
  writeText(ctx.p('understanding', 'brief.md'), briefMarkdown(brief));
  return brief;
}
