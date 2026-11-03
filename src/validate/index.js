// `tadforce validate`: the gate between a draft and a deliverable.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exists, readText, readYaml } from '../util/fsx.js';
import { TEMPLATES, PKG_ROOT } from '../util/paths.js';
import { loadI18n, templateLang } from '../util/i18n.js';
import { loadFacts } from '../facts/index.js';
import { readComments, reportFor, markDraft } from '../build/render.js';

// Optional modules of the facts layer (absent in older trees): loaded once, skipped when missing.
const optional = async (rel) => {
  const file = path.join(PKG_ROOT, 'src', 'facts', rel);
  if (!exists(file)) return null;
  try { return await import(pathToFileURL(file).href); } catch { return null; }
};
const outlineMod = await optional('outline.js');

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

// Filler that says « something will be written here », in the languages users write in.
const FILLER = new RegExp([
  'to be (?:completed|written|defined|determined|done|added|filled(?: in)?|documented|detailed)', 'coming soon', 'placeholder text', 'insert (?:text|content) here', 'xxx+',
  'à (?:compléter|rédiger|définir|détailler|remplir)', 'en cours de rédaction', 'texte à venir',
  'por (?:completar|definir|redactar|rellenar)', 'a (?:completar|definir|preencher)', 'pendiente de redactar',
  'da (?:completare|definire|scrivere)', 'zu (?:ergänzen|definieren|vervollständigen)', 'folgt in Kürze', 'nog (?:in te vullen|aan te vullen)',
].map((x) => `(?<![\\p{L}\\p{N}_])${x}(?![\\p{L}\\p{N}_])`).join('|'), 'iu');

// count words of COUNT_WORDS → the facts.counts paths their number may equal
const COUNT_PATHS = [
  [/permission set groups?/i, ['security.permissionSetGroups']], [/permission sets?/i, ['security.permissionSets']],
  [/apex classes|classes apex|classes/i, ['apex.classes']], [/triggers?/i, ['apex.triggers']], [/flows?/i, ['flows.active', 'flows.total']],
  [/lwc|lightning web components/i, ['ui.lwc']], [/custom objects|objects?|objets?/i, ['objects.custom']], [/profiles?|profils?/i, ['security.profiles']],
  [/roles?|rôles?/i, ['security.roles']], [/queues?/i, ['security.queues']], [/named credentials?/i, ['integration.namedCredentials']],
  [/integration procedures?/i, ['omni.ipsActive', 'omni.ips']], [/omniscripts?/i, ['omni.scriptsActive', 'omni.scripts']], [/data mappers?/i, ['omni.dataMappers']],
  [/record types?/i, ['recordTypes']], [/custom fields?|champs/i, ['fields.custom']],
];
const countPathsFor = (phrase) => {
  const w = phrase.replace(/^[\d\s,.  ]+(?:active\s+|actives?\s+)?/i, '');
  const e = COUNT_PATHS.find(([re]) => re.test(w));
  return e ? e[1] : [];
};
const countValue = (facts, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), facts.counts);

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
  // entries may be { id, when }: src/facts/outline.js resolves them when present, else ids are kept as is
  const required = outlineMod && typeof outlineMod.requiredAnchors === 'function'
    ? outlineMod.requiredAnchors(doc, facts)
    : ((specs.requiredAnchors && specs.requiredAnchors[doc]) || []).map((a) => (a && typeof a === 'object' ? a.id : a)).filter(Boolean);
  for (const anchor of required) {
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
      // upper-case markers as whole words only: « Método », « todo » (Spanish « all ») are text, not placeholders
      if (/(?<![\p{L}\p{N}_])(TODO|TBD|FIXME)(?![\p{L}\p{N}_])/u.test(line) || /lorem ipsum/i.test(line)) add('error', 'todo', 'Placeholder text left in the document.', where);
      else if (!inCode) {
        const fm = FILLER.exec(line.replace(/<!--[\s\S]*?-->/g, ''));
        if (fm) add('error', 'filler', `"${fm[0].trim()}": filler text — write the content, or remove the sentence.`, where);
      }
      for (const [id, re] of SECRET_PATTERNS) if (re.test(line)) add('error', 'secret', `Possible secret or org identifier (${id}).`, where);
      for (const a of avoid) if (new RegExp(`\\b${escapeRe(a.avoid)}\\b`, 'i').test(line)) add('error', 'terminology', `"${a.avoid}" must be written "${a.use}" (glossary).`, where);
      for (const fk of forbiddenFeatures) if (new RegExp(`\\b${escapeRe(fk.k)}\\b`, 'i').test(line)) add('error', 'decommissioned', `Mentions "${fk.k}" (decommissioned feature: ${fk.feature}).`, where);
      if (inCode || line.trim().startsWith('|') && /^\|[\s|:-]+\|$/.test(line.trim())) return;
      // hard-coded counts next to component words (use {{n:...}} placeholders instead)
      if (!/^\s*```/.test(line)) {
        for (const m of line.replace(/\{\{[^}]+\}\}/g, '').replace(/`[^`]*`/g, '').matchAll(COUNT_WORDS)) {
          const value = Number(m[1].replace(/\D/g, ''));
          if (value < 2) continue;
          // the number IS the count of the facts: it will be wrong after the next retrieve — an error
          const hit = countPathsFor(m[0]).find((cp) => countValue(facts, cp) === value);
          if (hit) add('error', 'hardcoded-count', `"${m[0]}" equals a known count: write {{n:${hit}}} so the figure follows the facts.`, where);
          else add('warn', 'hardcoded-count', `"${m[0]}": use a {{n:…}} placeholder so the figure follows the facts.`, where);
        }
      }
      // identifiers in code font must exist in the inventory, and must not be excluded
      for (const m of line.matchAll(/`([^`\s]{3,80})`/g)) {
        const id = m[1].replace(/\(\)$/, '');
        if (excluded.has(id)) { add('error', 'excluded-component', `\`${id}\` is excluded (knowledge/exclusions.yml) and must not be documented.`, where); continue; }
        if (/[*_]$/.test(id) || /^\*/.test(id)) continue; // naming patterns such as `NWB_*` or `*Service`
        if (!looksLikeComponent(id) || COMMON.has(id) || inventory.has(id)) continue;
        if (/^[\w]+\.[\w]+$/.test(id) && inventory.has(id.split('.')[1])) continue;
        add('warn', 'unknown-component', `\`${id}\` is not in the metadata inventory (${(wsCtx.cfg.scope && wsCtx.cfg.scope.include || []).length ? 'out of the project scope, ' : ''}typo, other org, or package component?).`, where);
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

// ---------------------------------------------------------------- quality gate (0.5)

const KEY_CHAPTERS = { 'ch-functional': 'functional', 'ch-data': 'data', 'ch-application': 'application', 'ch-integration': 'integrations', 'ch-security': 'security' };
const UNREADABLE = new Set(['overlap', 'too-small', 'render-error']);
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
const isRawCode = (s) => !!s && !/\s/.test(String(s).trim()) && (/_/.test(s) || /^[A-Z0-9.-]{2,}$/.test(String(s).trim()));

/** The headings of the document body, with what stands between each one and the next. */
export function sectionsOf(html) {
  const body = (/<article class="doc">([\s\S]*)<\/article>/.exec(html) || [null, html])[1];
  const hs = [...body.matchAll(/<h([1-3]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)];
  return hs.map((m, i) => {
    const end = i + 1 < hs.length ? hs[i + 1].index : body.length;
    const content = body.slice(m.index + m[0].length, end);
    return { lvl: Number(m[1]), id: m[2], title: strip(m[3]).replace(/\s*#$/, ''), content, next: hs[i + 1] ? Number(hs[i + 1][1]) : 0 };
  });
}

// heading anchor of each pending section of the skeletons: specs are matched to the built document through it
const anchorCache = new Map();
function skeletonAnchors(doc, lang) {
  const key = doc + '/' + lang;
  if (anchorCache.has(key)) return anchorCache.get(key);
  const out = {};
  const dir = path.join(TEMPLATES, doc, lang);
  if (exists(dir)) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      let anchor = null;
      for (const line of readText(path.join(dir, f)).split('\n')) {
        const h = /^#{1,3} .*\{[^}]*#([\w-]+)[^}]*\}\s*$/.exec(line);
        if (h) anchor = h[1];
        const p = /<!--\s*tad:pending\s+([\w.-]+)\s*-->/.exec(line);
        if (p && anchor) out[p[1]] = anchor;
      }
    }
  }
  anchorCache.set(key, out);
  return out;
}

async function loadEvaluateWhen() {
  const file = path.join(PKG_ROOT, 'src', 'facts', 'when.js');
  if (!exists(file)) return null;
  try { const m = await import(pathToFileURL(file).href); return typeof m.evaluateWhen === 'function' ? m.evaluateWhen : null; } catch { return null; }
}

/**
 * The quality gate of a built document: validateDocument() plus the checks that make a document
 * worth sending — no empty section, no filler, no section about a module the org does not have,
 * a figure in each key chapter, readable figures (figureQA()), a cover that names the client, the
 * author and the document. When an error remains and `mark` is true (default), the HTML file gets
 * the DRAFT watermark and the draft status.
 *
 * @param ctx           workspace context (loadWorkspace)
 * @param doc           'tad' | 'axes'
 * @param opts.html     path of the built HTML (or its content: then nothing is marked)
 * @param opts.figures  result of figureQA() ({ figures: [...] }) or its array; absent: figures not checked
 * @param opts.report   build report of buildDocument() (found by HTML path when absent)
 * @returns {Promise<{ ok, errors, warnings, score, draft, figures }>}
 */
export async function qualityGate(ctx, doc, { html = null, figures = null, report = null, mark = true } = {}) {
  const isPath = typeof html === 'string' && !/[<\n]/.test(html) && exists(html);
  const htmlText = isPath ? readText(html) : typeof html === 'string' ? html : '';
  report = report || (isPath ? reportFor(html) : null);
  if (!report && isPath) report = { html, problems: [], pending: [...htmlText.matchAll(/class="pending" data-section="([\w.-]+)"/g)].map((m) => m[1]) };
  const base = validateDocument(ctx, doc, { buildReport: report && report.html ? report : null });
  const issues = [...base.errors, ...base.warnings];
  const add = (level, code, message, where) => issues.push({ level, code, message, where });
  const facts = loadFacts(ctx.ws);
  const { cfg } = ctx;
  const { dict } = loadI18n(cfg.language, ctx.ws);

  // code-font identifiers that are not in the metadata are errors in a deliverable
  for (const i of issues) if (i.code === 'unknown-component') i.level = 'error';

  if (htmlText && facts) {
    const sections = sectionsOf(htmlText);
    // empty sections: a heading followed by nothing but a heading of the same or a higher level
    for (const s of sections) {
      const hasContent = strip(s.content) || /<(figure|table|img|svg)\b|class="(kpis|cards|layers|legend|pending)"/.test(s.content);
      if (!hasContent && (s.next === 0 || s.next <= s.lvl)) add('error', 'empty-section', `Section "${s.title}" is empty: write it, or remove the heading.`, `#${s.id}`);
    }
    // key chapters carry at least one figure
    if (doc === 'tad') {
      for (const [id, name] of Object.entries(KEY_CHAPTERS)) {
        const i = sections.findIndex((s) => s.id === id);
        if (i < 0) continue;
        let j = i + 1;
        let content = sections[i].content;
        while (j < sections.length && sections[j].lvl > 1) content += sections[j++].content;
        if (!/<figure\b|class="figcap"/.test(content)) add('error', 'chapter-without-figure', `The ${name} chapter has no figure: add the diagram that explains it (see figure-rules.md).`, `#${id}`);
      }
    }
    // sections whose subject is absent from the org (sections.yml › when:)
    const evaluateWhen = await loadEvaluateWhen();
    if (evaluateWhen) {
      const specs = (readYaml(path.join(TEMPLATES, 'specs', 'sections.yml'), {}).sections) || {};
      const anchors = skeletonAnchors(doc, templateLang(cfg.language));
      const ids = new Set(sections.map((s) => s.id));
      for (const [id, spec] of Object.entries(specs)) {
        if (!spec || !spec.when || (spec.doc && spec.doc !== doc)) continue;
        let on = true;
        try { on = !!evaluateWhen(spec.when, facts); } catch { continue; }
        const anchor = spec.anchor || anchors[id];
        if (!on && anchor && ids.has(anchor)) add('error', 'section-out-of-scope', `Section "${id}" (#${anchor}) is about something this org does not have (when: ${spec.when}): remove it.`, `#${anchor}`);
      }
    }
    // cover: who it is for, by whom, and a real title
    const cover = (/<section class="cover">([\s\S]*?)<\/section>/.exec(htmlText) || [null, ''])[1];
    const client = cfg.client && cfg.client.name;
    if (!client || !String(client).trim()) add('error', 'cover-client', 'The client name is missing (tadforce.config.json › client.name).');
    else if (isRawCode(client) && client === cfg.client.short) add('warn', 'cover-client', `The client name "${client}" looks like a code: write the name the client uses.`);
    if (isRawCode(cfg.document && cfg.document.title)) add('error', 'cover-title', `The document title "${cfg.document.title}" is a code, not a title (tadforce.config.json › document.title).`);
    for (const m of cover.matchAll(/<div><b>([^<]*)<\/b><span>([\s\S]*?)<\/span><\/div>/g)) {
      if (/^\s*(—|–|-)?\s*$/.test(strip(m[2]))) add('error', 'cover-empty-field', `Cover field "${m[1]}" is empty or « — »: fill it in tadforce.config.json, or leave the value out.`);
    }
  }

  // figures: what the visual QA measured in the page
  const figs = Array.isArray(figures) ? figures : figures && Array.isArray(figures.figures) ? figures.figures : null;
  if (figs) {
    for (const f of figs) {
      for (const i of f.issues || []) {
        const where = f.png ? path.relative(ctx.project || process.cwd(), f.png) : `#${f.id}`;
        const name = `Figure ${f.n}${f.caption ? ` (${String(f.caption).slice(0, 70)})` : ''}`;
        if (UNREADABLE.has(i.code)) add('error', 'figure-unreadable', `${name}: ${i.code} — ${i.detail}. Look at the PNG and simplify the figure.`, where);
        else add('warn', 'figure-' + i.code, `${name}: ${i.detail}`, where);
      }
    }
  }

  const out = summarize(issues);
  out.figures = figs ? figs.length : null;
  out.draft = !out.ok;
  if (!out.ok && mark && isPath) markDraft(html, dict, { errors: out.errors.length });
  if (report) report.draft = out.draft;
  return out;
}
