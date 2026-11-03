import fs from 'node:fs';
import path from 'node:path';
import { files, bundles, baseName, readXml, arr, str, hasFolder, safeRead } from '../xml.js';

export function extractMisc(roots) {
  const labels = files(roots, 'labels', '.labels-meta.xml').flatMap((f) => arr(readXml(f).labels).map((l) => ({ name: str(l.fullName), category: str(l.categories) })));
  const reports = files(roots, 'reports', '.report-meta.xml', { recursive: true });
  const reportFolders = [...new Set(reports.map((f) => path.basename(path.dirname(f))))].sort();
  const dashboards = files(roots, 'dashboards', '.dashboard-meta.xml', { recursive: true });
  const emailTemplates = files(roots, 'email', '.email-meta.xml', { recursive: true });
  const settings = files(roots, 'settings', '.settings-meta.xml').map((f) => baseName(f, '.settings-meta.xml')).sort();
  const installedPackages = files(roots, 'installedPackages', '.installedPackage-meta.xml').map((f) => ({ namespace: baseName(f, '.installedPackage-meta.xml'), version: str(readXml(f).versionNumber) }))
    .sort((a, b) => a.namespace.localeCompare(b.namespace));

  const count = (folder, suffix) => files(roots, folder, suffix, { recursive: true }).length;
  const signals = {
    serviceChannels: count('serviceChannels', '.serviceChannel-meta.xml'),
    routingConfigs: count('queueRoutingConfigs', '.queueRoutingConfig-meta.xml'),
    presenceStatuses: count('servicePresenceStatuses', '.servicePresenceStatus-meta.xml'),
    presenceConfigs: count('presenceUserConfigs', '.presenceUserConfig-meta.xml'),
    networks: count('networks', '.network-meta.xml'),
    sites: count('sites', '.site-meta.xml'),
    experiences: bundles(roots, 'experiences').length + bundles(roots, 'digitalExperiences').length,
    bots: bundles(roots, 'bots').length,
    genAi: count('genAiPlanners', '') + count('genAiPlannerBundles', '') + count('genAiPlugins', '') + count('genAiFunctions', '') + bundles(roots, 'aiAuthoringBundles').length,
    entitlementProcesses: count('entitlementProcesses', ''),
    dataStreams: count('dataStreamDefinitions', ''),
    // every org has a PlatformEncryption.settings file: only switched-on options are evidence of Shield
    // Salesforce ships default policies (sfdc_default_*) in every org: only the project's own policies count
    transactionPolicies: files(roots, 'transactionSecurityPolicies', '.transactionSecurityPolicy-meta.xml', { recursive: true }).filter((f) => !/^sfdc_default_/i.test(path.basename(f))).length,
    platformEncryption: files(roots, 'settings', 'PlatformEncryption.settings-meta.xml').reduce((n, f) => n + (safeRead(f).match(/<enable\w*>true</g) || []).length, 0),
  };

  // Components documented by name only (routing, channels, sites, paths, rules, agents…)
  const NAMED = ['serviceChannels', 'queueRoutingConfigs', 'servicePresenceStatuses', 'presenceUserConfigs', 'presenceDeclineReasons', 'networks', 'sites',
    'entitlementProcesses', 'milestoneTypes', 'pathAssistants', 'duplicateRules', 'matchingRules', 'approvalProcesses', 'notificationtypes', 'genAiPlanners',
    'genAiPlugins', 'genAiFunctions', 'genAiPromptTemplates', 'brandingSets', 'navigationMenus', 'bots', 'experiences', 'digitalExperiences', 'aiAuthoringBundles', 'workflows', 'globalValueSets'];
  const named = {};
  for (const folder of NAMED) {
    const list = [...files(roots, folder, '').map((f) => path.basename(f).split('.')[0]), ...bundles(roots, folder).map((b) => b.name)];
    if (list.length) named[folder] = [...new Set(list)].sort();
  }

  return {
    named,
    labels: labels.filter((l) => l.name).sort((a, b) => a.name.localeCompare(b.name)),
    staticResources: files(roots, 'staticresources', '.resource-meta.xml').map((f) => baseName(f, '.resource-meta.xml')).sort(),
    reports: { total: reports.length, folders: reportFolders, byFolder: Object.fromEntries(reportFolders.map((fo) => [fo, reports.filter((f) => path.basename(path.dirname(f)) === fo).length])), names: reports.map((f) => baseName(f, '.report-meta.xml')).sort() },
    dashboards: { total: dashboards.length, names: dashboards.map((f) => baseName(f, '.dashboard-meta.xml')).sort() },
    reportTypes: files(roots, 'reportTypes', '.reportType-meta.xml').map((f) => baseName(f, '.reportType-meta.xml')).sort(),
    emailTemplates: emailTemplates.map((f) => baseName(f, '.email-meta.xml')).sort(),
    settings,
    installedPackages,
    signals,
    folders: metadataFolders(roots),
  };
}

/** Every metadata folder present, with its file count — a raw inventory for appendices. */
function metadataFolders(roots) {
  const counts = {};
  for (const r of roots) {
    for (const e of fs.readdirSync(r, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      counts[e.name] = (counts[e.name] || 0) + files([r], e.name, '-meta.xml', { recursive: true }).length;
    }
  }
  return counts;
}

const NS_PRODUCTS = {
  FinServ: 'Financial Services Cloud',
  HealthCloudGA: 'Health Cloud',
  npsp: 'Nonprofit Success Pack', npe01: 'Nonprofit Success Pack', npo02: 'Nonprofit Success Pack', npe03: 'Nonprofit Success Pack', npe4: 'Nonprofit Success Pack', npe5: 'Nonprofit Success Pack',
  SBQQ: 'Salesforce CPQ', blng: 'Salesforce Billing',
  FSL: 'Field Service',
  et4ae5: 'Marketing Cloud Connect',
  pi: 'Marketing Cloud Account Engagement',
  vlocity_cmt: 'OmniStudio (Communications, Media & Energy)', vlocity_ins: 'OmniStudio (Insurance)', vlocity_ps: 'OmniStudio (Public Sector)', omnistudio: 'OmniStudio',
  dsfs: 'DocuSign eSignature', echosign_dev1: 'Adobe Acrobat Sign', mkto_si: 'Marketo Sales Insight',
  sf_chttr_apps: 'Chatter apps', LightningMDE: 'Lightning Markdown Editor', pse: 'Certinia PSA', c2g: 'Certinia Financials',
  sfLma: 'License Management App', CHANNEL_ORDERS: 'Channel Order App', wave: 'CRM Analytics',
  cgcloud: 'Consumer Goods Cloud', hed: 'Education Data Architecture', slackv2: 'Slack for Salesforce', amazonconnect: 'Amazon Connect CTI Adapter',
  sbaa: 'Salesforce Advanced Approvals', APXTConga4: 'Conga Composer', Apttus_Config2: 'Conga CPQ', rh2: 'Rollup Helper', dlrs: 'Declarative Lookup Rollup Summaries',
  SDOC: 'S-Docs', geopointe: 'Geopointe', fferpcore: 'Certinia ERP Core', sf_com_apps: 'Salesforce Connected Apps', LID: 'LinkedIn Sales Navigator', ltnadptn: 'Lightning Adoption', maps: 'Salesforce Maps', LLC_BI: 'nCino', Loan: 'nCino (Loan)',
};

/** Namespaces referenced by metadata (managed packages), with a product name when known. */
export function detectNamespaces(roots, installedPackages) {
  const refs = {};
  const re = /\b([A-Za-z][A-Za-z0-9]{1,14})__[A-Za-z][A-Za-z0-9_]*?__(c|r|mdt|e|x|b)\b/g;
  for (const f of files(roots, '', '', { recursive: true }).filter((f) => /\.(xml|cls|trigger|js|html|page|cmp|json)$/.test(f))) {
    for (const m of safeRead(f).matchAll(re)) refs[m[1]] = (refs[m[1]] || 0) + 1;
  }
  for (const p of installedPackages) refs[p.namespace] = refs[p.namespace] || 0;
  return Object.keys(refs).sort().map((ns) => ({
    namespace: ns,
    references: refs[ns],
    product: NS_PRODUCTS[ns] || null,
    installed: installedPackages.some((p) => p.namespace === ns),
  }));
}

export const hasAny = (roots, folders) => folders.some((f) => hasFolder(roots, f));
