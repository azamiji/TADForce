// Which Salesforce products this org uses, from evidence in the metadata only.
// Each detected cloud maps to a reference in skills/tadforce/references/modules/ and to
// conditional sections of the skeletons (<!-- tad:if modules.<flag> -->).
//
// Evidence has a strength. A flag (modules.<id>) is true only with STRONG evidence: something the project built
// or switched on (an active site, a non-default routing configuration, custom fields on the product's objects,
// a referenced namespace…). Weak evidence (an inactive site, a channel the platform creates, a page on a standard
// object, a package installed but never referenced) leaves the flag false and is kept in modules.weak for the
// Improvement Axes: « enabled, apparently unused ».

const strong = (what) => ({ what, strength: 'strong' });
const weak = (what) => ({ what, strength: 'weak' });
const named = (f, folder) => (f.misc.named && f.misc.named[folder]) || [];
const folder = (f, k) => (f.misc.folders && f.misc.folders[k]) || 0;

/** Experience Cloud: an active network or site, an Experience bundle, Experience bundle metadata switched on. */
function experienceEvidence(f) {
  const x = f.misc.experience || {};
  const out = [];
  for (const n of x.networks || []) out.push((n.status || 'Live') === 'Live' ? strong(`network ${n.name} (Live)`) : weak(`network ${n.name} (${n.status})`));
  for (const s of x.sites || []) {
    const kind = /ChatterNetwork/i.test(s.type || '') ? 'Experience site' : 'Salesforce Site';
    out.push(s.active ? strong(`${kind} ${s.name} (active)`) : weak(`${kind} ${s.name} (inactive)`));
  }
  for (const b of x.bundles || []) out.push(/^sfdc/i.test(b) ? weak(`Experience bundle ${b} (shipped by Salesforce)`) : strong(`Experience bundle ${b}`));
  if (x.bundleMetadata) out.push(strong('Experience bundle metadata enabled (ExperienceBundle settings)'));
  if (x.networksEnabled && !out.some((e) => e.strength === 'strong')) out.push(weak('Digital Experiences enabled, no active site'));
  return out;
}

// a channel named after the standard object it routes is the one the setup creates: weak on its own
const ENTITY_CHANNEL = /^(Case|Cases|Lead|Leads|LiveChatTranscript|MessagingSession|VoiceCall|Chat|Messaging|Phone)$/i;

/** Omni-Channel: a service channel, routing configuration or presence status of the project, a queue routed by Omni-Channel, AgentWork in code or flows. */
function omniEvidence(f, refs) {
  const out = [];
  for (const n of named(f, 'serviceChannels')) out.push(ENTITY_CHANNEL.test(n) ? weak(`service channel ${n} (default name)`) : strong(`service channel ${n}`));
  for (const n of named(f, 'queueRoutingConfigs')) out.push(strong(`routing configuration ${n}`));
  for (const n of named(f, 'servicePresenceStatuses')) out.push(strong(`presence status ${n}`));
  for (const q of f.security.queues || []) if (q.routing) out.push(strong(`queue ${q.name} routed by ${q.routing}`));
  for (const n of named(f, 'presenceUserConfigs')) out.push(weak(`presence configuration ${n}`));
  const tokens = (refs && refs.usageTokens) || new Set();
  for (const t of ['AgentWork', 'PendingServiceRouting', 'UserServicePresence']) if (tokens.has(t)) out.push(strong(`${t} used in code, flows or components`));
  return out;
}

/** CTI: call centers (Salesforce's demo adapters are set aside as shipped). */
const ctiEvidence = (f) => (f.integration.callCenters || []).map((c) => strong(`call center ${c.name}${c.type === 'contact-center' ? ' (Service Cloud Voice)' : ''}`));

/**
 * Evidence rules. `objects`: standard objects whose use signals the product; `ns`: managed package namespaces;
 * `psg`: permission set (group) names whose assigned users prove the product is used; `test`: other evidence.
 */
const CLOUDS = [
  { id: 'salesCloud', name: 'Sales Cloud', ref: 'sales-cloud', objects: ['Opportunity', 'Lead', 'Quote', 'Forecasting', 'Territory2', 'OpportunityLineItem', 'ActionCadence'],
    test: (f) => [...(folder(f, 'territory2Models') ? [strong('territory models')] : []), ...(folder(f, 'forecastingTypes') ? [weak('forecast types')] : [])] },
  { id: 'serviceCloud', name: 'Service Cloud', ref: 'service-cloud', objects: ['Case', 'Entitlement', 'ServiceContract', 'MessagingSession', 'LiveChatTranscript', 'VoiceCall', 'CaseMilestone'],
    test: (f, refs) => [
      ...(f.misc.signals.entitlementProcesses > 0 ? [strong('entitlement processes')] : []),
      ...f.data.objects.filter((o) => o.name.endsWith('__kav')).map((o) => strong(`knowledge ${o.name}`)),
      ...omniEvidence(f, refs).filter((e) => /^service channel/.test(e.what)),
    ] },
  { id: 'fieldService', name: 'Field Service', ref: 'field-service', ns: ['FSL'], objects: ['WorkOrder', 'ServiceAppointment', 'ServiceTerritory', 'ServiceResource', 'WorkOrderLineItem', 'MaintenancePlan'] },
  { id: 'experienceCloud', name: 'Experience Cloud', ref: 'experience-cloud', test: experienceEvidence },
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
  { id: 'omnistudio', name: 'OmniStudio', ref: 'omnistudio', ns: ['omnistudio', 'vlocity_cmt', 'vlocity_ins', 'vlocity_ps'],
    test: (f) => Object.entries(f.automation.omnistudio).filter(([, l]) => l.length > 0).map(([k, l]) => strong(`${l.length} ${k}`)) },
  { id: 'dataCloud', name: 'Data Cloud', ref: 'data-cloud',
    test: (f) => [
      ...(f.misc.signals.dataStreams > 0 || folder(f, 'dataStreamDefinitions') > 0 ? [strong('data streams')] : []),
      ...(folder(f, 'dataSourceObjects') > 0 ? [strong('data source objects')] : []),
      // the standard data model objects (ssot__…__dlm) come with the provisioning: only the project's own count
      ...f.data.objects.filter((o) => /__(dlm|dll)$/.test(o.name)).map((o) => (/^ssot__/i.test(o.name) ? weak(`standard data model object ${o.name}`) : strong(`data model object ${o.name}`))),
    ] },
  { id: 'agentforce', name: 'Agentforce / Einstein', ref: 'agentforce-ai', psg: /Agentforce|Copilot|EinsteinGPT|GenAI|Einstein_?Agent/i,
    test: (f) => [
      ...named(f, 'bots').map((n) => strong(`bot ${n}`)),
      ...['genAiPlanners', 'genAiPlannerBundles', 'genAiPlugins', 'genAiFunctions', 'aiAuthoringBundles', 'genAiPromptTemplates'].flatMap((k) => named(f, k).map((n) => strong(`${k.replace(/s$/, '')} ${n}`))),
      ...(folder(f, 'mlPredictionDefinitions') > 0 ? [strong('prediction definitions')] : []),
    ] },
  { id: 'crmAnalytics', name: 'CRM Analytics', ref: 'analytics', ns: ['wave'], test: (f) => ['wave', 'waveDashboards', 'waveDataflows', 'waveRecipes', 'waveApplications', 'waveDatasets'].filter((k) => folder(f, k) > 0).map((k) => strong(`${k} metadata`)) },
  { id: 'shield', name: 'Shield (encryption, event monitoring, audit)', ref: 'security-shield',
    test: (f) => [
      ...((f.misc.signals.transactionPolicies ?? folder(f, 'transactionSecurityPolicies')) > 0 ? [strong('transaction security policies')] : []),
      ...(folder(f, 'eventSubscriptions') > 0 ? [strong('event subscriptions')] : []),
      ...((f.misc.signals.platformEncryption || 0) > 0 ? [strong('platform encryption switched on')] : []),
    ] },
  { id: 'slack', name: 'Slack integration', ref: 'integration-platforms', ns: ['slackv2', 'slack'], test: (f) => (folder(f, 'slackApps') > 0 ? [strong('Slack apps')] : []) },
  { id: 'events', name: 'Platform Events / Change Data Capture', ref: 'platform-events',
    test: (f) => [...f.data.objects.filter((o) => o.kind === 'platformEvent').map((o) => strong(`platform event ${o.name}`)), ...(f.data.cdc.length ? [strong('change data capture')] : [])] },
];

/**
 * Standard objects as evidence: extended (custom fields, record types, rules) or automated (trigger, flow) is
 * strong; only a Lightning page or a queue on it is weak (pages and queues come with many setups).
 */
function standardUse(f) {
  const strongSet = new Set(), weakSet = new Set();
  for (const o of f.data.objects) if (o.kind === 'standard' && (o.customFields > 0 || o.recordTypes.length || o.validationRules.length)) strongSet.add(o.name);
  for (const t of f.apex.triggers) if (t.object) strongSet.add(t.object);
  for (const fl of f.automation.flows) if (fl.object) strongSet.add(fl.object);
  for (const p of f.ui.flexipages) if (p.object) weakSet.add(p.object);
  for (const q of f.security.queues) q.objects.forEach((x) => weakSet.add(x));
  return { strongSet, weakSet };
}

/** Users assigned to the product's permission set groups or permission sets (aggregated org facts). */
function userEvidence(c, org) {
  if (!c.psg || !org) return [];
  const out = [];
  for (const g of org.psgAssignments || []) if (c.psg.test(String(g.group)) && g.users > 0) out.push(strong(`permission set group ${g.group} (${g.users} users)`));
  for (const p of org.usersByPermissionSet || []) if (c.psg.test(String(p.permissionSet)) && p.users > 0) out.push(strong(`permission set ${p.permissionSet} (${p.users} users)`));
  return out;
}

const dedupe = (list) => {
  const seen = new Map();
  for (const e of list) if (!seen.has(e.what) || (e.strength === 'strong' && seen.get(e.what).strength === 'weak')) seen.set(e.what, e);
  return [...seen.values()];
};

/**
 * @param f     facts (after the Salesforce-shipped components and the exclusions are set aside)
 * @param org   org facts (users per permission set group / permission set), or null
 * @param refs  { usageTokens }: names read by code, flows and components (AgentWork…)
 */
export function detectModules(f, org = null, refs = {}) {
  const ns = new Map(f.namespaces.map((n) => [n.namespace, n]));
  const { strongSet, weakSet } = standardUse(f);
  const clouds = [];
  const flags = {};
  const evidence = {};
  const weakOnes = [];
  const record = (id, name, reference, items) => {
    const list = dedupe(items);
    const on = list.some((e) => e.strength === 'strong');
    flags[id] = on;
    if (list.length) evidence[id] = list.slice(0, 8);
    if (!on && list.length) weakOnes.push({ id, name, reference, evidence: list.slice(0, 8) });
    return { on, list };
  };
  for (const c of CLOUDS) {
    const items = [];
    for (const n of c.ns || []) {
      const x = ns.get(n);
      if (!x) continue;
      items.push(x.references > 0 ? strong(`namespace ${n}`) : weak(`namespace ${n} (package installed, never referenced)`));
    }
    for (const o of c.objects || []) {
      if (strongSet.has(o)) items.push(strong(`object ${o}`));
      else if (weakSet.has(o)) items.push(weak(`object ${o} (page or queue only)`));
    }
    if (c.test) items.push(...c.test(f, refs));
    items.push(...userEvidence(c, org));
    const { on, list } = record(c.id, c.name, c.ref, items);
    // clouds[].evidence keeps the vocabulary of the products table (namespace X, object X, metadata, permission
    // set…: translated by the renderer); the detail is in modules.evidence.<id>
    const short = (w) => (/^(namespace|object) \S+$/.test(w) || /^permission set/.test(w) ? w : 'metadata');
    if (on) clouds.push({ id: c.id, name: c.name, reference: c.ref, evidence: [...new Set(list.filter((e) => e.strength === 'strong').map((e) => short(e.what)))].slice(0, 6) });
  }
  record('omniChannel', 'Omni-Channel', 'service-cloud', omniEvidence(f, refs));
  record('cti', 'CTI / call centers', 'service-cloud', ctiEvidence(f));
  const industryIds = ['financialServices', 'insurance', 'healthCloud', 'lifeSciences', 'manufacturing', 'automotive', 'consumerGoods', 'communications', 'publicSector', 'education', 'nonprofit', 'loyalty', 'netZero'];
  const products = [...new Set([...clouds.map((c) => c.name), ...f.namespaces.filter((n) => n.product).map((n) => n.product)])].sort();
  return {
    ...flags,
    industryCloud: clouds.filter((c) => industryIds.includes(c.id)).map((c) => c.name),
    visualforce: f.ui.vfPages.length > 0,
    aura: f.ui.aura.length > 0,
    legacyAutomation: f.automation.rules.workflowRules + f.automation.rules.processBuilders > 0,
    mobile: f.ui.apps.some((a) => a.formFactors.includes('Small')),
    clouds,
    references: [...new Set(clouds.map((c) => c.reference))].sort(),
    products,
    evidence,
    weak: weakOnes,
  };
}
