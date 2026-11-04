// Mermaid sources generated from the understanding model (tadforce/understanding/model.json):
// numbered sequence diagrams of the processes, state diagrams of the lifecycles.
import { t } from '../util/i18n.js';
import { LEGEND } from './figures.js';

// Mermaid statement separators and entity codes break a diagram: keep labels plain.
const plain = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/;/g, ',').replace(/#/g, 'No ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
// in a state diagram « : » ends the state or transition: a label never holds one
const stateLabel = (s) => plain(s).replace(/\s*:\s*/g, ' – ');
const KIND_ORDER = { actor: 0, component: 1, object: 2, external: 3 };
const KIND_BOX = { actor: 'actor', component: 'sf', object: 'data', external: 'ext' };

/**
 * Subject of a group label: the text before the first « : » or « — ». Consecutive `alt` (or `par`)
 * groups that share a subject but not a label are branches of one block: « Score: high » then
 * « Score: low » become `alt Score: high … else Score: low … end`. Without a separator the whole
 * label is the subject, so only identical labels continue the same branch.
 */
export function groupSubject(label) {
  const m = /^(.*?)\s*(?::|\s—\s|\s–\s)/.exec(String(label || ''));
  return (m ? m[1] : String(label || '')).trim().toLowerCase();
}

/** Most participants a sequence keeps before it is simplified (more: text below the readable size on A4). */
export const SEQ_MAX = 7;
const SEQ_LABEL = 28;

const shorten = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)).trimEnd() + '…' : s);

/**
 * Lanes of a sequence with too many participants (deterministic):
 *  1. the data objects (kind `object`) share one lane, « Data » / « Données », when there are two or more;
 *  2. then, left to right, two consecutive participants of the same kind that never exchange a message
 *     share one lane « A / B » (two participants at most per lane);
 *  3. a lane label longer than 28 characters (20 in the simplified variant) is cut with « … »: the full
 *     names go to the table under the figure (`notes`).
 * Applied when the process has more than SEQ_MAX participants, or always with `simplify` (the variant the
 * visual QA asks for), which aims at 5 lanes.
 */
export function sequenceLanes(parts, steps, dict, { simplify = false } = {}) {
  const target = simplify ? 5 : SEQ_MAX;
  const maxLabel = simplify ? 20 : SEQ_LABEL;
  const full = (p) => plain(p.label || p.ref || p.id) || String(p.id);
  let lanes = parts.map((p) => ({ kind: p.kind, members: [p], label: full(p) }));
  const active = parts.length > SEQ_MAX || simplify;
  const notes = [];
  if (!active) return { lanes, notes, simplified: false };
  const ids = (l) => new Set(l.members.map((m) => m.id));
  const talks = (a, b) => { const A = ids(a), B = ids(b); return steps.some((s) => (A.has(s.from) && B.has(s.to)) || (B.has(s.from) && A.has(s.to))); };
  const data = lanes.filter((l) => l.kind === 'object');
  if (lanes.length > target && data.length >= 2) {
    const lane = { kind: 'object', members: data.flatMap((l) => l.members), label: t(dict, 'figures.seqData'), data: true };
    lanes = lanes.flatMap((l) => (l === data[0] ? [lane] : data.includes(l) ? [] : [l]));
  }
  for (let i = 0; i + 1 < lanes.length && lanes.length > target; i++) {
    const a = lanes[i], b = lanes[i + 1];
    if (a.kind !== b.kind || a.data || b.data || a.members.length > 1 || b.members.length > 1 || talks(a, b)) continue;
    lanes.splice(i, 2, { kind: a.kind, members: [...a.members, ...b.members], label: `${a.label} / ${b.label}` });
  }
  for (const l of lanes) {
    const whole = l.data ? l.members.map(full).join(', ') : l.label;
    const shown = l.data ? l.label : whole.length <= maxLabel ? whole : l.members.length > 1
      ? l.members.map((m) => shorten(full(m), Math.floor((maxLabel - 3) / 2))).join(' / ')
      : shorten(l.label, maxLabel);
    l.label = shown;
    if (shown !== whole) notes.push({ lane: shown, full: whole });
  }
  return { lanes, notes, simplified: true };
}

/**
 * sequenceDiagram of a model process. Returns { code, warnings, notes }: `notes` lists the lanes whose
 * label is not the full name of the participants (simplified sequences, see sequenceLanes()).
 */
export function sequenceCode(proc, dict, { simplify = false } = {}) {
  const warnings = [];
  const parts = (proc.participants || []).map((p, i) => ({ ...p, kind: KIND_ORDER[p.kind] !== undefined ? p.kind : 'component', first: i }));
  const byId = new Map(parts.map((p) => [p.id, p]));
  for (const s of proc.steps || []) {
    for (const end of [s.from, s.to]) {
      if (end != null && !byId.has(end)) {
        const p = { id: end, label: String(end), kind: 'component', first: parts.length };
        parts.push(p); byId.set(end, p);
        warnings.push(`participant "${end}" is used by a step but not declared`);
      }
    }
  }
  // left to right as in the context view: actors, Salesforce components, data, external systems
  parts.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.first - b.first);
  const { lanes, notes } = sequenceLanes(parts, proc.steps || [], dict, { simplify });
  const laneOf = new Map();
  lanes.forEach((l, i) => { l.alias = 'P' + (i + 1); for (const m of l.members) laneOf.set(m.id, l); });
  const lines = ['sequenceDiagram', '  autonumber'];
  let i = 0;
  while (i < lanes.length) {
    const kind = lanes[i].kind;
    const run = [];
    while (i < lanes.length && lanes[i].kind === kind) run.push(lanes[i++]);
    const [fill] = LEGEND[KIND_BOX[kind]];
    lines.push(`  box ${rgb(fill)}`);
    for (const l of run) lines.push(`    ${l.kind === 'actor' ? 'actor' : 'participant'} ${l.alias} as ${plain(l.label) || l.alias}`);
    lines.push('  end');
  }
  let open = null; // { kind, label, subject }
  const close = () => { if (open) { lines.push('  end'); open = null; } };
  for (const s of proc.steps || []) {
    if (!laneOf.has(s.from) || !laneOf.has(s.to)) { warnings.push('a step without "from" or "to" was skipped'); continue; }
    const g = s.group && s.group.kind && ['alt', 'opt', 'loop', 'par'].includes(s.group.kind) ? { kind: s.group.kind, label: plain(s.group.label) } : null;
    if (!g) close();
    else if (open && open.kind === g.kind && open.label === g.label) { /* same branch */ }
    else if (open && open.kind === g.kind && (g.kind === 'alt' || g.kind === 'par') && open.subject === groupSubject(g.label)) {
      lines.push(`  ${g.kind === 'alt' ? 'else' : 'and'} ${g.label}`);
      open.label = g.label;
    } else {
      close();
      lines.push(`  ${g.kind} ${g.label}`);
      open = { ...g, subject: groupSubject(g.label) };
    }
    const arrow = s.reply ? (s.async ? '--)' : '-->>') : s.async ? '-)' : '->>';
    const pad = open ? '    ' : '  ';
    lines.push(`${pad}${laneOf.get(s.from).alias}${arrow}${laneOf.get(s.to).alias}: ${plain(s.label) || ' '}`);
  }
  close();
  return { code: lines.join('\n'), warnings, notes };
}

const rgb = (hex) => `rgb(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(',')})`;

/** stateDiagram-v2 of a model lifecycle. Returns { code, warnings }. */
export function stateCode(lc, { simplify = false } = {}) {
  const warnings = [];
  const states = (lc.states || []).map((s, i) => ({ ...s, alias: 'S' + (i + 1) }));
  const byId = new Map(states.map((s) => [s.id, s]));
  const ref = (id) => {
    if (!byId.has(id)) { const s = { id, label: String(id), alias: 'S' + (states.length + 1) }; states.push(s); byId.set(id, s); warnings.push(`state "${id}" is used by a transition but not declared`); }
    return byId.get(id).alias;
  };
  // the simplified variant (asked by the visual QA) is drawn top to bottom: narrower, so larger once fitted
  const lines = ['stateDiagram-v2', `  direction ${states.length <= 4 && !simplify ? 'LR' : 'TB'}`];
  const body = [];
  if (lc.initial != null) body.push(`  [*] --> ${ref(lc.initial)}`);
  for (const tr of lc.transitions || []) body.push(`  ${ref(tr.from)} --> ${ref(tr.to)}${stateLabel(tr.label) ? ' : ' + stateLabel(tr.label) : ''}`);
  for (const f of lc.final || []) body.push(`  ${ref(f)} --> [*]`);
  for (const s of states) lines.push(`  ${s.alias} : ${stateLabel(s.label || s.id) || s.alias}`);
  lines.push(...body);
  const [fill, stroke, ink] = LEGEND.data;
  lines.push(`  classDef data fill:${fill},stroke:${stroke},color:${ink},stroke-width:1.2px`);
  lines.push(`  classDef final fill:${fill},stroke:${ink},color:${ink},stroke-width:2.4px`);
  const finals = new Set((lc.final || []).map((f) => byId.get(f) && byId.get(f).alias).filter(Boolean));
  const normal = states.filter((s) => !finals.has(s.alias)).map((s) => s.alias);
  if (normal.length) lines.push(`  class ${normal.join(',')} data`);
  if (finals.size) lines.push(`  class ${[...finals].join(',')} final`);
  return { code: lines.join('\n'), warnings };
}
