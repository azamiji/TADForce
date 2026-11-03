// Which Salesforce products this org uses, from evidence in the metadata only.
// Each detected cloud maps to a reference in skills/tadforce/references/modules/ and to
// conditional sections of the skeletons (<!-- tad:if modules.<flag> -->).

const has = (set, ...names) => names.some((n) => set.has(n));

/**
 * Evidence rules. `objects`: standard objects whose presence in the snapshot (with custom fields,
 * record types or page usage) signals the product; `ns`: managed package namespaces; `test`: other signals.
 */
const CLOUDS = [
  { id: 'salesCloud', name: 'Sales Cloud', ref: 'sales-cloud', objects: ['Opportunity', 'Lead', 'Quote', 'Forecasting', 'Territory2', 'OpportunityLineItem', 'ActionCadence'], test: (f) => f.misc.folders.territory2Models > 0 || f.misc.folders.forecastingTypes > 0 },
  { id: 'serviceCloud', name: 'Service Cloud', ref: 'service-cloud', objects: ['Case', 'Entitlement', 'ServiceContract', 'MessagingSession', 'LiveChatTranscript', 'VoiceCall', 'CaseMilestone'], test: (f) => f.misc.signals.entitlementProcesses > 0 || f.misc.signals.serviceChannels > 0 || f.data.objects.some((o) => o.name.endsWith('__kav')) },
  { id: 'fieldService', name: 'Field Service', ref: 'field-service', ns: ['FSL'], objects: ['WorkOrder', 'ServiceAppointment', 'ServiceTerritory', 'ServiceResource', 'WorkOrderLineItem', 'MaintenancePlan'] },
  { id: 'experienceCloud', name: 'Experience Cloud', ref: 'experience-cloud', test: (f) => f.misc.signals.networks + f.misc.signals.experiences + f.misc.signals.sites > 0 },
  { id: 'marketingCloud', name: 'Marketing Cloud Connect', ref: 'marketing', ns: ['et4ae5'] },
  { id: 'accountEngagement', name: 'Marketing Cloud Account Engagement', ref: 'marketing', ns: ['pi'] },
  { id: 'commerce', name: 'Commerce Cloud (B2B / D2C)', ref: 'commerce', objects: ['WebStore', 'WebCart', 'ProductCatalog', 'BuyerGroup', 'BuyerAccount', 'CommerceEntitlementPolicy'] },
  { id: 'orderManagement', name: 'Order Management', ref: 'commerce', objects: ['OrderSummary', 'FulfillmentOrder', 'OrderDeliveryGroupSummary', 'ReturnOrder'] },
  { id: 'cpq', name: 'Salesforce CPQ', ref: 'revenue-cpq', ns: ['SBQQ'] },
  { id: 'billing', name: 'Salesforce Billing', ref: 'revenue-cpq', ns: ['blng'] },
  { id: 'revenueCloud', name: 'Revenue Cloud', ref: 'revenue-cpq', objects: ['ProductSellingModel', 'ProductSellingModelOption', 'BillingSchedule', 'Invoice', 'ProductClassification'] },
  { id: 'financialServices', name: 'Financial Services Cloud', ref: 'industries', ns: ['FinServ'], objects: ['FinancialAccount', 'FinancialAccountRole', 'FinancialGoal', 'PartyProfile', 'ResidentialLoanApplication'] },
  { id: 'insurance', name: 'Insurance (Financial Services Cloud)', ref: 'industries', ns: ['vlocity_ins'], objects: ['InsurancePolicy', 'InsurancePolicyCoverage', 'Claim', 'Producer', 'InsurancePolicyParticipant'] },
  { id: 'healthCloud', name: 'Health Cloud', ref: 'industries', ns: ['HealthCloudGA'], objects: ['CarePlan', 'CareProgram', 'ClinicalEncounter', 'HealthcareProvider', 'PatientMedicalProcedure'] },
  { id: 'lifeSciences', name: 'Life Sciences Cloud', ref: 'industries', objects: ['LifeSciMarketableProduct', 'ProviderVisit', 'ClinicalStudy'] },
  { id: 'manufacturing', name: 'Manufacturing Cloud', ref: 'industries', objects: ['SalesAgreement', 'AccountForecast', 'SalesAgreementProduct', 'WarrantyTerm'] },
  { id: 'automotive', name: 'Automotive Cloud', ref: 'industries', objects: ['Vehicle', 'VehicleDefinition', 'DriverQualification'] },
  { id: 'consumerGoods', name: 'Consumer Goods Cloud', ref: 'industries', ns: ['cgcloud'], objects: ['RetailStore', 'Visit', 'RetailVisitKpi', 'InStoreLocation'] },
  { id: 'communications', name: 'Communications / Media / Energy & Utilities Cloud', ref: 'industries', ns: ['vlocity_cmt'], objects: ['ServicePoint', 'BillingAccount'] },
  { id: 'publicSector', name: 'Public Sector Solutions', ref: 'industries', ns: ['vlocity_ps'], objects: ['IndividualApplication', 'BusinessLicense', 'RegulatoryCode', 'PublicComplaint', 'BenefitAssignment'] },
  { id: 'education', name: 'Education Cloud', ref: 'industries', ns: ['hed'], objects: ['LearnerProfile', 'AcademicTermEnrollment', 'LearningProgram', 'ProgramEnrollment'] },
  { id: 'nonprofit', name: 'Nonprofit (Nonprofit Cloud / NPSP)', ref: 'industries', ns: ['npsp', 'npe01', 'npo02', 'npe03', 'npe4', 'npe5'], objects: ['GiftTransaction', 'GiftCommitment', 'Program', 'ProgramEnrollment'] },
  { id: 'loyalty', name: 'Loyalty Management', ref: 'industries', objects: ['LoyaltyProgram', 'LoyaltyProgramMember', 'LoyaltyLedger', 'TransactionJournal'] },
  { id: 'netZero', name: 'Net Zero Cloud', ref: 'industries', objects: ['StnryAssetCrbnFtprnt', 'VehicleAssetCrbnFtprnt', 'Scope3CrbnFtprnt'] },
  { id: 'omnistudio', name: 'OmniStudio', ref: 'omnistudio', ns: ['omnistudio', 'vlocity_cmt', 'vlocity_ins', 'vlocity_ps'], test: (f) => Object.values(f.automation.omnistudio).some((l) => l.length > 0) },
  { id: 'dataCloud', name: 'Data Cloud', ref: 'data-cloud', test: (f) => f.misc.signals.dataStreams > 0 || f.data.objects.some((o) => /__(dlm|dll)$/.test(o.name)) || (f.misc.folders.dataStreamDefinitions || 0) + (f.misc.folders.dataSourceObjects || 0) > 0 },
  { id: 'agentforce', name: 'Agentforce / Einstein', ref: 'agentforce-ai', psg: /Agentforce|Copilot|EinsteinGPT|GenAI|Einstein_?Agent/i, test: (f) => f.misc.signals.bots + f.misc.signals.genAi > 0 || (f.misc.folders.genAiPromptTemplates || 0) + (f.misc.folders.mlPredictionDefinitions || 0) > 0 },
  { id: 'crmAnalytics', name: 'CRM Analytics', ref: 'analytics', ns: ['wave'], test: (f) => ['wave', 'waveDashboards', 'waveDataflows', 'waveRecipes', 'waveApplications', 'waveDatasets'].some((k) => f.misc.folders[k] > 0) },
  { id: 'shield', name: 'Shield (encryption, event monitoring, audit)', ref: 'security-shield', test: (f) => (f.misc.signals.transactionPolicies ?? f.misc.folders.transactionSecurityPolicies ?? 0) > 0 || (f.misc.folders.eventSubscriptions || 0) > 0 || (f.misc.signals.platformEncryption || 0) > 0 },
  { id: 'slack', name: 'Slack integration', ref: 'integration-platforms', ns: ['slackv2', 'slack'], test: (f) => (f.misc.folders.slackApps || 0) > 0 },
  { id: 'events', name: 'Platform Events / Change Data Capture', ref: 'platform-events', test: (f) => f.data.objects.some((o) => o.kind === 'platformEvent') || f.data.cdc.length > 0 },
];

/** Standard objects count as evidence when the org customised or uses them. */
function usedStandard(f) {
  const used = new Set();
  for (const o of f.data.objects) if (o.kind === 'standard' && (o.customFields > 0 || o.recordTypes.length || o.validationRules.length)) used.add(o.name);
  for (const p of f.ui.flexipages) if (p.object) used.add(p.object);
  for (const t of f.apex.triggers) if (t.object) used.add(t.object);
  for (const fl of f.automation.flows) if (fl.object) used.add(fl.object);
  for (const q of f.security.queues) q.objects.forEach((x) => used.add(x));
  return used;
}

export function detectModules(f, org = null) {
  const ns = new Set(f.namespaces.map((n) => n.namespace));
  const std = usedStandard(f);
  const clouds = [];
  const flags = {};
  for (const c of CLOUDS) {
    const evidence = [];
    for (const n of c.ns || []) if (ns.has(n)) evidence.push(`namespace ${n}`);
    for (const o of c.objects || []) if (std.has(o) || f.data.objects.some((x) => x.name === o && x.kind === 'standard' && x.customFields > 0)) evidence.push(`object ${o}`);
    if (c.test && c.test(f)) evidence.push('metadata');
    // users assigned to the product's permission set groups (aggregated org facts) prove it is used
    for (const g of (org && org.psgAssignments) || []) if (c.psg && c.psg.test(String(g.group)) && g.users > 0) evidence.push(`permission set group ${g.group} (${g.users} users)`);
    const on = evidence.length > 0;
    flags[c.id] = on;
    if (on) clouds.push({ id: c.id, name: c.name, reference: c.ref, evidence: [...new Set(evidence)].slice(0, 6) });
  }
  const industryIds = ['financialServices', 'insurance', 'healthCloud', 'lifeSciences', 'manufacturing', 'automotive', 'consumerGoods', 'communications', 'publicSector', 'education', 'nonprofit', 'loyalty', 'netZero'];
  const products = [...new Set([...clouds.map((c) => c.name), ...f.namespaces.filter((n) => n.product).map((n) => n.product)])].sort();
  return {
    ...flags,
    industryCloud: clouds.filter((c) => industryIds.includes(c.id)).map((c) => c.name),
    omniChannel: f.misc.signals.serviceChannels + f.misc.signals.routingConfigs > 0,
    cti: f.integration.callCenters.length > 0,
    visualforce: f.ui.vfPages.length > 0,
    aura: f.ui.aura.length > 0,
    legacyAutomation: f.automation.rules.workflowRules + f.automation.rules.processBuilders > 0,
    mobile: f.ui.apps.some((a) => a.formFactors.includes('Small')),
    clouds,
    references: [...new Set(clouds.map((c) => c.reference))].sort(),
    products,
  };
}
