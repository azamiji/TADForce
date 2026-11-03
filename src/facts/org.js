// Live org facts: configuration and aggregates only (COUNT, MAX(CreatedDate), GROUP BY).
// Stored apart from facts.json (facts/org.json) because they change over time.
import { soql, sfJson } from '../sf/sf.js';

async function safe(fn, fallback = null) {
  try { return await fn(); } catch (e) { return { error: e.message.slice(0, 300), value: fallback }; }
}
const rows = (r) => (r && Array.isArray(r.records) ? r.records : []);
const unwrap = (v) => (v && v.error !== undefined ? v.value : v);

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/** CronJobDetail.JobType codes (Salesforce documentation); unknown codes stay visible as « Other (code X) ». */
export const JOB_TYPES = {
  1: 'Data Export', 3: 'Dashboard Refresh', 4: 'Reporting Snapshot', 6: 'Scheduled Flow', 7: 'Scheduled Apex', 8: 'Report Run',
  9: 'Batch Job', A: 'Reporting Notification', E: 'Search Engine Optimization',
};
export const jobTypeLabel = (code) => (code == null || code === '' ? null : JOB_TYPES[String(code)] || `Other (code ${code})`);

// Jobs Salesforce runs for itself in every org (analytics, semantic graph, usage metrics…): not the project's.
const INTERNAL_JOB = /metalytics|semantic graph|\bSRT\b|report ?type edge|lightning usage|usage metrics|org metrics|einstein (activity|analytics|insights)|salesforce optimizer|sfdc[_ ]|^sf_/i;
// Owners that are platform users, not people of the project.
const SYSTEM_OWNER = /^(automated process|platform integration user|system|salesforce( internal)?|security user|insights integration)$/i;
const SYSTEM_USER_TYPE = /^(AutomatedProcess|CloudIntegrationUser)$/i;

/** true for a scheduled job that Salesforce runs for itself (by name, or by its owner when known). */
export function isInternalJob(j) {
  if (INTERNAL_JOB.test(String(j.name || ''))) return true;
  if (j.owner && SYSTEM_OWNER.test(String(j.owner).trim())) return true;
  return !!(j.ownerType && SYSTEM_USER_TYPE.test(String(j.ownerType)));
}

/** Scheduled jobs with readable types; Salesforce's own jobs are set aside (named, not listed with the project's). */
export function shapeJobs(records) {
  const all = records.map((r) => ({
    name: r.CronJobDetail?.Name, type: jobTypeLabel(r.CronJobDetail?.JobType), typeCode: r.CronJobDetail?.JobType ?? null, state: r.State, cron: r.CronExpression,
    next: r.NextFireTime ? String(r.NextFireTime).slice(0, 16) : null, owner: r.CreatedBy?.Name || null, ownerType: r.CreatedBy?.UserType || null,
  })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return {
    scheduledJobs: all.filter((j) => !isInternalJob(j)).map(({ ownerType, ...j }) => j),
    internal: all.filter(isInternalJob).map((j) => j.name),
  };
}

/** Objects whose volume is measured: the project's custom objects and the standard objects it uses. */
// polymorphic or virtual objects: they cannot be counted (Activity, Name…) — Task and Event carry the activity volumes
const NOT_COUNTABLE = new Set(['Activity', 'Name', 'OpenActivity', 'ActivityHistory', 'AggregateResult', 'RecentlyViewed']);
export const volumeObjects = (facts) => facts.data.objects.filter((o) => ['custom', 'standard'].includes(o.kind) && !o.namespace && !NOT_COUNTABLE.has(o.name) && (o.kind === 'custom' || o.used || o.customFields > 0));

export async function collectOrgFacts(alias, facts, { onProgress = () => {} } = {}) {
  const errors = [];
  const run = async (label, fn, fallback) => { const v = await safe(fn, fallback); if (v && v.error !== undefined) errors.push({ step: label, error: v.error }); return unwrap(v); };

  onProgress('organization');
  const orgRow = rows(await run('organization', () => soql('SELECT Name, OrganizationType, IsSandbox, InstanceName, LanguageLocaleKey, DefaultLocaleSidKey, TimeZoneSidKey, NamespacePrefix FROM Organization', alias)))[0] || null;
  const organization = orgRow && {
    name: orgRow.Name, edition: orgRow.OrganizationType, sandbox: orgRow.IsSandbox, instance: orgRow.InstanceName,
    language: orgRow.LanguageLocaleKey, locale: orgRow.DefaultLocaleSidKey, timeZone: orgRow.TimeZoneSidKey,
  };

  onProgress('users');
  const usersByProfile = rows(await run('users', () => soql('SELECT Profile.Name p, COUNT(Id) c FROM User WHERE IsActive = true GROUP BY Profile.Name', alias)))
    .map((r) => ({ profile: r.p || r.Name, users: r.c ?? r.expr0 })).sort((a, b) => String(a.profile).localeCompare(String(b.profile)));
  const usersByRole = rows(await run('roles', () => soql('SELECT UserRole.DeveloperName r, COUNT(Id) c FROM User WHERE IsActive = true GROUP BY UserRole.DeveloperName', alias)))
    .map((r) => ({ role: r.r || r.DeveloperName || null, users: r.c ?? r.expr0 })).sort((a, b) => String(a.role).localeCompare(String(b.role)));
  const usersByLicense = rows(await run('licenses', () => soql('SELECT Name, TotalLicenses, UsedLicenses FROM UserLicense', alias)))
    .filter((r) => r.UsedLicenses > 0).map((r) => ({ license: r.Name, used: r.UsedLicenses, total: r.TotalLicenses })).sort((a, b) => a.license.localeCompare(b.license));
  const psgAssignments = rows(await run('psg', () => soql('SELECT PermissionSetGroup.DeveloperName g, COUNT(Id) c FROM PermissionSetAssignment WHERE PermissionSetGroupId != null AND Assignee.IsActive = true GROUP BY PermissionSetGroup.DeveloperName', alias)))
    .map((r) => ({ group: r.g || r.DeveloperName, users: r.c ?? r.expr0 })).sort((a, b) => String(a.group).localeCompare(String(b.group)));
  // persona (permission set group) × role, for « Persona | Role | Application | Users »
  const psgByRole = rows(await run('psg-roles', () => soql('SELECT PermissionSetGroup.DeveloperName g, Assignee.UserRole.DeveloperName r, COUNT(Id) c FROM PermissionSetAssignment WHERE PermissionSetGroupId != null AND Assignee.IsActive = true GROUP BY PermissionSetGroup.DeveloperName, Assignee.UserRole.DeveloperName', alias)))
    .map((r) => ({ group: r.g || null, role: r.r || null, users: r.c ?? r.expr0 })).sort((a, b) => `${a.group}/${a.role}`.localeCompare(`${b.group}/${b.role}`));

  onProgress('records');
  const labels = Object.fromEntries(facts.data.objects.map((o) => [o.name, o.label || null]));
  const volumes = (await pool(volumeObjects(facts), 4, async (o) => {
    const count = await run(`count ${o.name}`, async () => (await soql(`SELECT COUNT() FROM ${o.name}`, alias)).totalSize);
    if (count == null) return null;
    let last = null;
    if (count > 0) {
      // some objects (FeedItem…) refuse MAX on CreatedDate: the date is optional, never an error
      const v = await safe(() => soql(`SELECT MAX(CreatedDate) d FROM ${o.name}`, alias));
      const r = v && v.error === undefined ? rows(unwrap(v))[0] : null;
      last = r ? (r.d || r.expr0 || null) : null;
    }
    return { object: o.name, label: labels[o.name], kind: o.kind, records: count, lastCreated: last ? String(last).slice(0, 10) : null };
  })).filter(Boolean);

  onProgress('jobs');
  const CRON = "CronJobDetail.Name, CronJobDetail.JobType, State, CronExpression, NextFireTime FROM CronTrigger WHERE State NOT IN ('DELETED','COMPLETE')";
  // the owner tells Salesforce's own jobs apart; an org that refuses the relationship still lists the jobs
  let cron = await safe(() => soql(`SELECT CreatedBy.Name, CreatedBy.UserType, ${CRON}`, alias));
  if (cron && cron.error !== undefined) cron = await run('cron', () => soql(`SELECT ${CRON}`, alias));
  const jobs = shapeJobs(rows(cron));
  const activeFlows = rows(await run('flows', () => soql('SELECT ApiName, IsActive, ProcessType FROM FlowDefinitionView WHERE IsActive = true', alias))).map((r) => r.ApiName).sort();

  onProgress('coverage');
  const cov = rows(await run('coverage', () => soql('SELECT PercentCovered FROM ApexOrgWideCoverage', alias, { tooling: true })))[0];
  const coverage = cov ? cov.PercentCovered : null;

  onProgress('packages');
  const packages = (await run('packages', () => sfJson(['package', 'installed', 'list', '--target-org', alias]), []) || [])
    .map((p) => ({ name: p.SubscriberPackageName, namespace: p.SubscriberPackageNamespace || null, version: p.SubscriberPackageVersionNumber || p.SubscriberPackageVersionName || null }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  onProgress('limits');
  const limits = (await run('limits', () => sfJson(['org', 'list', 'limits', '--target-org', alias]), []) || [])
    .filter((l) => ['DataStorageMB', 'FileStorageMB', 'DailyApiRequests', 'DailyAsyncApexExecutions', 'DailyBulkV2QueryJobs'].includes(l.name))
    .map((l) => ({ name: l.name, max: l.max, remaining: l.remaining })).sort((a, b) => a.name.localeCompare(b.name));

  return {
    collectedAt: new Date().toISOString().slice(0, 19) + 'Z',
    alias,
    organization,
    usersByProfile,
    usersByRole,
    usersByLicense,
    psgAssignments,
    psgByRole,
    volumes,
    scheduledJobs: jobs.scheduledJobs,
    salesforceJobs: jobs.internal,
    activeFlows,
    coverage,
    packages,
    limits,
    errors,
  };
}
