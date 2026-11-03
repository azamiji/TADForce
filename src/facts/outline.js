// The dynamic outline: which sections this org's document has (sections.yml › when), and the skeleton
// edits that follow — a section about something the org does not have is never written, never left empty.
import path from 'node:path';
import { readYaml } from '../util/fsx.js';
import { TEMPLATES } from '../util/paths.js';
import { evaluateWhen } from './when.js';

export const loadSectionSpecs = () => readYaml(path.join(TEMPLATES, 'specs', 'sections.yml'), {});

/** Ids of the active sections, in sections.yml order. `facts` should carry `org` (org facts) when known. */
export function activeSections(facts, specs = loadSectionSpecs()) {
  return Object.entries(specs.sections || {}).filter(([, s]) => evaluateWhen(s && s.when, facts)).map(([id]) => id);
}

/** A predicate « is this section active? »; unknown ids (custom markers) are always active. */
export function sectionFilter(facts, specs = loadSectionSpecs()) {
  const all = specs.sections || {};
  return (id) => !all[id] || evaluateWhen(all[id].when, facts);
}

/** Required anchors of a document: plain ids, or { id, when } kept only when the condition holds. */
export function requiredAnchors(doc, facts, specs = loadSectionSpecs()) {
  return ((specs.requiredAnchors || {})[doc] || []).filter((a) => typeof a === 'string' || evaluateWhen(a.when, facts)).map((a) => (typeof a === 'string' ? a : a.id));
}

const HEADING = /^(#{1,6})\s/;
const ANCHOR = /\{[^}]*#([\w-]+)[^}]*\}\s*$/;
const MARKER = /<!--\s*tad:pending\s+([\w.-]+)\s*-->/;
const IF = /^\s*<!--\s*tad:if\b/, ELSE = /^\s*<!--\s*tad:else\s*-->/, ENDIF = /^\s*<!--\s*tad:endif\s*-->/;
const level = (l) => { const m = HEADING.exec(l); return m ? m[1].length : 0; };
const anchorOf = (l) => (level(l) ? (ANCHOR.exec(l) || [])[1] || null : null);

/** Index of the endif matching the tad:if at `i` (or the end of the text). */
function matchingEnd(lines, i) {
  let d = 0;
  for (let k = i; k < lines.length; k++) { if (IF.test(lines[k])) d++; else if (ENDIF.test(lines[k]) && --d === 0) return k; }
  return lines.length;
}

/** End (exclusive) of the section that starts with the heading at `h`: its sub-sections included, its conditional block respected. */
export function sectionEnd(lines, h) {
  const L = level(lines[h]);
  let depth = 0;
  for (let k = h + 1; k < lines.length; k++) {
    const line = lines[k];
    if (IF.test(line)) {
      if (depth === 0 && lines.slice(k + 1, matchingEnd(lines, k)).some((x) => level(x) && level(x) <= L)) return k;
      depth++;
    } else if (ENDIF.test(line)) { if (depth === 0) return k; depth--; } else if (ELSE.test(line)) { if (depth === 0) return k; } else if (level(line) && level(line) <= L) return k;
  }
  return lines.length;
}

/** The sections of a skeleton: one per pending marker, with the heading above it. */
export function skeletonSections(text) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const m = MARKER.exec(line);
    if (!m) return;
    let h = i - 1;
    while (h >= 0 && !level(lines[h])) h--;
    out.push({ id: m[1], line: i, heading: h, level: h >= 0 ? level(lines[h]) : 0, anchor: h >= 0 ? anchorOf(lines[h]) : null });
  });
  return out;
}

// a line that carries no written text: blank, heading, directive, conditional, pending marker
const generated = (l) => !l.trim() || level(l) || /^\s*<!--\s*tad:/.test(l) || /^\s*@@[A-Z]+[^@]*@@\s*$/.test(l);

/** Tidy after removals: empty conditional blocks go, blank lines collapse. */
function tidy(lines) {
  let text = lines.join('\n');
  for (let prev = null; prev !== text;) { prev = text; text = text.replace(/^[ \t]*<!--\s*tad:if[^\n]*-->[ \t]*\n(?:[ \t]*\n)*[ \t]*<!--\s*tad:endif\s*-->[ \t]*(\n|$)/m, ''); }
  return text.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '') + '\n';
}

/**
 * Remove the inactive sections still pending. A section goes whole (heading, generated tables, sub-sections)
 * when nothing in it was written and no active section lives under it; otherwise only its marker goes.
 * Written text is never removed: those sections are returned in `kept`.
 */
export function filterSkeleton(text, isActive) {
  let lines = text.split('\n');
  const removed = [], kept = [];
  for (let guard = 0; guard < 500; guard++) {
    const s = skeletonSections(lines.join('\n')).find((x) => !isActive(x.id));
    if (!s) break;
    removed.push(s.id);
    if (s.heading >= 0 && s.level >= 2) {
      const end = sectionEnd(lines, s.heading);
      const body = lines.slice(s.heading, end);
      const activeInside = body.some((l) => { const m = MARKER.exec(l); return m && isActive(m[1]); });
      if (!activeInside && body.every(generated)) { lines.splice(s.heading, end - s.heading); continue; }
      if (!body.every(generated)) kept.push(s.id);
    }
    lines.splice(s.line, 1);
  }
  return { text: tidy(lines), removed, kept };
}

/**
 * Bring a workspace chapter in line with the outline, from its template: active sections missing from it
 * are added (at their place in the template), inactive ones still pending are removed, inactive ones
 * already written are kept and reported (`kept`) — never deleted.
 */
export function syncSkeleton(template, current, isActive) {
  const f = filterSkeleton(current, isActive);
  let lines = f.text.replace(/\n$/, '').split('\n');
  const kept = [...f.kept];
  const anchorsIn = () => new Set(lines.map(anchorOf).filter(Boolean));
  const markersIn = () => new Set(lines.map((l) => (MARKER.exec(l) || [])[1]).filter(Boolean));
  // written sections whose subject is gone: their heading is still there, their marker is not
  for (const s of skeletonSections(template)) if (!isActive(s.id) && s.anchor && anchorsIn().has(s.anchor) && !markersIn().has(s.id) && !kept.includes(s.id) && s.level >= 2) kept.push(s.id);
  const tpl = template.split('\n');
  const added = [];
  for (const s of skeletonSections(template)) {
    if (!isActive(s.id) || markersIn().has(s.id)) continue;
    if (s.anchor && anchorsIn().has(s.anchor)) continue; // written: the marker was replaced by the text
    if (s.heading < 0 || s.level < 2 || !s.anchor) continue;
    const end = sectionEnd(tpl, s.heading);
    const block = filterSkeleton(tpl.slice(s.heading, end).join('\n'), isActive).text.replace(/\n$/, '').split('\n');
    // before the first section that follows it in the template and exists here (outside its conditional block)
    const after = tpl.slice(end).map(anchorOf).filter(Boolean);
    const have = anchorsIn();
    const next = after.find((a) => have.has(a));
    let at = lines.length;
    if (next) {
      at = lines.findIndex((l) => anchorOf(l) === next);
      let k = at - 1;
      while (k >= 0 && !lines[k].trim()) k--;
      if (k >= 0 && IF.test(lines[k])) at = k;
    }
    lines.splice(at, 0, ...(at > 0 && lines[at - 1].trim() ? [''] : []), ...block, '');
    added.push(s.id);
  }
  return { text: tidy(lines), added, removed: f.removed, kept };
}
