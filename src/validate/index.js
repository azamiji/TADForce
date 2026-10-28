// `tadforce validate`: the gate between a draft and a deliverable.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readText, readYaml } from '../util/fsx.js';
import { TEMPLATES } from '../util/paths.js';
import { loadFacts } from '../facts/index.js';
import { readComments } from '../build/render.js';

// Identifiers that look like metadata names but are Salesforce vocabulary, not components.
const COMMON = new Set(('Account Contact Lead Opportunity Case Task Event User Group Campaign CampaignMember Asset Contract Order Product2 Pricebook2 Individual Profile PermissionSet ' +
  'RecordType ContentDocument ContentVersion Attachment Note FeedItem EmailMessage OpportunityLineItem Quote AccountContactRelation Organization Id Name OwnerId CreatedDate ' +
  'LastModifiedDate RecordTypeId Status Type ApexClass ApexTrigger Flow FlowDefinition LWC Aura Visualforce Batchable Queueable Schedulable Database Stateful HttpRequest ' +
  'HttpResponse Http AuraEnabled InvocableMethod RestResource future isTest with without inherited sharing USER_MODE SECURITY_ENFORCED SYSTEM_MODE true false null ' +
  'before after insert update delete undelete Trigger System Schema Test Limits Messaging Platform Event Lookup MasterDetail Hierarchy Picklist Text Number Date DateTime ' +
  'Checkbox Formula Currency Percent Email Phone Url TextArea LongTextArea Html Master Detail Private Public Read ReadWrite ControlledByParent FullAccess None All ' +
  'RecordPage AppPage HomePage UtilityBar Console Standard Large Small lightning__RecordPage lightning__AppPage lightning__HomePage lightning__FlowScreen lightning__Tab ' +
  'Active Draft Obsolete Inactive OAuth JWT SAML OpenIdConnect REST SOAP JSON XML CSV HTTPS HTTP GET POST PUT PATCH DELETE SOQL SOSL DML API CRUD FLS OWD PSG CMDT CDC ' +
  'Named External Credential Credentials Remote Site Settings CSP CORS SSO MFA IP UI ID ' +
  // standard objects, fields and Apex types frequently quoted in architecture documents
  'ContentDocumentLink ContentWorkspace ContentNote EmailTemplate OrgWideEmailAddress PermissionSetAssignment PermissionSetGroup GroupMember UserRole UserLicense ' +
  'FederationIdentifier ProfileId UserRoleId IsActive IsConverted ConvertedAccountId ConvertedOpportunityId WhatId WhoId ParentId ActivityDate StageName CloseDate ' +
  'AccountShare OpportunityShare LeadShare CaseShare ServiceAppointment WorkOrder AgentWork PendingServiceRouting ServiceChannel QueueRoutingConfig PresenceUserConfig ' +
  'AuraHandledException DmlException QueryException CalloutException HttpCalloutMock StubProvider WebServiceMock Callable Comparable Iterable Iterator ' +
  'TriggerOperation EventBus QueueableContext SchedulableContext BatchableContext RestContext RestRequest RestResponse JSONGenerator JSONParser Crypto EncodingUtil ' +
  'ScheduledJob CronTrigger AsyncApexJob ApexClass ApexPage FlowInterview PlatformEventSubscriberConfig OmniProcess OmniDataTransform OmniUiCard').split(/\s+/));

const SECRET_PATTERNS = [
  ['private-key', /-----BEGIN (RSA |EC |)PRIVATE KEY-----/],
  ['bearer-token', /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}/],
  ['sf-session-id', /\b00D[A-Za-z0-9]{12,15}![A-Za-z0-9._]{20,}/],
  ['org-id', /\b00D[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b/],
  ['client-secret', /client[_-]?secret\s*[:=]\s*['"]?[A-Za-z0-9]{12,}/i],
  ['password', /\bpassword\s*[:=]\s*['"]?[^\s'"]{6,}/i],
  ['api-key', /\b(sk|pk)_(live|test)_[A-Za-z0-9]{16,}/],
];

const COUNT_WORDS = /\b(\d{1,3}(?:[ ,.  ]\d{3})*|\d+)\s+(?:active\s+|actives?\s+)?(apex classes|classes apex|classes|triggers?|flows?|lwc|lightning web components|objects?|objets?|custom objects|permission sets?|permission set groups?|profiles?|profils?|roles?|rôles?|queues?|named credentials?|integration procedures?|omniscripts?|data mappers?|record types?|custom fields?|champs)\b/gi;

/**
 * Validate the Markdown sources of a document (and its last build output when present).
 * Returns { errors, warnings, score }.
 */
export function validateDocument(wsCtx, doc, { buildReport = null } = {}) {
  const issues = [];
  const add = (level, codeId, message, where) => issues.push({ level, code: codeId, message, where });
  const facts = loadFacts(wsCtx.ws);
  if (!facts) { add('error', 'no-facts', 'facts/facts.json is missing: run `tadforce facts`.'); return summarize(issues); }
  const srcDir = wsCtx.p('src', doc);
  if (!exists(srcDir)) { add('error', 'no-sources', `src/${doc} is missing: run \`tadforce scaffold --doc ${doc}\`.`); return summarize(issues); }
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort();
  const glossary = wsCtx.glossary() || {};
  const knowledge = wsCtx.exclusions() || {};
  // glossary.yml › allow: technical terms quoted on purpose (API payload fields, external identifiers…)
  const inventory = new Set([...facts.inventory, ...((glossary.allow || []).map(String))]);
  const excluded = new Set((facts.exclusions.applied || []).map((x) => x.name));
  const avoid = (glossary.terms || []).flatMap((x) => (x.avoid || []).map((a) => ({ avoid: a, use: x.use || x.term })));
  const forbiddenFeatures = (knowledge.features || []).flatMap((f) => (f.keywords || []).map((k) => ({ k, feature: f.name })));

  // required sections of the skeleton must still exist (by explicit id)
  const specs = readYaml(path.join(TEMPLATES, 'specs', 'sections.yml'), {});
  const all = files.map((f) => ({ f, text: readText(path.join(srcDir, f)) }));
  const joined = all.map((x) => x.text).join('\n');
  for (const anchor of (specs.requiredAnchors && specs.requiredAnchors[doc]) || []) {
    if (!new RegExp(`\\{[^}]*#${anchor}[\\s}]`).test(joined)) add('error', 'missing-section', `Required section #${anchor} was removed from the skeleton.`);
  }

  for (const { f, text } of all) {
    const lines = text.split('\n');
    let inCode = false;
    lines.forEach((line, i) => {
      const where = `src/${doc}/${f}:${i + 1}`;
      if (line.startsWith('```')) inCode = !inCode;
      const pend = /<!--\s*tad:pending\s+([\w.-]+)\s*-->/.exec(line);
      // sections inside a false <!-- tad:if --> block are not part of this org's document
      if (pend && (!buildReport || buildReport.pending.includes(pend[1]))) add('error', 'pending', `Section "${pend[1]}" is not written yet.`, where);
      if (/\bTODO\b|\bTBD\b|lorem ipsum/i.test(line)) add('error', 'todo', 'Placeholder text left in the document.', where);
      for (const [id, re] of SECRET_PATTERNS) if (re.test(line)) add('error', 'secret', `Possible secret or org identifier (${id}).`, where);
      for (const a of avoid) if (new RegExp(`\\b${escapeRe(a.avoid)}\\b`, 'i').test(line)) add('error', 'terminology', `"${a.avoid}" must be written "${a.use}" (glossary).`, where);
      for (const fk of forbiddenFeatures) if (new RegExp(`\\b${escapeRe(fk.k)}\\b`, 'i').test(line)) add('error', 'decommissioned', `Mentions "${fk.k}" (decommissioned feature: ${fk.feature}).`, where);
      if (inCode || line.trim().startsWith('|') && /^\|[\s|:-]+\|$/.test(line.trim())) return;
      // hard-coded counts next to component words (use {{n:...}} placeholders instead)
      if (!/^\s*```/.test(line)) {
        for (const m of line.replace(/\{\{[^}]+\}\}/g, '').replace(/`[^`]*`/g, '').matchAll(COUNT_WORDS)) {
          if (Number(m[1].replace(/\D/g, '')) >= 2) add('warn', 'hardcoded-count', `"${m[0]}": use a {{n:…}} placeholder so the figure follows the facts.`, where);
        }
      }
      // identifiers in code font must exist in the inventory, and must not be excluded
      for (const m of line.matchAll(/`([^`\s]{3,80})`/g)) {
        const id = m[1].replace(/\(\)$/, '');
        if (excluded.has(id)) { add('error', 'excluded-component', `\`${id}\` is excluded (knowledge/exclusions.yml) and must not be documented.`, where); continue; }
        if (/[*_]$/.test(id) || /^\*/.test(id)) continue; // naming patterns such as `NWB_*` or `*Service`
        if (!looksLikeComponent(id) || COMMON.has(id) || inventory.has(id)) continue;
        if (/^[\w]+\.[\w]+$/.test(id) && inventory.has(id.split('.')[1])) continue;
        add('warn', 'unknown-component', `\`${id}\` is not in the metadata inventory (typo, other org, or package component?).`, where);
      }
    });
    if (inCode) add('error', 'unclosed-code', 'Unclosed code fence.', `src/${doc}/${f}`);
  }

  if (buildReport) {
    for (const p of buildReport.problems) add(p.level === 'warn' ? 'warn' : 'error', p.code, p.message);
    const html = readText(buildReport.html);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/href="#([^"]+)"/g)) if (!ids.has(decodeURIComponent(m[1]))) add('error', 'broken-anchor', `Link to #${m[1]} has no target.`);
    const open = readComments(html).filter((c) => c.status !== 'resolved');
    if (open.length) add('warn', 'open-comments', `${open.length} review comment(s) still open.`);
  }
  return summarize(issues);
}

function looksLikeComponent(id) {
  if (/__(c|mdt|e|x|b|r)$/.test(id)) return true;
  if (/^[A-Z][A-Za-z0-9]*_[A-Za-z0-9_]+$/.test(id)) return true;
  if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(id) && id.length > 5) return true;
  if (/^[A-Z][a-z0-9]+([A-Z][a-z0-9]+){1,}$/.test(id) && id.length > 8) return true;
  return false;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function summarize(issues) {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level !== 'error');
  const score = Math.max(0, 100 - errors.length * 5 - warnings.length);
  return { ok: errors.length === 0, errors, warnings, score };
}
