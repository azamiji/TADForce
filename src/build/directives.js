// Deterministic content generated from facts: appendices, ERDs, figures, KPI tiles, placeholders.
import path from 'node:path';
import { t, formatNumber, formatDate } from '../util/i18n.js';
import { exists, readText } from '../util/fsx.js';
import { contextView, contextMermaid, layersBlock, rolesTree, rolesMermaid, legendHtml, figureHtml, esc } from './figures.js';
import { erdModel, erdSvg, erdMermaid, erdTextPx, erdClusters, ERD_MAX } from './erd.js';
import { QA } from './figqa.js';
import { sequenceCode, stateCode } from './diagrams.js';

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const code = (v) => (v ? '`' + String(v).replace(/`/g, '') + '`' : '—');
const list = (xs, n = 8, dict) => (xs.length > n ? xs.slice(0, n).map(code).join(', ') + ' ' + t(dict, 'annex.more', { n: xs.length - n }) : xs.map(code).join(', ') || '—');

export function mdTable(headers, rows) {
  if (!rows.length) return '';
  return ['| ' + headers.map(cell).join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.map(cell).join(' | ') + ' |')].join('\n');
}

/** Read a dotted path from an object: get(facts, 'counts.apex.classes'). */
export function get(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Counts the facts could not collect (facts.coverageByCount[path] === 'missing'): never printed as 0.
 * Paths are those of {{n:…}}, relative to facts.counts (`apex.classes`); `counts.apex.classes` works too.
 */
export function countMissing(facts, p) {
  const cov = facts && facts.coverageByCount;
  if (!cov) return false;
  const k = String(p).replace(/^counts\./, '');
  return cov[k] === 'missing' || cov['counts.' + k] === 'missing';
}

/** A configured value that says nothing (empty, a dash, « none ») is treated as absent. */
export const present = (v) => (v == null || /^\s*(—|–|-|none|n\/a|null)?\s*$/i.test(String(v)) ? null : v);

const truthy = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v);

/** <!-- tad:if modules.omnistudio --> … <!-- tad:else --> … <!-- tad:endif --> (nestable, `!` negates). */
export function resolveConditionals(text, scope) {
  const out = [];
  const stack = [];
  for (const line of text.split('\n')) {
    // paths may name annex families with hyphens: facts.annexes.named-credentials.count
    const mIf = /^\s*<!--\s*tad:if\s+(!?)([\w.|-]+)\s*-->\s*$/.exec(line);
    const mElse = /^\s*<!--\s*tad:else\s*-->\s*$/.test(line);
    const mEnd = /^\s*<!--\s*tad:endif\s*-->\s*$/.test(line);
    const active = stack.every((s) => s.on);
    if (mIf) {
      let v = mIf[2].split('|').some((p) => truthy(get(scope, p)));
      if (mIf[1]) v = !v;
      stack.push({ on: v, parentOn: active });
      continue;
    }
    if (mElse && stack.length) { const s = stack[stack.length - 1]; s.on = !s.on; continue; }
    if (mEnd && stack.length) { stack.pop(); continue; }
    if (active) out.push(line);
  }
  return out.join('\n');
}

export function resolveIncludes(text, baseDir) {
  return text.replace(/^@@INCLUDE:(.+?)@@[ \t]*$/gm, (m, rel) => {
    const p = path.resolve(baseDir, rel.trim());
    if (!exists(p)) return `> [!WARN]\n> Missing include: \`${rel}\``;
    const content = readText(p);
    return /\.svg$/i.test(p) ? '<div class="fig-body hand">' + content.replace(/\n\n/g, '\n') + '</div>' : content;
  });
}

/** {{n:path}} numbers (from counts, then facts), {{v:path}} raw values, {{cfg:path}} configuration. */
export function resolveValues(text, ctx, problems) {
  return text.replace(/\{\{(n|v|cfg):([\w.-]+)\}\}/g, (m, kind, p) => {
    const src = kind === 'cfg' ? ctx.cfg : ctx.facts;
    if (kind === 'n' && countMissing(ctx.facts, p)) {
      problems.push({ level: 'warn', code: 'count-not-collected', message: `${m} was not collected from the org: the document says « ${t(ctx.dict, 'ui.notCollected')} ». Collect it (tadforce facts --org) or rewrite the sentence.` });
      return `<span class="nc">${esc(t(ctx.dict, 'ui.notCollected'))}</span>`;
    }
    let v = kind === 'n' ? (get(ctx.facts.counts, p) ?? get(ctx.facts, p)) : get(src, p);
    if (kind === 'n' && Array.isArray(v)) v = v.length;
    if (v === undefined || v === null || v === '') {
      problems.push({ level: 'error', code: 'unknown-placeholder', message: kind === 'cfg' && get(ctx.cfg, p) !== undefined ? `${m} is empty in tadforce.config.json: fill it, or put the sentence inside <!-- tad:if cfg.${p} -->` : `Unknown placeholder ${m}` });
      return `⟨${m.slice(2, -2)}⟩`;
    }
    if (kind === 'cfg' && /date$/i.test(p)) return formatDate(v, ctx.lang);
    return kind === 'n' && typeof v === 'number' ? formatNumber(v, ctx.lang) : String(v);
  });
}

// ---------------------------------------------------------------- appendices
function annexes(ctx) {
  const { facts: f, dict, cfg, glossary } = ctx;
  const A = (k) => t(dict, 'annex.' + k);
  const yes = A('yes'), no = A('no');
  const kindsLabel = (ks) => ks.filter((k) => dict.kinds[k]).map((k) => dict.kinds[k]).join(', ') || '—';
  const local = f.data.objects.filter((o) => !o.namespace);
  const nc = t(dict, 'ui.notCollected');
  // a count that was not collected reads « not collected », never 0
  const n = (x, p) => (p && countMissing(f, p) ? nc : formatNumber(x, ctx.lang));
  const n2 = (a, pa, b, pb) => (countMissing(f, pa) && countMissing(f, pb) ? nc : `${n(a, pa)} / ${n(b, pb)}`);
  return {
    'doc-control': () => mdTable([t(dict, 'control.element'), t(dict, 'control.value')], [
      [t(dict, 'control.title'), `${ctx.docName || t(dict, 'meta.docName')} — ${cfg.document.title}`],
      [t(dict, 'control.reference'), ctx.doc === 'axes' ? cfg.document.reference + '-AX' : cfg.document.reference],
      [t(dict, 'control.client'), cfg.client.name],
      ...(present(cfg.integrator.name) ? [[t(dict, 'control.integrator'), cfg.integrator.name]] : []),
      ...(present(cfg.document.author) ? [[t(dict, 'control.preparedBy'), cfg.document.author]] : []),
      // the status lives in a span: a document that fails the quality gate gets the draft status there
      [t(dict, 'control.version'), `${cfg.document.version}<span class="doc-status">${present(cfg.document.status) ? ' — ' + esc(cfg.document.status) : ''}</span>`],
      [t(dict, 'control.date'), formatDate(cfg.document.date, ctx.lang)],
      [t(dict, 'control.classification'), ctx.doc === 'axes' ? t(dict, 'doc.axesKicker') : cfg.document.classification],
      [t(dict, 'control.scope'), t(dict, cfg.source && cfg.source.mode === 'local' ? 'control.scopeValueLocal' : 'control.scopeValue', { environment: cfg.document.environment, client: cfg.client.name, date: formatDate(cfg.document.date, ctx.lang) })
        + (cfg.scope && (cfg.scope.include || []).length ? ' — ' + t(dict, 'control.scopeLimited', { scope: cfg.scope.label || cfg.scope.include.join(', ') }) : '')],
    ]),
    'version-history': () => {
      // no author anywhere: the column is left out (never a column of « — »)
      const rows = cfg.document.history && cfg.document.history.length ? cfg.document.history : [{ version: cfg.document.version, date: cfg.document.date, author: [present(cfg.document.author), present(cfg.integrator.name)].filter(Boolean).join(' — '), purpose: t(dict, 'control.firstVersion', { client: cfg.client.name }) }];
      const withAuthor = rows.some((h) => present(h.author));
      return mdTable([t(dict, 'control.version'), t(dict, 'control.date'), ...(withAuthor ? [t(dict, 'control.author')] : []), t(dict, 'control.purpose')],
        rows.map((h) => [h.version, formatDate(h.date, ctx.lang), ...(withAuthor ? [present(h.author) || ''] : []), h.purpose]));
    },
    legend: () => legendHtml(dict),
    'key-figures': () => {
      const k = f.counts;
      return mdTable([A('domain'), A('count')], [
        [t(dict, 'keyfig.apps'), n(k.ui.apps, 'ui.apps')], [t(dict, 'keyfig.pages'), n(k.ui.flexipages, 'ui.flexipages')], [t(dict, 'keyfig.lwc'), n(k.ui.lwc, 'ui.lwc')],
        ...(k.ui.aura ? [[t(dict, 'keyfig.aura'), n(k.ui.aura, 'ui.aura')]] : []), ...(k.ui.vfPages ? [[t(dict, 'keyfig.vf'), n(k.ui.vfPages, 'ui.vfPages')]] : []),
        [t(dict, 'keyfig.classes'), n(k.apex.classes, 'apex.classes')], [t(dict, 'keyfig.tests'), n(k.apex.tests, 'apex.tests')], [t(dict, 'keyfig.triggers'), n(k.apex.triggers, 'apex.triggers')],
        [t(dict, 'keyfig.flows'), n2(k.flows.active, 'flows.active', k.flows.total, 'flows.total')],
        ...(f.modules.omnistudio ? [[t(dict, 'keyfig.os'), n(k.omni.scriptsActive, 'omni.scriptsActive')], [t(dict, 'keyfig.ips'), n(k.omni.ipsActive, 'omni.ipsActive')], [t(dict, 'keyfig.dms'), n(k.omni.dataMappers, 'omni.dataMappers')]] : []),
        [t(dict, 'keyfig.objects'), n(k.objects.custom, 'objects.custom')], [t(dict, 'keyfig.fields'), n(k.fields.custom, 'fields.custom')], [t(dict, 'keyfig.cmdt'), n2(k.cmdt.types, 'cmdt.types', k.cmdt.records, 'cmdt.records')],
        [t(dict, 'keyfig.psg'), n2(k.security.permissionSetGroups, 'security.permissionSetGroups', k.security.permissionSets, 'security.permissionSets')], [t(dict, 'keyfig.roles'), n(k.security.roles, 'security.roles')],
        [t(dict, 'keyfig.nc'), n2(k.integration.namedCredentials, 'integration.namedCredentials', k.integration.externalCredentials, 'integration.externalCredentials')], [t(dict, 'keyfig.rest'), n(k.integration.restResources, 'integration.restResources')],
        [t(dict, 'keyfig.reports'), n2(k.misc.reports, 'misc.reports', k.misc.dashboards, 'misc.dashboards')],
      ]);
    },
    products: () => mdTable([A('product'), A('evidence')], [
      ...f.modules.clouds.map((x) => [x.name, x.evidence.map((e) => (e === 'metadata' ? A('evMetadata') : e.replace(/^(namespace|object) (.+)$/, (m0, k, v) => A(k === 'namespace' ? 'evNamespace' : 'evObject') + ' ' + code(v)))).join(', ')]),
      ...(f.modules.omniChannel && !f.modules.clouds.some((x) => x.id === 'serviceCloud') ? [['Omni-Channel', `${f.misc.signals.serviceChannels} service channels`]] : []),
      ...(f.modules.cti ? [['CTI / call centers', f.integration.callCenters.map((x) => code(x.name)).join(', ')]] : []),
      ...f.namespaces.filter((x) => !f.modules.clouds.some((cl) => cl.evidence.includes('namespace ' + x.namespace))).map((x) => [x.product || A('managed'), `${code(x.namespace)} · ${n(x.references)} references${x.installed ? ', installed package' : ''}`]),
    ]),
    naming: () => mdTable([A('family'), A('convention'), A('examples')], [
      ...f.naming.apex.suffixes.map((s) => ['Apex', `*${s.value}`, n(s.count)]),
      ...['apex', 'triggers', 'lwc', 'flows', 'objects', 'permissionSets'].flatMap((k) => f.naming[k].prefixes.map((p) => [k === 'apex' ? 'Apex' : k === 'lwc' ? 'LWC' : k[0].toUpperCase() + k.slice(1), `${p.value}*`, n(p.count)])),
    ]),
    objects: () => mdTable([A('apiName'), A('label'), A('owd'), A('fields'), A('recordTypes'), A('relations'), A('description')],
      local.filter((o) => o.kind === 'custom').map((o) => [code(o.name), o.label || '—', `${o.sharingModel || '—'} / ${o.externalSharingModel || '—'}`, o.customFields, o.recordTypes.length, o.relations.length, o.description || '—'])),
    'standard-objects': () => mdTable([A('apiName'), A('fields'), A('recordTypes'), A('owd')],
      local.filter((o) => o.kind === 'standard' && (o.customFields > 0 || o.recordTypes.length)).map((o) => [code(o.name), o.customFields, o.recordTypes.length, `${o.sharingModel || '—'} / ${o.externalSharingModel || '—'}`])),
    'external-ids': () => mdTable([A('object'), A('field')], local.flatMap((o) => o.externalIds.map((x) => [code(o.name), code(x)]))),
    'record-types': () => mdTable([A('object'), A('recordTypes')], local.filter((o) => o.recordTypes.length).map((o) => [code(o.name), o.recordTypes.filter((r) => r.active).map((r) => code(r.name)).join(', ') || '—'])),
    'validation-rules': () => mdTable([A('object'), A('rule'), A('status')], local.flatMap((o) => o.validationRules.map((v) => [code(o.name), code(v.name), v.active ? A('active') : A('inactive')]))),
    cmdt: () => mdTable([A('type'), A('records')], f.data.cmdtTypes.map((x) => [code(x.type), n(x.records)])),
    'platform-events': () => mdTable([A('apiName'), A('label')], local.filter((o) => o.kind === 'platformEvent').map((o) => [code(o.name), o.label || '—'])),
    volumes: () => (f.org && f.org.volumes ? mdTable([A('object'), A('records'), A('lastCreated')], f.org.volumes.filter((v) => v.records > 0).sort((a, b) => b.records - a.records).map((v) => [code(v.object), n(v.records), v.lastCreated || '—'])) : ''),
    'apex-summary': () => mdTable([A('kinds'), A('count')], Object.entries(dict.kinds).map(([k, label]) => [label, f.apex.classes.filter((c) => !c.test && c.kinds.includes(k)).length]).filter(([, c]) => c > 0).map(([l, c]) => [l, n(c)])),
    triggers: () => mdTable([A('trigger'), A('object'), A('events')], f.apex.triggers.map((x) => [code(x.name), code(x.object), x.events.join(', ')])),
    async: () => mdTable([A('class'), A('kinds')], f.apex.classes.filter((c) => !c.test && c.kinds.some((k) => ['batch', 'queueable', 'schedulable', 'future'].includes(k))).map((c) => [code(c.name), kindsLabel(c.kinds.filter((k) => ['batch', 'queueable', 'schedulable', 'future', 'stateful', 'callout'].includes(k)))])),
    rest: () => mdTable([A('url'), A('class'), A('kinds')], f.apex.classes.filter((c) => c.restUrl || c.kinds.includes('soap')).map((c) => [code(c.restUrl || 'SOAP'), code(c.name), c.restUrl ? 'Apex REST' : 'Apex SOAP'])),
    flows: () => mdTable([A('apiName'), A('label'), A('processType'), A('start'), A('object'), A('status')], f.automation.flows.map((x) => [code(x.name), x.label || '—', x.processType || '—', [x.triggerType, x.recordTriggerType, x.scheduleFrequency].filter(Boolean).join(' · ') || '—', x.object ? code(x.object) : '—', x.status])),
    'omni-scripts': () => mdTable([A('apiName'), A('label'), A('type'), A('language'), A('status')], f.automation.omnistudio.omniScripts.filter((x) => x.active).map((x) => [code(x.name), x.label || '—', `${x.type || ''}/${x.subType || ''}`, x.language || '—', A('active')])),
    'integration-procedures': () => mdTable([A('apiName'), A('label'), A('type'), A('status')], f.automation.omnistudio.integrationProcedures.filter((x) => x.active).map((x) => [code(x.name), x.label || '—', `${x.type || ''}/${x.subType || ''}`, A('active')])),
    'data-mappers': () => mdTable([A('apiName'), A('type')], f.automation.omnistudio.dataMappers.map((x) => [code(x.name), x.type || '—'])),
    apps: () => mdTable([A('apiName'), A('label'), A('navigation'), A('formFactors')], f.ui.apps.map((a) => [code(a.name), a.label || '—', a.navType || '—', a.formFactors.join(', ') || '—'])),
    flexipages: () => mdTable([A('apiName'), A('type'), A('object'), A('components')], f.ui.flexipages.map((p) => [code(p.name), p.type || '—', p.object ? code(p.object) : '—', list(p.customComponents, 6, dict)])),
    lwc: () => mdTable([A('apiName'), A('placement'), A('controllers')], f.ui.lwc.map((l) => [code(l.name), l.placedIn.length ? [...new Set(l.placedIn.map((u) => u.name))].slice(0, 4).map(code).join(', ') + (l.placedIn.length > 4 ? ' …' : '') : '—', list(l.apex, 4, dict)])),
    aura: () => mdTable([A('apiName'), A('type'), A('placement')], f.ui.aura.map((a) => [code(a.name), a.type, a.placedIn.length ? a.placedIn.slice(0, 4).map((u) => code(u.name)).join(', ') : '—'])),
    visualforce: () => mdTable([A('apiName'), A('controllers')], f.ui.vfPages.map((p) => [code(p.name), [p.controller, ...p.extensions].filter(Boolean).map(code).join(', ') || '—'])),
    psg: () => mdTable([A('apiName'), A('label'), A('permissionSets')].concat(f.org && f.org.psgAssignments ? [A('users')] : []), f.security.permissionSetGroups.map((g) => {
      const row = [code(g.name), g.label || '—', list(g.permissionSets, 10, dict)];
      if (f.org && f.org.psgAssignments) row.push(n((f.org.psgAssignments.find((a) => a.group === g.name) || {}).users || 0));
      return row;
    })),
    'permission-sets': () => mdTable([A('apiName'), A('label'), A('license')], f.security.permissionSets.map((p) => [code(p.name), p.label || '—', p.license || '—'])),
    profiles: () => mdTable([A('name'), A('license')].concat(f.org && f.org.usersByProfile ? [A('users')] : []), f.security.profiles.map((p) => {
      const row = [code(p.name), p.userLicense || '—'];
      if (f.org && f.org.usersByProfile) row.push(n((f.org.usersByProfile.find((u) => u.profile === p.name) || {}).users || 0));
      return row;
    })),
    roles: () => mdTable([A('apiName'), A('label'), A('parent')], f.security.roles.map((r) => [code(r.name), r.label || '—', r.parent ? code(r.parent) : '—'])),
    // facts.data.owd (project objects and the standard objects they use) when the facts provide it
    owd: () => (Array.isArray(f.data.owd)
      ? mdTable([A('object'), A('label'), A('owd')], f.data.owd.map((o) => [code(o.object), o.label || '—', `${o.internal || '—'} / ${o.external || '—'}`]))
      : mdTable([A('object'), A('owd')], local.filter((o) => o.sharingModel && ['custom', 'standard'].includes(o.kind)).map((o) => [code(o.name), `${o.sharingModel} / ${o.externalSharingModel || '—'}`]))),
    'sharing-rules': () => mdTable([A('object'), A('rule'), A('kind'), A('access')], f.security.sharingRules.flatMap((s) => s.rules.map((r) => [code(s.object), code(r.name), r.kind, r.access || '—']))),
    queues: () => mdTable([A('apiName'), A('label'), A('object')], f.security.queues.map((q) => [code(q.name), q.label || '—', q.objects.map(code).join(', ') || '—'])),
    'named-credentials': () => mdTable([A('apiName'), A('label'), A('type'), A('endpoint'), A('externalCredential')], f.integration.namedCredentials.map((x) => [code(x.name), x.label || '—', x.type, x.host || '—', x.externalCredential ? code(x.externalCredential) : '—'])),
    'external-credentials': () => mdTable([A('apiName'), A('label'), A('protocol')], f.integration.externalCredentials.map((x) => [code(x.name), x.label || '—', x.protocol || '—'])),
    'connected-apps': () => mdTable([A('apiName'), A('label'), A('scopes')], f.integration.connectedApps.map((x) => [code(x.name), x.label || '—', x.scopes.join(', ') || (x.saml ? 'SAML' : '—')])),
    'auth-providers': () => mdTable([A('apiName'), A('label'), A('type'), A('handler')], f.integration.authProviders.map((x) => [code(x.name), x.label || '—', x.type || '—', x.registrationHandler ? code(x.registrationHandler) : '—'])),
    'allowed-domains': () => mdTable([A('kind'), A('apiName'), A('endpoint')], [
      ...f.integration.remoteSites.map((x) => ['Remote Site', code(x.name), x.host || '—']),
      ...f.integration.cspTrustedSites.map((x) => ['CSP Trusted Site', code(x.name), x.host || '—']),
      ...f.integration.corsOrigins.map((x) => ['CORS', code(x.name), x.host || '—']),
    ]),
    'call-centers': () => mdTable([A('apiName'), A('label'), A('endpoint')], f.integration.callCenters.map((x) => [code(x.name), x.label || '—', x.adapterHost || '—'])),
    systems: () => mdTable([A('system'), A('description'), A('endpoints')], f.systems.named.map((s) => [s.name, s.description || '—', s.endpoints.map((e) => `${code(e.name)}`).join(', ') || '—'])),
    reports: () => mdTable([A('folder'), A('count')], f.misc.reports.folders.map((fo) => [code(fo), n((f.misc.reports.byFolder || {})[fo] || 0)])),
    labels: () => mdTable([A('apiName'), A('kind')], f.misc.labels.slice(0, 40).map((l) => [code(l.name), l.category || '—'])),
    'scheduled-jobs': () => (f.org && f.org.scheduledJobs ? mdTable([A('name'), A('type'), A('cron'), A('status')], f.org.scheduledJobs.map((j) => [j.name, j.type || '—', code(j.cron), j.state])) : ''),
    packages: () => (f.org && f.org.packages && f.org.packages.length
      ? mdTable([A('product'), A('namespace'), A('version')], f.org.packages.map((p) => [p.name, p.namespace ? code(p.namespace) : '—', p.version || '—']))
      : mdTable([A('namespace'), A('product')], f.namespaces.map((x) => [code(x.namespace), x.product || A('managed')]))),
    exclusions: () => mdTable([A('type'), A('apiName'), A('reason')], f.exclusions.applied.map((x) => [x.type, code(x.name), x.reason || '—'])),
    inventory: () => mdTable([A('type'), A('count')], Object.entries(f.misc.folders).filter(([, c]) => c > 0).map(([k, c]) => [code(k), n(c)])),
    traceability: () => mdTable([A('chapter'), A('metadata')], Object.entries(dict.traceability).map(([k, v]) => [ctx.chapterTitle(k), v])),
    glossary: () => mdTable([A('term'), A('definition')], [
      ...(glossary.terms || []).filter((x) => x.definition).map((x) => [x.term || x.use, x.definition]),
      ...Object.entries(dict.glossary).map(([k, v]) => [k, v]),
    ].sort((a, b) => a[0].localeCompare(b[0]))),
    signals: () => mdTable([A('signal'), A('pillar'), A('priority'), A('observed'), A('evidence')], f.signals.map((s) => [t(dict, 'signals.' + s.id), t(dict, 'pillars.' + s.pillar), `<span class="b ${s.priority}">${s.priority.toUpperCase()}</span>`, String(s.value), s.evidence.length ? list(s.evidence.map((e) => e.split(' ')[0]), 6, dict) : '—'])),
    'signals-trusted': () => signalTable(ctx, 'trusted'),
    'signals-easy': () => signalTable(ctx, 'easy'),
    'signals-adaptable': () => signalTable(ctx, 'adaptable'),
    'exclusion-candidates': () => mdTable([A('type'), A('apiName'), A('reason')], f.exclusions.candidates.map((c) => [c.type, code(c.name), c.reasons.join('; ')])),
  };
}

function signalTable(ctx, pillar) {
  const { facts: f, dict } = ctx;
  const A = (k) => t(dict, 'annex.' + k);
  return mdTable([A('signal'), A('priority'), A('observed'), A('evidence')], f.signals.filter((s) => s.pillar === pillar).map((s) => [t(dict, 'signals.' + s.id), `<span class="b ${s.priority}">${s.priority.toUpperCase()}</span>`, String(s.value), s.evidence.length ? s.evidence.slice(0, 6).map((e) => '`' + e + '`').join(', ') + (s.total > 6 ? ' ' + t(dict, 'annex.more', { n: s.total - 6 }) : '') : '—']));
}

// ---------------------------------------------------------------- ERD, figures, KPIs

/** Objects of `@@ERD:auto@@`: the most connected objects documented here (never out-of-scope or excluded ones). */
function autoObjects(facts, max = ERD_MAX) {
  const byName = new Map(facts.data.objects.map((o) => [o.name, o]));
  const degree = {};
  for (const o of facts.data.objects.filter((x) => !x.namespace)) {
    for (const r of o.relations) for (const to of r.to) { if (to === o.name || to === 'User' || to === 'Group' || !byName.has(to)) continue; degree[o.name] = (degree[o.name] || 0) + 1; degree[to] = (degree[to] || 0) + 1; }
  }
  return Object.entries(degree).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([k]) => k);
}

/**
 * Mermaid ER diagram limited to Lookup / Master-Detail relationships between the given objects.
 * Kept for compatibility (and as a text form of the model); the documents draw ERDs with erdSvg().
 */
export function erd(facts, objectNames, caption) {
  const byName = new Map(facts.data.objects.map((o) => [o.name, o]));
  const names = objectNames.length === 1 && objectNames[0] === 'auto' ? autoObjects(facts) : objectNames;
  const set = new Set(names);
  const lines = ['erDiagram'];
  const seen = new Set();
  for (const nm of names) {
    const o = byName.get(nm);
    if (!o) continue;
    for (const r of o.relations) {
      for (const to of r.to) {
        if (!set.has(to) || to === nm) continue;
        const key = `${to}>${nm}>${r.field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const card = r.type === 'MasterDetail' ? '||--|{' : '|o--o{';
        lines.push(`  ${ent(to)} ${card} ${ent(nm)} : "${r.field}"`);
      }
    }
  }
  for (const nm of names) if (!lines.some((l) => l.includes(` ${ent(nm)} `) || l.endsWith(` ${ent(nm)}`))) lines.push(`  ${ent(nm)} {\n    Id id\n  }`);
  return '```mermaid\n' + lines.join('\n') + '\n```\nFigure: ' + (caption || 'Entity-relationship model') + '\n';
}
const ent = (n) => n.replace(/[^A-Za-z0-9_]/g, '_');

/**
 * The variants of an ER diagram, from the plainest to the most simplified: as is, split in 2 then 3
 * sub-diagrams (erdClusters: the hub repeated in each), then the same without the type column.
 */
export function erdVariants(facts, list) {
  const out = [{ parts: [list], types: true }];
  const splits = [2, 3].filter((k) => list.length >= 2 * k).map((k) => erdClusters(facts, list, k).parts).filter((p) => p.length > 1);
  for (const parts of splits) out.push({ parts, types: true });
  if (splits.length) for (const parts of splits) out.push({ parts, types: false });
  else out.push({ parts: [list], types: false });
  return out;
}

/**
 * ER diagram figure (SVG) of at most ERD_MAX objects. A diagram whose text would be smaller than the
 * readable size on A4 (QA.warnFontPx once fitted to the page, at every candidate width) is split
 * automatically into 2–3 sub-diagrams (« (1/2) » after the caption), then drawn without the type
 * column; only when nothing reads well is it reported. `simplify` (asked by the visual QA after a
 * figure failed) starts from the next variant and asks for larger text.
 */
export function erdFigure(ctx, names, caption, problems, where, src = null) {
  let list = names.length === 1 && names[0] === 'auto' ? autoObjects(ctx.facts) : [...new Set(names)];
  if (list.length > ERD_MAX) {
    problems.push({ level: 'warn', code: 'erd-too-many', message: `${where}: ${list.length} objects, only the first ${ERD_MAX} are drawn — split the diagram by domain (@@ERD-DOMAIN:…@@).` });
    list = list.slice(0, ERD_MAX);
  }
  const first = erdModel(ctx.facts, list, ctx.dict);
  if (first.missing.length) problems.push({ level: 'warn', code: 'erd-unknown-object', message: `${where}: not in the metadata: ${first.missing.join(', ')}` });
  const known = list.filter((n) => !first.missing.includes(n));
  const cap = caption || t(ctx.dict, 'figures.erd');
  const simplify = !!(src && ctx.simplify && ctx.simplify.has(src));
  const threshold = simplify ? QA.warnFontPx + 1.5 : QA.warnFontPx;
  let variants = erdVariants(ctx.facts, known);
  if (simplify && variants.length > 1) variants = variants.slice(1);
  let chosen = null;
  for (const v of variants) {
    const models = v.parts.map((p) => erdModel(ctx.facts, p, ctx.dict, { types: v.types }));
    const px = Math.min(...models.map(erdTextPx));
    chosen = { v, models, px };
    if (px >= threshold) break;
  }
  if (!chosen || !chosen.models.length) return '';
  if (chosen.px < QA.minFontPx) problems.push({ level: 'warn', code: 'erd-unreadable', message: `${where}: even split in ${chosen.models.length} and without the type column, the text would be ${chosen.px.toFixed(1)} px on A4 — choose fewer objects for this domain.` });
  const n = chosen.models.length;
  return chosen.models.map((m, i) => {
    const c = n > 1 ? `${cap} (${i + 1}/${n})` : cap;
    if (!legacyDiagrams(ctx)) { const code = erdMermaid(m); return code ? mermaidFigure(code, c, src, 'erd') : ''; }
    const svg = erdSvg(m, c);
    return svg ? figureHtml(svg, c, 'erd', src) : '';
  }).join('\n');
}

/**
 * diagrams.engine in tadforce.config.json: « mermaid » (default) draws every figure with Mermaid and
 * the ELK layout; « legacy » keeps the hand-drawn SVG of the ERDs, the context view and the role tree.
 */
export const legacyDiagrams = (ctx) => !!(ctx && ctx.cfg && ctx.cfg.diagrams && ctx.cfg.diagrams.engine === 'legacy');

function integrationsFigure(facts, cfg, dict, caption) {
  const lines = ['flowchart LR', `  SF["${(t(dict, 'context.salesforce') + ' — ' + (cfg.client.short || cfg.client.name)).replace(/"/g, "'")}"]:::sf`];
  let i = 0;
  for (const s of facts.systems.named) {
    const k = 's' + i++;
    lines.push(`  ${k}["${s.name.replace(/"/g, "'")}"]:::ext`);
    const ncs = s.endpoints.filter((e) => e.kind === 'namedCredential').map((e) => e.name);
    const label = ncs.length ? ncs.slice(0, 2).join(', ') : [...new Set(s.endpoints.map((e) => e.kind))].join(', ');
    const inbound = s.endpoints.every((e) => e.kind === 'connectedApp' || e.kind === 'authProvider');
    lines.push(inbound ? `  ${k} -- "${label}" --> SF` : `  SF -- "${label}" --> ${k}`);
  }
  const hosts = [...new Set(facts.systems.unnamed.filter((e) => e.host).map((e) => e.host))].slice(0, 8);
  for (const h of hosts) { const k = 's' + i++; lines.push(`  ${k}["${h}"]:::ext`); lines.push(`  SF --> ${k}`); }
  if (facts.counts.integration.restResources) lines.push(`  IN["${t(dict, 'context.callers')}"]:::actor`, `  IN -- "Apex REST" --> SF`);
  if (i === 0 && !facts.counts.integration.restResources) return '';
  return '```mermaid\n' + lines.join('\n') + '\n```\nFigure: ' + caption + '\n';
}

function kpis(ctx) {
  const { facts: f, dict } = ctx;
  const n = (x) => formatNumber(x, ctx.lang);
  const miss = (...ps) => ps.some((p) => countMissing(f, p));
  const tile = (href, value, label) => `<a class="kpi" href="#${href}"><b>${value}</b><span>${label}</span></a>`;
  // a tile whose count was not collected is left out: a KPI is never « 0 » by lack of data
  const tiles = [
    !miss('ui.apps') && tile('annex-apps', n(f.counts.ui.apps), t(dict, 'kpi.apps')),
    !miss('objects.custom') && tile('annex-objects', n(f.counts.objects.custom), t(dict, 'kpi.objects')),
    !miss('apex.classes', 'apex.tests') && tile('annex-apex', n(f.counts.apex.classes), t(dict, 'kpi.classes', { tests: n(f.counts.apex.tests) })),
    !miss('ui.lwc') && tile('annex-lwc', n(f.counts.ui.lwc), t(dict, 'kpi.lwc')),
    f.modules.omnistudio && !miss('omni.scriptsActive', 'omni.ipsActive') && tile('annex-omnistudio', `${n(f.counts.omni.scriptsActive)} / ${n(f.counts.omni.ipsActive)}`, t(dict, 'kpi.omni')),
    !miss('flows.active') && tile('annex-automation', n(f.counts.flows.active), t(dict, 'kpi.flows')),
    f.counts.cmdt.records && !miss('cmdt.records', 'cmdt.types') && tile('annex-cmdt', n(f.counts.cmdt.records), t(dict, 'kpi.cmdt', { types: n(f.counts.cmdt.types) })),
    f.counts.integration.systems ? !miss('integration.systems') && tile('annex-integration', n(f.counts.integration.systems), t(dict, 'kpi.systems'))
      : !miss('integration.namedCredentials', 'integration.restResources') && tile('annex-integration', n(f.counts.integration.namedCredentials + f.counts.integration.restResources), t(dict, 'kpi.integrations')),
  ].filter(Boolean);
  return tiles.length ? `<div class="kpis">\n${tiles.join('\n')}\n</div>` : '';
}

/** The understanding model element a directive names; reports a missing model or an unknown id. */
function modelItem(ctx, list, id, directive, problems) {
  if (!ctx.model) {
    problems.push({ level: 'warn', code: 'no-model', message: `${directive} needs tadforce/understanding/model.json (the understanding step): nothing drawn.` });
    return null;
  }
  const item = (ctx.model[list] || []).find((x) => x && String(x.id) === id);
  if (!item) problems.push({ level: 'error', code: 'unknown-model-id', message: `${directive}: no ${list.replace(/s$/, '')} "${id}" in understanding/model.json (known: ${(ctx.model[list] || []).map((x) => x.id).join(', ') || 'none'}).` });
  return item || null;
}

// `src` (the directive) and `kind` (erd, context, roles: the figure's data-kind) ride in Mermaid comments:
// the build reads them back to tag the figure for the visual QA and the stylesheet
const mermaidFigure = (code, caption, src = null, kind = null) => '```mermaid\n' + code + (src ? `\n%% tad-src=${src}` : '') + (kind ? `\n%% tad-kind=${kind}` : '') + '\n```\nFigure: ' + String(caption).replace(/\n/g, ' ') + '\n';

/** Table under a simplified sequence: the full names behind its shortened lanes. */
function laneNotes(notes, dict) {
  if (!notes || !notes.length) return '';
  return '\n' + mdTable([t(dict, 'figures.seqLane'), t(dict, 'figures.seqFull')], notes.map((x) => [x.lane, x.full])) + '\n';
}

/**
 * Replace every @@DIRECTIVE@@ line by generated content. Unknown directives are reported.
 *   @@ANNEX:<name>@@  @@KPIS@@  @@LEGEND@@  @@CONTEXT@@  @@LAYERS@@  @@ROLES[|caption]@@
 *   @@ERD:A,B,…|caption@@  @@ERD-DOMAIN:<domainId>[|caption]@@  @@SEQ:<processId>[|caption]@@  @@STATE:<lifecycleId>[|caption]@@
 *   @@FIGURE:context|layers|roles|integrations[|caption]@@ (aliases kept from 0.4)
 */
export function resolveDirectives(text, ctx, problems) {
  const A = annexes(ctx);
  const missing = (p) => countMissing(ctx.facts, p);
  const legacy = legacyDiagrams(ctx);
  const context = (caption) => {
    const cap = caption || t(ctx.dict, 'context.caption');
    if (!legacy) return mermaidFigure(contextMermaid(ctx.facts, ctx.glossary, ctx.cfg, ctx.dict, { model: ctx.model, missing }), cap, null, 'context') + '\n' + legendHtml(ctx.dict) + '\n';
    return figureHtml(contextView(ctx.facts, ctx.glossary, ctx.cfg, ctx.dict, { model: ctx.model, missing }), cap, 'context');
  };
  const roles = (caption) => {
    const cap = caption || t(ctx.dict, 'figures.roles');
    if (!legacy) { const code = rolesMermaid(ctx.facts); return code ? mermaidFigure(code, cap, null, 'roles') : ''; }
    const s = rolesTree(ctx.facts, ctx.dict);
    return s ? figureHtml(s, cap, 'roles') : '';
  };
  return text.replace(/^@@([A-Z][A-Z-]*)(?::([^@|]*))?(?:\|([^@]*))?@@[ \t]*$/gm, (m, kind, arg = '', caption = '') => {
    arg = arg.trim(); caption = caption.trim();
    if (kind === 'ANNEX') {
      const fn = A[arg];
      if (!fn) { problems.push({ level: 'error', code: 'unknown-annex', message: `Unknown appendix generator @@ANNEX:${arg}@@` }); return ''; }
      const out = fn();
      return out || `<p class="empty-annex">${t(ctx.dict, 'annex.none')}</p>`;
    }
    const src = `${kind}:${arg}`;
    if (kind === 'ERD') return erdFigure(ctx, arg.split(',').map((s) => s.trim()).filter(Boolean), caption, problems, m, src);
    if (kind === 'ERD-DOMAIN') {
      const d = modelItem(ctx, 'domains', arg, m, problems);
      if (!d) return '';
      const objs = (d.objects || []).map(String);
      if (!objs.length) { problems.push({ level: 'warn', code: 'erd-empty-domain', message: `${m}: the domain "${arg}" lists no object.` }); return ''; }
      return erdFigure(ctx, objs, caption || t(ctx.dict, 'figures.erdDomain', { domain: d.name || d.id }), problems, m, src);
    }
    if (kind === 'SEQ') {
      const p = modelItem(ctx, 'processes', arg, m, problems);
      if (!p) return '';
      if (!(p.steps || []).length) { problems.push({ level: 'warn', code: 'seq-empty', message: `${m}: the process "${arg}" has no step.` }); return ''; }
      const { code, warnings, notes } = sequenceCode(p, ctx.dict, { simplify: !!(ctx.simplify && ctx.simplify.has(src)) });
      for (const w of warnings) problems.push({ level: 'warn', code: 'model-inconsistent', message: `${m}: ${w}` });
      return mermaidFigure(code, caption || t(ctx.dict, 'figures.seq', { process: p.name || p.id }), src) + laneNotes(notes, ctx.dict);
    }
    if (kind === 'STATE') {
      const lc = modelItem(ctx, 'lifecycles', arg, m, problems);
      if (!lc) return '';
      if (!(lc.states || []).length) { problems.push({ level: 'warn', code: 'state-empty', message: `${m}: the lifecycle "${arg}" has no state.` }); return ''; }
      const { code, warnings } = stateCode(lc, { simplify: !!(ctx.simplify && ctx.simplify.has(src)) });
      for (const w of warnings) problems.push({ level: 'warn', code: 'model-inconsistent', message: `${m}: ${w}` });
      return mermaidFigure(code, caption || t(ctx.dict, 'figures.state', { object: lc.object || lc.id, field: lc.field || '' }).replace(/\s*\(\)\s*$/, ''), src);
    }
    if (kind === 'KPIS') return kpis(ctx);
    if (kind === 'LEGEND') return legendHtml(ctx.dict);
    if (kind === 'CONTEXT') return context(caption);
    if (kind === 'LAYERS') return layersBlock(ctx.facts, ctx.dict, { missing });
    if (kind === 'ROLES') return roles(caption);
    if (kind === 'FIGURE') {
      if (arg === 'context') return context(caption);
      if (arg === 'layers') return layersBlock(ctx.facts, ctx.dict, { missing });
      if (arg === 'roles') return roles(caption);
      if (arg === 'integrations') return integrationsFigure(ctx.facts, ctx.cfg, ctx.dict, caption || t(ctx.dict, 'figures.integrations'));
      problems.push({ level: 'error', code: 'unknown-figure', message: `Unknown figure @@FIGURE:${arg}@@` });
      return '';
    }
    problems.push({ level: 'error', code: 'unknown-directive', message: `Unknown directive ${m}` });
    return '';
  });
}
