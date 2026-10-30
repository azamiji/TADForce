// Data-driven figures drawn as SVG (context view) or HTML blocks (logical layers).
import { t } from '../util/i18n.js';

const STY = {
  actor: ['#F1E8FF', '#7B3FE4', '#2A1458'],
  sf: ['#E8F1FF', '#2F6FE4', '#0B2545'],
  ext: ['#FFF2E2', '#E0861F', '#4A2A05'],
  data: ['#E7F6EC', '#2E9E5B', '#0E3B22'],
  warn: ['#FDECEF', '#D6336C', '#5A0A23'],
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export class Svg {
  constructor(w, h, title) { this.w = w; this.h = h; this.title = title; this.parts = []; }
  box(x, y, w, h, kind, lines, { pill = false } = {}) {
    const [fill, stroke, ink] = STY[kind];
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${pill ? h / 2 : 8}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`);
    lines.forEach((tx, i) => {
      const ty = y + h / 2 + (i - (lines.length - 1) / 2) * 16 + 5;
      this.parts.push(`<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="${i === 0 ? 13.5 : 12}" font-weight="${i === 0 ? 600 : 400}" fill="${ink}">${esc(tx)}</text>`);
    });
  }
  group(x, y, w, h, title) {
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#F7F9FC" stroke="#C9D4E3" stroke-width="1.4" stroke-dasharray="5 4"/>`);
    this.parts.push(`<text x="${x + 14}" y="${y + 20}" font-size="13" font-weight="700" fill="#33475B">${esc(title)}</text>`);
  }
  arrow(pts, { label, dashed = false, both = false } = {}) {
    const d = 'M' + pts.map(([a, b]) => `${a},${b}`).join(' L');
    this.parts.push(`<path d="${d}" fill="none" stroke="#5B6B7D" stroke-width="1.5"${dashed ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#ah)"${both ? ' marker-start="url(#ahs)"' : ''}/>`);
    if (label) {
      const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
      const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2 - 6;
      this.parts.push(`<rect x="${lx - label.length * 3.4 - 4}" y="${ly - 12}" width="${label.length * 6.8 + 8}" height="16" rx="4" fill="#fff"/>`);
      this.parts.push(`<text x="${lx}" y="${ly}" text-anchor="middle" font-size="11.5" fill="#33475B">${esc(label)}</text>`);
    }
  }
  render() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" role="img" aria-label="${esc(this.title)}" style="font-family:Segoe UI,Arial,sans-serif;max-width:100%">` +
      `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#5B6B7D"/></marker>` +
      `<marker id="ahs" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="#5B6B7D"/></marker></defs>` +
      this.parts.join('') + '</svg>';
  }
}

const KIND_LABEL = { namedCredential: 'Named Credential', remoteSite: 'Remote Site', cspTrustedSite: 'CSP', authProvider: 'SSO', connectedApp: 'Connected App', callCenter: 'CTI' };

/** Context view: users on the left, the Salesforce org in the middle, connected systems on the right. */
export function contextView(facts, glossary, cfg, dict) {
  const actors = (glossary.actors || []).map((a) => [a.name, a.channel || a.description || '']).slice(0, 6);
  if (!actors.length) {
    for (const a of facts.ui.apps.slice(0, 5)) actors.push([a.label || a.name, a.console ? 'Console' : 'Lightning']);
    if (!actors.length) actors.push([t(dict, 'context.users'), 'Lightning']);
  }
  const systems = facts.systems.named.map((s) => [s.name, [...new Set(s.endpoints.map((e) => KIND_LABEL[e.kind] || e.kind))].join(' · ')]);
  const seenHosts = new Set();
  for (const e of facts.systems.unnamed) {
    const key = e.host || e.name;
    if (seenHosts.has(key) || systems.length >= 8) continue;
    seenHosts.add(key);
    systems.push([e.host || e.name, KIND_LABEL[e.kind] || e.kind]);
  }
  const rest = facts.counts.integration.restResources;
  if (rest) systems.push([t(dict, 'context.callers'), `${t(dict, 'context.rest')} · ${rest} API`]);

  const m = facts.modules;
  const caps = m.clouds.map((x) => x.name.replace(/ \(.*\)$/, ''));
  for (const p of m.products) if (!caps.some((x) => p.startsWith(x))) caps.push(p);
  if (m.omniChannel && !caps.includes('Omni-Channel')) caps.push('Omni-Channel');
  if (m.cti) caps.push('CTI');
  if (!caps.length) caps.push('Lightning Platform');

  const rows = Math.max(actors.length, systems.length, 4);
  const H = Math.max(360, 70 + rows * 64);
  const svg = new Svg(1180, H, t(dict, 'context.caption'));
  // actors
  const ay = (i, n) => 50 + i * ((H - 80) / n);
  actors.forEach(([name, sub], i) => svg.box(20, ay(i, actors.length) + 6, 230, 50, 'actor', [clip(name, 30), clip(sub, 34)]));
  // salesforce org
  const gx = 320, gw = 520;
  svg.group(gx, 30, gw, H - 50, `${t(dict, 'context.salesforce')} — ${cfg.client.short || cfg.client.name}`);
  const apps = facts.ui.apps.filter((a) => a.label).slice(0, 4);
  const appW = apps.length ? (gw - 40 - (apps.length - 1) * 10) / apps.length : 0;
  apps.forEach((a, i) => svg.box(gx + 20 + i * (appW + 10), 56, appW, 46, 'sf', [clip(a.label, Math.floor(appW / 8)), a.console ? 'Console' : 'Lightning']));
  const capY = apps.length ? 122 : 60;
  svg.parts.push(`<text x="${gx + 20}" y="${capY}" font-size="12" font-weight="700" fill="#33475B">${esc(t(dict, 'context.platform'))}</text>`);
  const capList = caps.slice(0, 8);
  const capW = (gw - 40 - 10) / 2;
  capList.forEach((c, i) => svg.box(gx + 20 + (i % 2) * (capW + 10), capY + 10 + Math.floor(i / 2) * 40, capW, 32, 'sf', [clip(c, Math.floor(capW / 7.4))], { pill: true }));
  const dataY = capY + 20 + Math.ceil(capList.length / 2) * 40;
  svg.parts.push(`<text x="${gx + 20}" y="${dataY}" font-size="12" font-weight="700" fill="#33475B">${esc(t(dict, 'context.data'))}</text>`);
  svg.box(gx + 20, dataY + 10, capW, 40, 'data', [t(dict, 'context.objects', { n: facts.counts.objects.custom })]);
  svg.box(gx + 30 + capW, dataY + 10, capW, 40, 'data', [t(dict, 'context.cmdt', { n: facts.counts.cmdt.types })]);
  // external systems
  const sy = (i, n) => 50 + i * ((H - 80) / Math.max(n, 1));
  systems.forEach(([name, sub], i) => svg.box(930, sy(i, systems.length) + 6, 230, 50, 'ext', [clip(name, 30), clip(sub, 34)]));
  // arrows
  actors.forEach((_, i) => svg.arrow([[250, ay(i, actors.length) + 31], [gx, ay(i, actors.length) + 31]]));
  systems.forEach((s, i) => {
    const y = sy(i, systems.length) + 31;
    const inbound = s[0] === t(dict, 'context.callers');
    svg.arrow(inbound ? [[930, y], [gx + gw, y]] : [[gx + gw, y], [930, y]], { dashed: inbound });
  });
  return svg.render();
}

/** Logical layers block (HTML), with counts from facts. */
export function layersBlock(facts, dict) {
  const c = facts.counts;
  const L = (k, n) => t(dict, `layers.${k}`, { n });
  const span = (s) => `<span>${esc(s)}</span>`;
  const row = (cls, title, items) => `<div class="layer${cls ? ' ' + cls : ''}"><div class="ln">${esc(title)}</div><div class="li">${items.filter(Boolean).map(span).join('')}</div></div>`;
  const pres = [c.ui.apps && L('apps', c.ui.apps), c.ui.flexipages && L('pages', c.ui.flexipages), c.ui.lwc && L('lwc', c.ui.lwc) + (c.ui.aura ? ' · ' + L('aura', c.ui.aura) : ''), c.omni.scriptsActive && L('os', c.omni.scriptsActive), c.ui.vfPages && L('vf', c.ui.vfPages)];
  const orch = [c.flows.active && L('flows', c.flows.active), c.omni.ipsActive && L('ips', c.omni.ipsActive), c.omni.dataMappers && L('dms', c.omni.dataMappers)];
  const svc = [c.apex.triggers && L('triggers', c.apex.triggers), c.apex.auraEnabled && L('controllers', c.apex.auraEnabled), L('services', c.apex.classes), (c.apex.batch + c.apex.queueable + c.apex.schedulable + c.apex.future) && L('async')];
  const data = [L('standard'), c.objects.custom && L('custom', c.objects.custom), c.cmdt.types && L('cmdt', c.cmdt.types), L('files')];
  const integ = [c.integration.namedCredentials && L('nc', c.integration.namedCredentials), c.integration.externalCredentials && L('ec', c.integration.externalCredentials), c.integration.restResources && L('rest', c.integration.restResources), c.integration.connectedApps && L('apps2', c.integration.connectedApps)];
  return `<div class="layers">\n${row('', L('presentation'), pres)}\n${row('', L('orchestration'), orch.length && orch.some(Boolean) ? orch : ['—'])}\n${row('', L('servicesTitle'), svc)}\n${row('data', L('data'), data)}\n${row('int', L('integration'), integ.some(Boolean) ? integ : ['—'])}\n</div>\n<p class="figcap">Figure — ${esc(L('caption'))}</p>`;
}
