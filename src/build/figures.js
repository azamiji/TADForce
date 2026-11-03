// Data-driven figures drawn as SVG (context view, role hierarchy) or HTML blocks (logical layers, legend).
// Every figure uses the same colour legend: actors violet, Salesforce components blue,
// external systems orange, data green. These colours are fixed (not the client's brand) and
// keep their text readable (WCAG AA on their fill).
import { t } from '../util/i18n.js';

/** [fill, stroke, ink] of each legend kind. */
export const LEGEND = {
  actor: ['#F1E8FF', '#7B3FE4', '#2A1458'],
  sf: ['#E8F1FF', '#2F6FE4', '#0B2545'],
  ext: ['#FFF2E2', '#E0861F', '#4A2A05'],
  data: ['#E7F6EC', '#2E9E5B', '#0E3B22'],
  warn: ['#FDECEF', '#D6336C', '#5A0A23'],
};
const STY = LEGEND;
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s; };
const tw = (s, fs) => String(s).length * fs * 0.58;

/** Wrap a label on at most `max` lines of about `n` characters. */
export function wrap(s, n, max = 2) {
  const words = String(s || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= n) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > max) { const rest = lines.slice(max - 1).join(' '); lines.length = max - 1; lines.push(clip(rest, n)); }
  return lines.map((l) => clip(l, n));
}

/** A generated figure: the body and its caption stay together (numbered at build: « Figure N — … »). */
export function figureHtml(body, caption, kind = 'svg') {
  // one line, blank lines around: Markdown keeps it as one HTML block
  return `\n<figure class="diagram hand" data-kind="${kind}"><div class="fig-body">${body.replace(/\s*\n\s*/g, ' ')}</div><figcaption class="figcap">Figure — ${esc(caption)}</figcaption></figure>\n`;
}

/** Legend chips (HTML), shared by every figure. */
export function legendHtml(dict) {
  return `<div class="legend">\n<span class="lg actor">${esc(t(dict, 'legend.actor'))}</span>\n<span class="lg sf">${esc(t(dict, 'legend.sf'))}</span>\n<span class="lg ext">${esc(t(dict, 'legend.ext'))}</span>\n<span class="lg data">${esc(t(dict, 'legend.data'))}</span>\n</div>`;
}

export class Svg {
  constructor(w, h, title) { this.w = w; this.h = h; this.title = title; this.parts = []; }
  box(x, y, w, h, kind, lines, { pill = false, fs = 13.5, fs2 = 12, uniform = false } = {}) {
    const [fill, stroke, ink] = STY[kind];
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${pill ? h / 2 : 8}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`);
    const lh = Math.max(fs, fs2) + 3;
    lines.forEach((tx, i) => {
      const ty = y + h / 2 + (i - (lines.length - 1) / 2) * lh + fs * 0.36;
      this.parts.push(`<text x="${x + w / 2}" y="${ty.toFixed(1)}" text-anchor="middle" font-size="${i === 0 || uniform ? fs : fs2}" font-weight="${i === 0 || uniform ? 600 : 400}" fill="${ink}">${esc(tx)}</text>`);
    });
  }
  text(x, y, s, { fs = 12.5, weight = 700, fill = '#33475B', anchor = 'start' } = {}) {
    this.parts.push(`<text x="${x}" y="${y}" font-size="${fs}" font-weight="${weight}" fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`);
  }
  group(x, y, w, h, title) {
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#F7F9FC" stroke="#2F6FE4" stroke-width="1.4" stroke-dasharray="6 4"/>`);
    this.parts.push(`<text x="${x + 14}" y="${y + 22}" font-size="14" font-weight="700" fill="#0B2545">${esc(title)}</text>`);
  }
  arrow(pts, { label, dashed = false, both = false, fs = 12 } = {}) {
    const d = 'M' + pts.map(([a, b]) => `${a},${b}`).join(' L');
    this.parts.push(`<path d="${d}" fill="none" stroke="#5B6B7D" stroke-width="1.5"${dashed ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#ah)"${both ? ' marker-start="url(#ahs)"' : ''}/>`);
    if (label) {
      const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
      const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2 - 6;
      const w = tw(label, fs) + 8;
      this.parts.push(`<rect x="${(lx - w / 2).toFixed(1)}" y="${ly - fs}" width="${w.toFixed(1)}" height="${fs + 4}" rx="4" fill="#fff"/>`);
      this.parts.push(`<text x="${lx}" y="${ly}" text-anchor="middle" font-size="${fs}" fill="#1B2632">${esc(label)}</text>`);
    }
  }
  /** The colour legend as a row of chips (kept inside the SVG: it follows the figure into PDF and Word). */
  legend(x, y, dict, kinds = ['actor', 'sf', 'ext', 'data']) {
    let cx = x;
    for (const k of kinds) {
      const label = t(dict, 'legend.short.' + k);
      const w = tw(label, 13) + 34;
      const [fill, stroke, ink] = STY[k];
      this.parts.push(`<rect x="${cx}" y="${y}" width="${w.toFixed(1)}" height="24" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`);
      this.parts.push(`<circle cx="${cx + 13}" cy="${y + 12}" r="5" fill="${stroke}"/>`);
      this.parts.push(`<text x="${cx + 23}" y="${y + 16.5}" font-size="13" fill="${ink}">${esc(label)}</text>`);
      cx += w + 10;
    }
    return cx;
  }
  render(cls = '') {
    return `<svg xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ''} viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" role="img" aria-label="${esc(this.title)}" style="font-family:Segoe UI,Arial,sans-serif;max-width:100%">` +
      `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#5B6B7D"/></marker>` +
      `<marker id="ahs" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="#5B6B7D"/></marker></defs>` +
      this.parts.join('') + '</svg>';
  }
}

const KIND_LABEL = { namedCredential: 'Named Credential', remoteSite: 'Remote Site', cspTrustedSite: 'CSP', authProvider: 'SSO', connectedApp: 'Connected App', callCenter: 'CTI' };
const PROTO = { oauth: 'OAuth 2.0', jwt: 'JWT', awssv4: 'AWS SigV4', custom: 'custom auth', basic: 'basic auth', password: 'basic auth', certificate: 'mTLS' };

/** Protocol label of the arrow between Salesforce and a connected system (a glossary `protocol` wins). */
export function protocolOf(system, facts, glossary = {}) {
  const g = (glossary.systems || []).find((x) => x.id && x.id === system.id);
  if (g && g.protocol) return String(g.protocol);
  const labels = [];
  for (const e of system.endpoints || []) {
    if (e.kind === 'namedCredential') {
      const nc = (facts.integration.namedCredentials || []).find((x) => x.name === e.name);
      const ec = nc && nc.externalCredential && (facts.integration.externalCredentials || []).find((x) => x.name === nc.externalCredential);
      const p = ec && ec.protocol ? PROTO[String(ec.protocol).toLowerCase()] || ec.protocol : null;
      labels.push(p ? `HTTPS · ${p}` : 'HTTPS');
    } else if (e.kind === 'authProvider') {
      const ap = (facts.integration.authProviders || []).find((x) => x.name === e.name);
      labels.push(ap && /saml/i.test(ap.type || '') ? 'SAML SSO' : ap && /openid/i.test(ap.type || '') ? 'OIDC SSO' : 'SSO');
    } else if (e.kind === 'connectedApp') labels.push('OAuth · REST API');
    else if (e.kind === 'cspTrustedSite') labels.push('HTTPS (browser)');
    else if (e.kind === 'remoteSite') labels.push('HTTPS');
    else if (e.kind === 'callCenter') labels.push('CTI');
    else labels.push(KIND_LABEL[e.kind] || e.kind);
  }
  const all = [...new Set(labels)];
  // two protocols that do not fit on the arrow: the first one (the glossary can name it: systems[].protocol)
  return all.slice(0, 2).join(' + ').length <= 20 ? all.slice(0, 2).join(' + ') : all[0] || '';
}

/** Lay chips (pills) out in rows inside a width; returns the height used. */
function chips(svg, x, y, w, items, kind) {
  let cx = x, cy = y;
  const h = 28;
  for (const it of items) {
    const cw = Math.min(w, tw(it, 13) + 24);
    if (cx > x && cx + cw > x + w) { cx = x; cy += h + 8; }
    svg.box(cx, cy, cw, h, kind, [clip(it, Math.floor((w - 24) / 7.6))], { pill: true, fs: 13 });
    cx += cw + 8;
  }
  return items.length ? cy + h - y : 0;
}

/**
 * Context view: actors on the left, the platform blocks of the org in the middle (applications,
 * user interface, logic, data, integration), connected systems on the right; arrows carry the
 * protocol; the colour legend is drawn under the figure.
 */
export function contextView(facts, glossary, cfg, dict, { model = null, missing = () => false } = {}) {
  const c = facts.counts;
  const has = (p, v) => v && !missing(p);
  const L = (k, vars) => t(dict, 'context.' + k, vars);
  // actors: the understanding model, then the glossary, then the applications
  const gActors = glossary.actors || [];
  let actors = (model && model.actors || []).map((a) => {
    const g = gActors.find((x) => x.name === a.name);
    return [a.name, (g && (g.channel || g.description)) || (a.kind && a.kind !== 'actor' ? a.kind : '')];
  });
  if (!actors.length) actors = gActors.map((a) => [a.name, a.channel || a.description || '']);
  if (!actors.length) for (const a of facts.ui.apps.slice(0, 5)) actors.push([a.label || a.name, a.console ? 'Console' : 'Lightning']);
  if (!actors.length) actors.push([L('users'), 'Lightning']);
  actors = actors.slice(0, 7);

  const systems = facts.systems.named.map((s) => ({ name: s.name, proto: protocolOf(s, facts, glossary), dir: s.endpoints.every((e) => e.kind === 'connectedApp') ? 'in' : s.endpoints.every((e) => e.kind === 'authProvider') ? 'both' : 'out' }));
  const seenHosts = new Set();
  for (const e of facts.systems.unnamed) {
    const key = e.host || e.name;
    if (seenHosts.has(key) || systems.length >= 8) continue;
    seenHosts.add(key);
    systems.push({ name: e.host || e.name, proto: protocolOf({ endpoints: [e] }, facts, glossary), dir: e.kind === 'connectedApp' ? 'in' : 'out' });
  }
  if (has('integration.restResources', c.integration.restResources) && !systems.some((s) => s.dir === 'in')) systems.push({ name: L('callers'), proto: 'Apex REST', dir: 'in' });
  const shownSystems = systems.slice(0, 9);

  // platform blocks
  const m = facts.modules;
  const sig = (facts.misc && facts.misc.signals) || {};
  const ui = [has('ui.lwc', c.ui.lwc) && L('lwc', { n: c.ui.lwc }), has('ui.aura', c.ui.aura) && L('aura', { n: c.ui.aura }), m.omnistudio && has('omni.scriptsActive', c.omni.scriptsActive) && L('os', { n: c.omni.scriptsActive }),
    has('ui.vfPages', c.ui.vfPages) && L('vf', { n: c.ui.vfPages }), (sig.experiences || sig.networks || sig.sites) && L('sites', { n: Math.max(sig.experiences || 0, sig.networks || 0, sig.sites || 0) }), m.omniChannel && 'Omni-Channel', m.cti && 'CTI'].filter(Boolean);
  const logic = [has('flows.active', c.flows.active) && L('flows', { n: c.flows.active }), has('apex.classes', c.apex.classes) && L('apex', { n: c.apex.classes }), has('apex.triggers', c.apex.triggers) && L('triggers', { n: c.apex.triggers }),
    m.omnistudio && has('omni.ipsActive', c.omni.ipsActive) && L('ips', { n: c.omni.ipsActive }), m.omnistudio && has('omni.dataMappers', c.omni.dataMappers) && L('dms', { n: c.omni.dataMappers })].filter(Boolean);
  const data = [has('objects.custom', c.objects.custom) && L('objects', { n: c.objects.custom }), has('objects.standard', c.objects.standard) && L('standard', { n: c.objects.standard }),
    has('cmdt.types', c.cmdt.types) && L('cmdt', { n: c.cmdt.types }), has('objects.platformEvents', c.objects.platformEvents) && L('events', { n: c.objects.platformEvents })].filter(Boolean);
  const integ = [has('integration.namedCredentials', c.integration.namedCredentials) && L('nc', { n: c.integration.namedCredentials }), has('integration.restResources', c.integration.restResources) && L('restApis', { n: c.integration.restResources }),
    has('integration.connectedApps', c.integration.connectedApps) && L('connectedApps', { n: c.integration.connectedApps }),
    ...(facts.integration.authProviders || []).slice(0, 2).map((a) => L('auth', { name: a.label || a.name }))].filter(Boolean);
  const apps = facts.ui.apps.filter((a) => a.label).slice(0, 4);

  const AX = 10, AW = 170, GX = 250, GW = 410, SX = 800, SW = 170, W = SX + SW + 10;
  const inner = GW - 36;
  // measure the centre column first (a dry run of the chip layout)
  const dry = new Svg(0, 0, '');
  const sections = [
    apps.length && ['apps', null],
    ui.length && ['ui', ui, 'sf'], logic.length && ['logic', logic, 'sf'], data.length && ['data', data, 'data'], integ.length && ['integration', integ, 'sf'],
  ].filter(Boolean);
  let ch = 44;
  for (const [k, items, kind] of sections) ch += 24 + (k === 'apps' ? 46 : chips(dry, 0, 0, inner, items, kind)) + 12;
  const rowH = 64;
  const top = 34;
  const H = Math.max(ch + 10, top + Math.max(actors.length, shownSystems.length) * rowH + 20, 300);
  const svg = new Svg(W, H + 56, t(dict, 'context.caption'));
  svg.group(GX, top - 20, GW, H - top + 14, `${L('salesforce')} — ${cfg.client.short || cfg.client.name}`);
  let y = top + 24;
  for (const [k, items, kind] of sections) {
    svg.text(GX + 18, y + 12, L(k), { fs: 13 });
    y += 22;
    if (k === 'apps') {
      const aw = (inner - (apps.length - 1) * 10) / apps.length;
      apps.forEach((a, i) => svg.box(GX + 18 + i * (aw + 10), y, aw, 42, 'sf', [clip(a.label, Math.floor(aw / 8)), a.console ? 'Console' : 'Lightning'], { fs: 13.5, fs2: 13 }));
      y += 46 + 12;
    } else {
      y += chips(svg, GX + 18, y, inner, items, kind) + 12;
    }
  }
  // actors and systems, spread over the height of the platform group
  const span = H - top - 10;
  const ay = (i, n) => top + (span / n) * i + (span / n - 48) / 2;
  actors.forEach(([name, sub], i) => {
    const yy = ay(i, actors.length);
    svg.box(AX, yy, AW, 48, 'actor', sub ? [clip(name, 22), clip(sub, 24)] : [clip(name, 22)], { fs: 13.5, fs2: 13 });
    svg.arrow([[AX + AW, yy + 24], [GX, yy + 24]]);
  });
  shownSystems.forEach((s, i) => {
    const yy = ay(i, shownSystems.length);
    svg.box(SX, yy, SW, 48, 'ext', wrap(s.name, 22, 2), { fs: 13.5, uniform: true });
    const pts = s.dir === 'in' ? [[SX, yy + 24], [GX + GW, yy + 24]] : [[GX + GW, yy + 24], [SX, yy + 24]];
    svg.arrow(pts, { label: clip(s.proto, 20), dashed: s.dir === 'in', both: s.dir === 'both', fs: 13 });
  });
  svg.legend(AX, H + 22, dict);
  return svg.render('context');
}

/** Logical layers block (HTML), with counts from facts; counts that were not collected are left out. */
export function layersBlock(facts, dict, { missing = () => false } = {}) {
  const c = facts.counts;
  const L = (k, n) => t(dict, `layers.${k}`, { n });
  const has = (p, v) => v && !missing(p);
  const span = (s) => `<span>${esc(s)}</span>`;
  const row = (cls, title, items) => `<div class="layer${cls ? ' ' + cls : ''}"><div class="ln">${esc(title)}</div><div class="li">${items.filter(Boolean).map(span).join('')}</div></div>`;
  const lwc = has('ui.lwc', c.ui.lwc) ? L('lwc', c.ui.lwc) + (has('ui.aura', c.ui.aura) ? ' · ' + L('aura', c.ui.aura) : '') : has('ui.aura', c.ui.aura) ? L('aura', c.ui.aura) : null;
  const pres = [has('ui.apps', c.ui.apps) && L('apps', c.ui.apps), has('ui.flexipages', c.ui.flexipages) && L('pages', c.ui.flexipages), lwc, has('omni.scriptsActive', c.omni.scriptsActive) && L('os', c.omni.scriptsActive), has('ui.vfPages', c.ui.vfPages) && L('vf', c.ui.vfPages)];
  const orch = [has('flows.active', c.flows.active) && L('flows', c.flows.active), has('omni.ipsActive', c.omni.ipsActive) && L('ips', c.omni.ipsActive), has('omni.dataMappers', c.omni.dataMappers) && L('dms', c.omni.dataMappers)];
  const asyncN = (c.apex.batch || 0) + (c.apex.queueable || 0) + (c.apex.schedulable || 0) + (c.apex.future || 0);
  const svc = [has('apex.triggers', c.apex.triggers) && L('triggers', c.apex.triggers), has('apex.auraEnabled', c.apex.auraEnabled) && L('controllers', c.apex.auraEnabled), has('apex.classes', c.apex.classes) && L('services', c.apex.classes), asyncN && L('async')];
  const data = [L('standard'), has('objects.custom', c.objects.custom) && L('custom', c.objects.custom), has('cmdt.types', c.cmdt.types) && L('cmdt', c.cmdt.types), L('files')];
  const integ = [has('integration.namedCredentials', c.integration.namedCredentials) && L('nc', c.integration.namedCredentials), has('integration.externalCredentials', c.integration.externalCredentials) && L('ec', c.integration.externalCredentials), has('integration.restResources', c.integration.restResources) && L('rest', c.integration.restResources), has('integration.connectedApps', c.integration.connectedApps) && L('apps2', c.integration.connectedApps)];
  const orDash = (xs) => (xs.some(Boolean) ? xs : ['—']);
  const body = `<div class="layers">${row('pres', L('presentation'), orDash(pres))}${row('orch', L('orchestration'), orDash(orch))}${row('svc', L('servicesTitle'), orDash(svc))}${row('data', L('data'), data)}${row('int', L('integration'), orDash(integ))}</div>`;
  return figureHtml(body, L('caption'), 'layers');
}

/** Role hierarchy as a left-to-right tree (top roles on the left). Deep or very wide trees are cut, with « +n ». */
export function rolesTree(facts, dict) {
  const roles = facts.security.roles || [];
  if (!roles.length) return '';
  const byName = new Map(roles.map((r) => [r.name, { ...r, kids: [] }]));
  const roots = [];
  for (const r of byName.values()) {
    const p = r.parent && byName.get(r.parent);
    if (p && p !== r) p.kids.push(r); else roots.push(r);
  }
  const sortRec = (n, seen = new Set()) => { if (seen.has(n)) return; seen.add(n); n.kids.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name)); n.kids.forEach((k) => sortRec(k, seen)); };
  roots.forEach((r) => sortRec(r));
  const count = (n, d = 0) => (d > 30 ? 0 : 1 + n.kids.reduce((a, k) => a + count(k, d + 1), 0));
  // depth shown: as deep as possible while keeping at most ~32 rows and 5 columns
  let maxDepth = 5;
  const leaves = (n, d) => (d >= maxDepth - 1 || !n.kids.length ? 1 : n.kids.reduce((a, k) => a + leaves(k, d + 1), 0));
  while (maxDepth > 2 && roots.reduce((a, r) => a + leaves(r, 0), 0) > 32) maxDepth--;
  const NW = 150, NH = 40, GX = 34, RH = 48;
  const nodes = [];
  let row = 0;
  const place = (n, d) => {
    const cut = d >= maxDepth - 1 && n.kids.length;
    const node = { n, d, hidden: cut ? count(n) - 1 : 0 };
    if (!n.kids.length || cut) { node.y = row++ * RH; nodes.push(node); return node; }
    const kids = n.kids.map((k) => place(k, d + 1));
    node.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    node.kids = kids;
    nodes.push(node);
    return node;
  };
  roots.forEach((r) => place(r, 0));
  const depth = Math.max(...nodes.map((x) => x.d)) + 1;
  const W = depth * NW + (depth - 1) * GX + 20, H = row * RH + 10;
  const svg = new Svg(W, H, t(dict, 'figures.roles'));
  for (const node of nodes) {
    const x = 10 + node.d * (NW + GX), y = node.y + 5;
    for (const k of node.kids || []) {
      const kx = 10 + k.d * (NW + GX), ky = k.y + 5 + NH / 2, mx = x + NW + GX / 2;
      svg.parts.push(`<path d="M${x + NW},${y + NH / 2} H${mx} V${ky} H${kx}" fill="none" stroke="#5B6B7D" stroke-width="1.3"/>`);
    }
    const label = (node.n.label || node.n.name) + (node.hidden ? ` (+${node.hidden})` : '');
    svg.box(x, y, NW, NH, 'sf', wrap(label, 21, 2), { fs: 12, uniform: true });
  }
  return svg.render('roles');
}
