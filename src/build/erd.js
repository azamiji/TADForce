// Entity-relationship diagrams drawn as SVG, with a layout of our own: Mermaid's erDiagram puts the
// relationship labels at the middle of curved edges, where they overlap as soon as a few objects
// share a parent. Here parents sit above their children, every edge gets its own horizontal lane
// (so two labels never share a line), and edges that skip a row run in side corridors.
import { t } from '../util/i18n.js';

export const ERD_MAX = 8;
const KEY_FIELDS = 4;
const MAX_ROWS = 9;
const MAXW = 860; // a row wider than this wraps: the figure must stay readable on an A4 page
const FS = 12; // field font size (user units)
const HFS = 13; // header font size
const ROW = 19;
const HEAD = 28;
const GAPX = 36;
const LANE = 20;
const END = 28; // room for the cardinality glyphs between a box and the first / last lane
const CORR = 16;

const C = { fill: '#FFFFFF', head: '#D4EEDD', stroke: '#2E9E5B', ink: '#0E3B22', muted: '#4F5F6F', line: '#4F5F6F', label: '#1B2632' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tw = (s, fs) => String(s).length * fs * 0.6; // text width estimate (Segoe UI / Arial)
const KEY_RE = /(status|stage|type|amount|score|code|number|date|name|channel|segment|outcome|region|category|priority|rating)/i;

/**
 * What an ER diagram of these objects shows, from the facts only: entities with their key fields
 * (FK: lookups / master-details, UK: external IDs and unique fields, then up to KEY_FIELDS more)
 * and the relationships between the chosen objects (label = field name).
 */
export function erdModel(facts, names, dict = {}) {
  const byName = new Map(facts.data.objects.map((o) => [o.name, o]));
  const set = new Set(names.filter((n) => byName.has(n)));
  const missing = names.filter((n) => !byName.has(n));
  const L = (k, d) => (dict && dict.erd ? t(dict, 'erd.' + k) : d);
  const entities = [];
  const edges = [];
  for (const nm of set) {
    const o = byName.get(nm);
    const fields = new Map((o.fields || []).map((f) => [f.name, f]));
    const rows = [];
    const seen = new Set();
    const push = (r) => { if (!seen.has(r.name)) { seen.add(r.name); rows.push(r); } };
    // relations inside the diagram first, then the others (to objects outside it)
    const rels = [...o.relations].sort((a, b) => Number(b.to.some((x) => set.has(x))) - Number(a.to.some((x) => set.has(x))) || a.field.localeCompare(b.field));
    for (const r of rels) {
      const md = r.type === 'MasterDetail';
      push({ key: 'FK', name: r.field, type: `${md ? L('md', 'M-D') + ' ' : ''}→ ${r.to.length > 1 ? r.to.slice(0, 2).join(' | ') : r.to[0]}` });
      for (const to of r.to) {
        if (!set.has(to) || to === nm) continue;
        const f = fields.get(r.field);
        edges.push({ parent: to, child: nm, field: r.field, md, required: md || !!(f && f.required) });
      }
    }
    const uniques = [...new Set([...(o.externalIds || []), ...(o.fields || []).filter((f) => f.unique || f.externalId).map((f) => f.name)])];
    for (const u of uniques) push({ key: 'UK', name: u, type: (fields.get(u) && fields.get(u).type) || L('externalId', 'External ID') });
    const pool = (o.fields && o.fields.length ? o.fields.map((f) => f.name) : o.customFieldNames || []).filter((f) => !seen.has(f));
    const keyed = pool.filter((f) => KEY_RE.test(f)).concat(pool.filter((f) => !KEY_RE.test(f)));
    for (const f of keyed.slice(0, KEY_FIELDS)) push({ key: '', name: f, type: (fields.get(f) && fields.get(f).type) || '' });
    const total = rows.length;
    const shown = rows.slice(0, MAX_ROWS);
    const more = total - shown.length + Math.max(0, pool.length - KEY_FIELDS);
    entities.push({ name: nm, label: o.label || null, rows: shown, more: more > 0 ? more : 0 });
  }
  return { entities, edges, missing };
}

/** Rank (parents above children), order (barycentre), wrap wide rows, route every edge in its own lane. */
export function erdLayout(model) {
  const ents = model.entities.map((e, i) => {
    const width = Math.max(170, Math.min(340, Math.max(tw(e.name, HFS) + 28, ...e.rows.map((r) => tw(r.name, FS) + tw(r.type, FS - 1) + 58))));
    const height = HEAD + Math.max(1, e.rows.length + (e.more ? 1 : 0)) * ROW + 6;
    return { ...e, i, w: Math.round(width), h: height };
  });
  const idx = new Map(ents.map((e) => [e.name, e]));
  const edges = model.edges.filter((e) => idx.has(e.parent) && idx.has(e.child)).map((e, k) => ({ ...e, k, p: idx.get(e.parent), c: idx.get(e.child) }));

  // ranks: longest path from the roots, cycles broken in a stable DFS order
  const out = new Map(ents.map((e) => [e, []]));
  const back = new Set();
  const state = new Map();
  const dfs = (e) => {
    state.set(e, 1);
    for (const ed of edges.filter((x) => x.p === e)) {
      if (ed.c === e) continue;
      if (state.get(ed.c) === 1) { back.add(ed); continue; }
      out.get(e).push(ed.c);
      if (!state.get(ed.c)) dfs(ed.c);
    }
    state.set(e, 2);
  };
  for (const e of ents) if (!state.get(e)) dfs(e);
  const rank = new Map();
  const rk = (e, guard = 0) => {
    if (rank.has(e)) return rank.get(e);
    const parents = edges.filter((x) => x.c === e && !back.has(x) && x.p !== e).map((x) => x.p);
    const r = parents.length && guard < 20 ? Math.max(...parents.map((p) => rk(p, guard + 1) + 1)) : 0;
    rank.set(e, r);
    return r;
  };
  ents.forEach((e) => rk(e));
  const ranks = [];
  for (const e of ents) (ranks[rank.get(e)] ||= []).push(e);
  const R = ranks.filter(Boolean);

  // order inside ranks: a few barycentre sweeps
  const pos = new Map();
  const setPos = () => R.forEach((row) => row.forEach((e, i) => pos.set(e, i / Math.max(1, row.length - 1 || 1))));
  setPos();
  for (let s = 0; s < 4; s++) {
    for (const row of s % 2 ? [...R].reverse() : R) {
      const bc = (e) => { const nb = edges.filter((x) => x.p === e || x.c === e).map((x) => (x.p === e ? x.c : x.p)).filter((n) => n !== e); return nb.length ? nb.reduce((a, n) => a + pos.get(n), 0) / nb.length : pos.get(e); };
      const b = new Map(row.map((e) => [e, bc(e)]));
      row.sort((a, c) => b.get(a) - b.get(c) || a.i - c.i);
      setPos();
    }
  }

  // levels: ranks wrapped so that no row is wider than MAXW
  const levels = [];
  for (const row of R) {
    let cur = [], w = 0;
    for (const e of row) {
      if (cur.length && w + GAPX + e.w > MAXW) { levels.push(cur); cur = []; w = 0; }
      w += (cur.length ? GAPX : 0) + e.w;
      cur.push(e);
    }
    if (cur.length) levels.push(cur);
  }
  const level = new Map();
  levels.forEach((lv, li) => lv.forEach((e) => level.set(e, li)));
  const contentW = Math.max(...levels.map((lv) => lv.reduce((a, e) => a + e.w, 0) + GAPX * (lv.length - 1)));

  // horizontal positions (rows centred)
  for (const lv of levels) {
    let x = (contentW - (lv.reduce((a, e) => a + e.w, 0) + GAPX * (lv.length - 1))) / 2;
    for (const e of lv) { e.x = Math.round(x); x += e.w + GAPX; }
  }

  // which gap each edge uses: gap g lies above level g (gap L below the last level)
  const L = levels.length;
  const gaps = Array.from({ length: L + 1 }, () => []);
  const corridors = { left: [], right: [] };
  for (const ed of edges) {
    if (ed.p === ed.c) continue;
    const lp = level.get(ed.p), lc = level.get(ed.c);
    ed.adjacent = lc === lp + 1;
    ed.srcGap = lp + 1;
    ed.dstGap = lc;
    gaps[ed.srcGap].push({ ed, end: 'src' });
    if (!ed.adjacent) {
      gaps[ed.dstGap].push({ ed, end: 'dst' });
      const mid = (ed.p.x + ed.p.w / 2 + ed.c.x + ed.c.w / 2) / 2;
      const side = mid > contentW / 2 ? 'right' : 'left';
      corridors[side].push(ed);
      ed.side = side;
    }
  }
  corridors.left.forEach((ed, i) => { ed.cx = -20 - i * CORR; });
  corridors.right.forEach((ed, i) => { ed.cx = contentW + 20 + i * CORR; });

  // ports: outgoing edges spread on the bottom of the parent, incoming on the top of the child
  const far = (ed, who) => (who === 'p' ? (ed.adjacent ? ed.c.x + ed.c.w / 2 : ed.cx) : (ed.adjacent ? ed.p.x + ed.p.w / 2 : ed.cx));
  for (const e of ents) {
    const outs = edges.filter((x) => x.p === e && x.c !== e).sort((a, b) => far(a, 'p') - far(b, 'p') || a.k - b.k);
    outs.forEach((ed, i) => { ed.px = Math.round(e.x + e.w * (0.15 + 0.7 * ((i + 1) / (outs.length + 1)))); });
    const ins = edges.filter((x) => x.c === e && x.p !== e).sort((a, b) => far(a, 'c') - far(b, 'c') || a.k - b.k);
    ins.forEach((ed, i) => { ed.qx = Math.round(e.x + e.w * (0.15 + 0.7 * ((i + 1) / (ins.length + 1)))); });
  }

  // vertical positions: level heights and gap heights (one lane per edge end)
  let y = 0;
  const levelY = [];
  for (let g = 0; g <= L; g++) {
    const lanes = gaps[g];
    // lanes ordered so that horizontal runs cross as little as possible
    lanes.sort((a, b) => (a.end === 'src' ? a.ed.px : a.ed.qx) - (b.end === 'src' ? b.ed.px : b.ed.qx));
    const gh = lanes.length ? END * 2 + (lanes.length - 1) * LANE : (g === 0 || g === L ? 0 : 48);
    lanes.forEach((ln, i) => { const ly = y + END + i * LANE; if (ln.end === 'src') ln.ed.srcY = ly; else ln.ed.dstY = ly; });
    y += gh;
    if (g < L) { levelY[g] = y; y += Math.max(...levels[g].map((e) => e.h)); }
  }
  levels.forEach((lv, li) => lv.forEach((e) => { e.y = levelY[li]; }));
  const height = y;

  for (const ed of edges) {
    if (ed.p === ed.c) continue;
    const y0 = ed.p.y + ed.p.h, y1 = ed.c.y;
    ed.points = ed.adjacent
      ? [[ed.px, y0], [ed.px, ed.srcY], [ed.qx, ed.srcY], [ed.qx, y1]]
      : [[ed.px, y0], [ed.px, ed.srcY], [ed.cx, ed.srcY], [ed.cx, ed.dstY], [ed.qx, ed.dstY], [ed.qx, y1]];
    // label on the last lane, next to the child port, on the side the edge comes from
    const ly = ed.adjacent ? ed.srcY : ed.dstY;
    const fromX = ed.points[ed.points.length - 3][0];
    const lw = tw(ed.field, 11) + 8;
    const left = fromX < ed.qx - 2;
    ed.label = { x: left ? ed.qx - 5 - lw : ed.qx + 5, y: ly - 8, w: lw, h: 16 };
  }
  return { ents, edges: edges.filter((e) => e.p !== e.c), width: contentW, height, corridors };
}

function glyphs(ed) {
  // parent end (one): bars below the parent; child end (many): crow's foot above the child
  const [px, py] = ed.points[0];
  const [qx, qy] = ed.points[ed.points.length - 1];
  const s = [];
  s.push(`<path d="M${px - 6},${py + 7} H${px + 6}" />`);
  if (ed.required) s.push(`<path d="M${px - 6},${py + 12} H${px + 6}" />`);
  else s.push(`<circle cx="${px}" cy="${py + 15}" r="3.6" fill="#fff"/>`);
  s.push(`<path d="M${qx},${qy - 11} L${qx - 7},${qy} M${qx},${qy - 11} L${qx},${qy} M${qx},${qy - 11} L${qx + 7},${qy}" />`);
  s.push(`<circle cx="${qx}" cy="${qy - 16}" r="3.6" fill="#fff"/>`);
  return s.join('');
}

/** SVG of an ER diagram; returns '' when there is nothing to draw. */
export function erdSvg(model, title = '') {
  if (!model.entities.length) return '';
  const lay = erdLayout(model);
  const parts = [];
  let minX = 0, maxX = lay.width, maxY = lay.height;
  for (const ed of lay.edges) {
    const d = 'M' + ed.points.map(([a, b]) => `${a},${b}`).join(' L');
    parts.push(`<path class="er-edge" d="${d}" fill="none" stroke="${C.line}" stroke-width="1.3"${ed.md ? '' : ' stroke-dasharray="5 3"'}/>`);
    parts.push(`<g class="er-card" fill="none" stroke="${C.line}" stroke-width="1.3">${glyphs(ed)}</g>`);
    for (const [x] of ed.points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  }
  for (const ed of lay.edges) {
    const l = ed.label;
    minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x + l.w);
    parts.push(`<rect x="${l.x.toFixed(1)}" y="${l.y}" width="${l.w.toFixed(1)}" height="${l.h}" rx="3" fill="#fff" opacity="0.92"/>`);
    parts.push(`<text class="er-label" x="${(l.x + 4).toFixed(1)}" y="${l.y + 12}" font-size="11" font-style="italic" fill="${C.label}">${esc(ed.field)}</text>`);
  }
  for (const e of lay.ents) {
    parts.push(`<g class="er-entity"><title>${esc(e.label ? `${e.name} — ${e.label}` : e.name)}</title>`);
    parts.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="6" fill="${C.fill}" stroke="${C.stroke}" stroke-width="1.4"/>`);
    parts.push(`<path d="M${e.x},${e.y + HEAD} V${e.y + 6} a6,6 0 0 1 6,-6 H${e.x + e.w - 6} a6,6 0 0 1 6,6 V${e.y + HEAD} Z" fill="${C.head}" stroke="${C.stroke}" stroke-width="1.4"/>`);
    parts.push(`<text x="${e.x + e.w / 2}" y="${e.y + 19}" text-anchor="middle" font-size="${HFS}" font-weight="700" fill="${C.ink}">${esc(e.name)}</text>`);
    e.rows.forEach((r, i) => {
      const ry = e.y + HEAD + i * ROW + 14;
      if (r.key) parts.push(`<text x="${e.x + 8}" y="${ry}" font-size="10.5" font-weight="700" fill="${r.key === 'FK' ? '#2F6FE4' : '#B5530B'}">${r.key}</text>`);
      parts.push(`<text x="${e.x + 32}" y="${ry}" font-size="${FS}" fill="${C.ink}">${esc(r.name)}</text>`);
      if (r.type) {
        // the type column gives way to the field name when the box is at its widest
        const room = Math.floor((e.w - 58 - tw(r.name, FS)) / ((FS - 1) * 0.6));
        const type = r.type.length > room ? r.type.slice(0, Math.max(3, room - 1)) + '…' : r.type;
        parts.push(`<text x="${e.x + e.w - 8}" y="${ry}" text-anchor="end" font-size="${FS - 1}" fill="${C.muted}">${esc(type)}</text>`);
      }
    });
    if (e.more) parts.push(`<text x="${e.x + 32}" y="${e.y + HEAD + e.rows.length * ROW + 14}" font-size="${FS - 1}" font-style="italic" fill="${C.muted}">+ ${e.more}</text>`);
    if (!e.rows.length && !e.more) parts.push(`<text x="${e.x + 32}" y="${e.y + HEAD + 14}" font-size="${FS - 1}" fill="${C.muted}">Id</text>`);
    parts.push('</g>');
  }
  const pad = 12;
  const vx = Math.floor(minX - pad), vw = Math.ceil(maxX - minX + 2 * pad), vh = Math.ceil(maxY + 2 * pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="erd" viewBox="${vx} ${-pad} ${vw} ${vh}" width="${vw}" role="img" aria-label="${esc(title)}" style="font-family:Segoe UI,Arial,sans-serif;max-width:100%">${parts.join('')}</svg>`;
}
