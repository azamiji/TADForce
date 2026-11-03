// What was collected: per metadata folder, did the type come back, and how many files. A count whose
// folder was not collected is « missing » (not collected), never a measured 0.
import fs from 'node:fs';
import path from 'node:path';
import { walk } from '../util/fsx.js';

/** Metadata API type → source-format folder (as in the snapshot). */
export const TYPE_FOLDERS = {
  ApexClass: 'classes', ApexTrigger: 'triggers', ApexPage: 'pages', ApexComponent: 'components', LightningComponentBundle: 'lwc', AuraDefinitionBundle: 'aura',
  LightningMessageChannel: 'messageChannels', DataWeaveResource: 'dw', StaticResource: 'staticresources', CustomObject: 'objects', CustomMetadata: 'customMetadata',
  CustomLabels: 'labels', GlobalValueSet: 'globalValueSets', Flow: 'flows', FlowDefinition: 'flowDefinitions', Workflow: 'workflows', ApprovalProcess: 'approvalProcesses',
  AssignmentRules: 'assignmentRules', AutoResponseRules: 'autoResponseRules', EscalationRules: 'escalationRules', MatchingRules: 'matchingRules', DuplicateRule: 'duplicateRules',
  PathAssistant: 'pathAssistants', CustomApplication: 'applications', CustomTab: 'tabs', FlexiPage: 'flexipages', Layout: 'layouts', QuickAction: 'quickActions',
  CustomNotificationType: 'notificationtypes', LightningExperienceTheme: 'lightningExperienceThemes', BrandingSet: 'brandingSets', ContentAsset: 'contentassets',
  Profile: 'profiles', PermissionSet: 'permissionsets', PermissionSetGroup: 'permissionsetgroups', MutingPermissionSet: 'mutingpermissionsets', CustomPermission: 'customPermissions',
  Role: 'roles', Group: 'groups', Queue: 'queues', SharingRules: 'sharingRules', SharingSet: 'sharingSets', NamedCredential: 'namedCredentials', ExternalCredential: 'externalCredentials',
  ExternalDataSource: 'dataSources', ExternalServiceRegistration: 'externalServiceRegistrations', AuthProvider: 'authproviders', ConnectedApp: 'connectedApps',
  RemoteSiteSetting: 'remoteSiteSettings', CspTrustedSite: 'cspTrustedSites', CorsWhitelistOrigin: 'corsWhitelistOrigins', CustomSite: 'sites', Network: 'networks',
  NetworkBranding: 'networkBranding', NavigationMenu: 'navigationMenus', ExperienceBundle: 'experiences', DigitalExperienceBundle: 'digitalExperiences',
  DigitalExperienceConfig: 'digitalExperienceConfigs', ExperiencePropertyTypeBundle: 'experiencePropertyTypeBundles', SiteDotCom: 'siteDotComSites',
  OmniScript: 'omniScripts', OmniIntegrationProcedure: 'omniIntegrationProcedures', OmniUiCard: 'omniUiCard', OmniDataTransform: 'omniDataTransforms',
  ReportType: 'reportTypes', ReportFolder: 'reports', Report: 'reports', DashboardFolder: 'dashboards', Dashboard: 'dashboards', EmailFolder: 'email', EmailTemplate: 'email',
  DocumentFolder: 'documents', Document: 'documents', MilestoneType: 'milestoneTypes', EntitlementProcess: 'entitlementProcesses', EntitlementTemplate: 'entitlementTemplates',
  PlatformCachePartition: 'cachePartitions', Settings: 'settings', TransactionSecurityPolicy: 'transactionSecurityPolicies', CallCenter: 'callCenters',
  ServiceChannel: 'serviceChannels', QueueRoutingConfig: 'queueRoutingConfigs', PresenceUserConfig: 'presenceUserConfigs', ServicePresenceStatus: 'servicePresenceStatuses',
  PresenceDeclineReason: 'presenceDeclineReasons', OmniSupervisorConfig: 'omniSupervisorConfigs', PlatformEventChannel: 'platformEventChannels',
  PlatformEventChannelMember: 'platformEventChannelMembers', PlatformEventSubscriberConfig: 'platformEventSubscriberConfigs', InstalledPackage: 'installedPackages',
  Bot: 'bots', BotVersion: 'bots', GenAiPlanner: 'genAiPlanners', GenAiPlannerBundle: 'genAiPlannerBundles', GenAiPlugin: 'genAiPlugins', GenAiFunction: 'genAiFunctions',
  GenAiPromptTemplate: 'genAiPromptTemplates', AiAuthoringBundle: 'aiAuthoringBundles', EmailServicesFunction: 'emailservices', ApexEmailNotifications: 'apexEmailNotifications',
  FieldRestrictionRule: 'fieldRestrictionRules', RestrictionRule: 'restrictionRules', ExternalAuthIdentityProvider: 'externalAuthIdentityProviders', UserCriteria: 'userCriteria',
  RecommendationStrategy: 'recommendationStrategies',
};

// Types that every real org has: retrieved but empty means the retrieve missed them.
export const EXPECTED_NON_EMPTY = ['ApexClass', 'CustomObject', 'Profile', 'PermissionSet', 'CustomApplication', 'Layout', 'FlexiPage', 'CustomTab'];

/** The folder each count of facts.counts is measured from (by count path prefix, most specific first). */
const COUNT_FOLDERS = [
  ['apex.triggers', 'triggers'], ['apex', 'classes'], ['integration.restResources', 'classes'],
  ['objects', 'objects'], ['fields', 'objects'], ['recordTypes', 'objects'], ['validationRules', 'objects'], ['cmdt.types', 'objects'], ['cmdt.records', 'customMetadata'],
  ['flows', 'flows'], ['omni.scripts', 'omniScripts'], ['omni.ips', 'omniIntegrationProcedures'], ['omni.dataMappers', 'omniDataTransforms'], ['omni.cards', 'omniUiCard'],
  ['ui.apps', 'applications'], ['ui.consoleApps', 'applications'], ['ui.flexipages', 'flexipages'], ['ui.recordPages', 'flexipages'], ['ui.lwc', 'lwc'], ['ui.aura', 'aura'],
  ['ui.vfPages', 'pages'], ['ui.tabs', 'tabs'], ['ui.quickActions', 'quickActions'], ['ui.messageChannels', 'messageChannels'],
  ['security.profiles', 'profiles'], ['security.permissionSets', 'permissionsets'], ['security.permissionSetGroups', 'permissionsetgroups'], ['security.roles', 'roles'],
  ['security.queues', 'queues'], ['security.groups', 'groups'], ['security.sharingRules', 'sharingRules'], ['security.customPermissions', 'customPermissions'],
  ['integration.namedCredentials', 'namedCredentials'], ['integration.externalCredentials', 'externalCredentials'], ['integration.remoteSites', 'remoteSiteSettings'],
  ['integration.connectedApps', 'connectedApps'], ['integration.authProviders', 'authproviders'], ['integration.cspTrustedSites', 'cspTrustedSites'],
  ['integration.corsOrigins', 'corsWhitelistOrigins'], ['integration.callCenters', 'callCenters'], ['integration.externalServices', 'externalServiceRegistrations'],
  ['misc.labels', 'labels'], ['misc.staticResources', 'staticresources'], ['misc.reports', 'reports'], ['misc.dashboards', 'dashboards'], ['misc.reportTypes', 'reportTypes'],
  ['misc.emailTemplates', 'email'],
];

export const folderOfCount = (p) => (COUNT_FOLDERS.find(([k]) => p === k || p.startsWith(k + '.')) || [])[1] || null;

/** Files of a folder across metadata roots (recursive). */
function countIn(roots, folder) {
  let n = 0;
  for (const r of roots) { const d = path.join(r, folder); if (fs.existsSync(d)) n += walk(d).length; }
  return n;
}

/**
 * facts.coverage: { folder: { collected, files } }. A folder is collected when files came back, or when
 * TADForce's own retrieve asked for the type and it did not fail (a measured 0). `retrieve`:
 * { requested: [types], failed: [types], dropped: [types the org does not have] } from the snapshot reports.
 */
export function computeCoverage(roots, retrieve = null) {
  const out = {};
  const folders = new Set(Object.values(TYPE_FOLDERS));
  for (const r of roots) for (const e of fs.readdirSync(r, { withFileTypes: true })) if (e.isDirectory()) folders.add(e.name);
  const asked = new Set(), failed = new Set();
  if (retrieve) {
    for (const t of [...(retrieve.requested || []), ...(retrieve.dropped || [])]) if (TYPE_FOLDERS[t]) asked.add(TYPE_FOLDERS[t]);
    for (const t of retrieve.failed || []) if (TYPE_FOLDERS[t]) failed.add(TYPE_FOLDERS[t]);
  }
  for (const folder of [...folders].sort()) {
    const files = countIn(roots, folder);
    out[folder] = { collected: files > 0 || (asked.has(folder) && !failed.has(folder)), files };
  }
  return out;
}

/** facts.coverageByCount: every leaf path of facts.counts → "collected" | "missing". */
export function coverageByCount(counts, coverage) {
  const out = {};
  const visit = (o, prefix) => {
    for (const [k, v] of Object.entries(o || {})) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') { visit(v, p); continue; }
      const folder = folderOfCount(p);
      out[p] = !folder || (coverage[folder] && coverage[folder].collected) ? 'collected' : 'missing';
    }
  };
  visit(counts, '');
  return out;
}

/** Post-retrieve check: per type of the manifest, the files that came back; requested types with none are listed. */
export function retrieveCompleteness(types, outDir, failed = []) {
  const roots = fs.existsSync(outDir) ? findRootsShallow(outDir) : [];
  const byType = {};
  const empty = [];
  for (const t of types) {
    const folder = TYPE_FOLDERS[t] || null;
    const files = folder ? countIn(roots, folder) : null;
    byType[t] = { folder, files };
    if (folder && files === 0 && !failed.includes(t)) empty.push(t);
  }
  return { byType, empty: [...new Set(empty)].sort() };
}

function findRootsShallow(dir) {
  // the retrieve writes <outDir>/<folder>/… (or <outDir>/main/default/<folder>/…)
  const roots = [dir];
  for (const sub of ['main/default', 'force-app/main/default']) if (fs.existsSync(path.join(dir, sub))) roots.push(path.join(dir, sub));
  return roots;
}
