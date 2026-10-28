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
  const usersByLicense = rows(await run('licenses', () => soql('SELECT Name, TotalLicenses, UsedLicenses FROM UserLicense', alias)))
    .filter((r) => r.UsedLicenses > 0).map((r) => ({ license: r.Name, used: r.UsedLicenses, total: r.TotalLicenses })).sort((a, b) => a.license.localeCompare(b.license));
  const psgAssignments = rows(await run('psg', () => soql('SELECT PermissionSetGroup.DeveloperName g, COUNT(Id) c FROM PermissionSetAssignment WHERE PermissionSetGroupId != null AND Assignee.IsActive = true GROUP BY PermissionSetGroup.DeveloperName', alias)))
    .map((r) => ({ group: r.g || r.DeveloperName, users: r.c ?? r.expr0 })).sort((a, b) => String(a.group).localeCompare(String(b.group)));

  onProgress('records');
  const objects = facts.data.objects.filter((o) => ['custom', 'standard'].includes(o.kind) && !o.namespace && (o.kind === 'custom' || o.customFields > 0));
  const volumes = (await pool(objects, 4, async (o) => {
    const count = await run(`count ${o.name}`, async () => (await soql(`SELECT COUNT() FROM ${o.name}`, alias)).totalSize);
    if (count == null) return null;
    let last = null;
    if (count > 0) {
      const r = rows(await run(`last ${o.name}`, () => soql(`SELECT MAX(CreatedDate) d FROM ${o.name}`, alias)))[0];
      last = r ? (r.d || r.expr0 || null) : null;
    }
    return { object: o.name, records: count, lastCreated: last ? String(last).slice(0, 10) : null };
  })).filter(Boolean);

  onProgress('jobs');
  const scheduledJobs = rows(await run('cron', () => soql("SELECT CronJobDetail.Name, CronJobDetail.JobType, State, CronExpression, NextFireTime FROM CronTrigger WHERE State NOT IN ('DELETED','COMPLETE')", alias)))
    .map((r) => ({ name: r.CronJobDetail?.Name, type: r.CronJobDetail?.JobType, state: r.State, cron: r.CronExpression, next: r.NextFireTime ? String(r.NextFireTime).slice(0, 16) : null }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
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
    usersByLicense,
    psgAssignments,
    volumes,
    scheduledJobs,
    activeFlows,
    coverage,
    packages,
    limits,
    errors,
  };
}
