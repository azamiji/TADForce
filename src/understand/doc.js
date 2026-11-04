// What a writer must know of the document as a whole, computed by the CLI for each write group:
//   figures  — FIGURE OWNERSHIP: every model figure (@@SEQ@@, @@STATE@@, @@ERD-DOMAIN@@) belongs to exactly one
//              section; every other section links to it with {{ref:<anchor>}} (understanding/figures.json)
//   context  — the chapters already written: headings and the first sentence of each section, so that later
//              chapters neither repeat nor contradict them
//   resume   — the sections of the group's files already written and still pending (a run interrupted by a
//              usage limit resumes where it stopped)
//   parts    — the sections of a large group cut in parts, written and saved one part after the other
//   questions — understanding/questions.md, the doubts the writers noted, deduplicated per section
import fs from 'node:fs';
import path from 'node:path';
import { exists, readText, writeJson } from '../util/fsx.js';
import { TEMPLATES } from '../util/paths.js';
import { templateLang } from '../util/i18n.js';
import { resolveConditionals } from '../build/directives.js';

const MARKER = /<!--\s*tad:pending\s+([\w.-]+)\s*-->/g;
const HAS_MARKER = /<!--\s*tad:pending\s+[\w.-]+\s*-->/;

/** Section id → { doc, chapter, file } from the skeletons of the document language. */
export function skeletonMap(ctx, docs = ['tad', 'axes']) {
  const lang = templateLang(ctx.cfg.language);
  const out = {};
  for (const doc of docs) {
    const dir = path.join(TEMPLATES, doc, lang);
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      for (const m of readText(path.join(dir, f)).matchAll(MARKER)) if (!out[m[1]]) out[m[1]] = { doc, chapter: f.slice(0, 2), file: f };
    }
  }
  return out;
}

// --------------------------------------------------------------- figure ownership

/**
 * One owner section per figure of the model. Processes are told in chapter 5 (functional.processes); a
 * lifecycle with the process of its domain in chapter 5, otherwise with its domain in chapter 6; the ERD of a
 * domain in chapter 6 (data.domains). Each owner puts the figure under a heading carrying `anchor`.
 * @param {object} model      understanding/model.json
 * @param {Function} isActive section id → true when the section is part of this org's outline
 */
export function figureOwnership(model, isActive = () => true) {
  const pick = (cands) => cands.find((id) => isActive(id)) || cands[0];
  const anchorFor = (owner, kind, id) => {
    if (kind === 'sequence') return owner === 'functional.processes' ? `fn-${id}` : `seq-${id}`;
    if (kind === 'state') return `lc-${id}`;
    return owner === 'data.domains' ? `data-${id}` : `erd-${id}`;
  };
  const processDomains = new Set((model?.processes || []).map((p) => p.domain).filter(Boolean));
  const processObjects = new Set((model?.domains || []).filter((d) => processDomains.has(d.id)).flatMap((d) => d.objects || []));
  const figures = [];
  const add = (kind, directive, id, title, owner) => figures.push({ kind, directive, id, title: title || id, owner, anchor: anchorFor(owner, kind, id) });
  for (const p of model?.processes || []) add('sequence', `@@SEQ:${p.id}@@`, p.id, p.name, pick(['functional.processes', 'application.sequences', 'integration.systems']));
  for (const l of model?.lifecycles || []) {
    const told = processObjects.has(l.object);
    add('state', `@@STATE:${l.id}@@`, l.id, [l.object, l.field].filter(Boolean).join('.'), pick(told ? ['functional.processes', 'data.domains'] : ['data.domains', 'functional.processes']));
  }
  for (const d of model?.domains || []) if ((d.objects || []).length) add('erd-domain', `@@ERD-DOMAIN:${d.id}@@`, d.id, d.name, pick(['data.domains', 'functional.domains']));
  const bySection = {};
  for (const f of figures) (bySection[f.owner] ||= []).push(f.directive);
  return { version: 1, rule: 'Each figure appears once, in its owner section, under a heading that carries its anchor; every other section links to it with {{ref:<anchor>}}.', figures, bySection };
}

/** The figures of one write group: those its sections own, and those it links to. */
export function groupFigures(ownership, sectionIds, skeleton = {}) {
  const mine = new Set(sectionIds);
  const own = ownership.figures.filter((f) => mine.has(f.owner)).map((f) => ({ directive: f.directive, section: f.owner, anchor: f.anchor, title: f.title }));
  const link = ownership.figures.filter((f) => !mine.has(f.owner)).map((f) => ({ directive: f.directive, title: f.title, owner: f.owner, chapter: skeleton[f.owner]?.chapter || null, ref: `{{ref:${f.anchor}}}` }));
  return { own, link };
}

/** Write understanding/figures.json. */
export function writeFigures(ctx, ownership) {
  writeJson(ctx.p('understanding', 'figures.json'), ownership);
  return ownership;
}

// --------------------------------------------------------------- document context

const firstSentence = (text, max = 180) => {
  const t = text.replace(/\s+/g, ' ').replace(/\{\{(?:n|ref):([^}]+)\}\}/g, '$1').trim();
  const m = /^(.+?[.!?])(?:\s|$)/.exec(t);
  const s = m ? m[1] : t;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
};

/** Headings (levels 1 to 3) of a written chapter and the first sentence of each one's text. */
export function chapterOutline(text) {
  const headings = [], summary = [];
  const lines = text.split('\n');
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    const h = /^(#{1,3})\s+(.+?)\s*(\{[^}]*\})?\s*$/.exec(l);
    if (!h) continue;
    headings.push(h[2]);
    // the first prose paragraph under the heading (before the next heading)
    let para = '';
    for (let j = i + 1; j < lines.length && !/^#{1,6}\s/.test(lines[j]); j++) {
      const x = lines[j].trim();
      if (!x) { if (para) break; continue; }
      if (/^(\||@@|<|>\s*\[!|```|~~~|Figure\s*:|!\[|-{3,}|\{-\})/.test(x)) { if (para) break; continue; }
      para += ' ' + x.replace(/^[-*]\s+|^\d+\.\s+/, '');
    }
    summary.push(para ? firstSentence(para) : '');
  }
  return { headings, summary };
}

/**
 * The chapters already written (no pending section left), other than those of the group: what earlier stages
 * say, so that a writer does not repeat or contradict them.
 */
export function docContext(ctx, scope, { docs = ['tad'], exclude = [] } = {}) {
  const out = [];
  for (const doc of docs) {
    const dir = ctx.p('src', doc);
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      const rel = `${doc}-${f.slice(0, 2)}`;
      if (exclude.includes(rel)) continue;
      const text = resolveConditionals(readText(path.join(dir, f)), scope);
      if (HAS_MARKER.test(text)) continue;
      const o = chapterOutline(text);
      if (!o.summary.some(Boolean)) continue;
      out.push({ doc, chapter: f.slice(0, 2), headings: o.headings, summary: o.summary });
    }
  }
  return out;
}

// --------------------------------------------------------------- parts and resume

export const PART_SIZE = 3;

/** Cut the sections of a group into parts written and saved one after the other (same file: never in parallel). */
export function sectionParts(sections, size = PART_SIZE) {
  const parts = [];
  sections.forEach((s, i) => {
    const n = Math.floor(i / size) + 1;
    s.part = n;
    if (!parts[n - 1]) parts[n - 1] = { part: n, sections: [] };
    parts[n - 1].sections.push(s.id);
  });
  return parts;
}

/** Sections of the group's chapters already written and still pending (skeleton minus the markers left). */
export function resumeHint(skeleton, chapters, doc, pendingIds, isActive = () => true) {
  const all = Object.entries(skeleton).filter(([id, s]) => s.doc === doc && chapters.includes(s.chapter) && isActive(id)).map(([id]) => id);
  const pending = new Set(pendingIds);
  const written = all.filter((id) => !pending.has(id));
  return {
    pending: [...pending],
    written,
    hint: written.length
      ? `${written.length} section(s) of this group are already written (an earlier run): keep them as they are and write only the pending ones, saving the file after each section.`
      : 'Write the pending sections in order and save the file after each section: an interrupted run resumes from the markers left.',
  };
}

// --------------------------------------------------------------- questions.md

const SECTION_LINE = /^\s*(?:[-*+]|\d+[.)])?\s*(?:\*\*)?(?:\[`?([a-z][\w-]*\.[A-Za-z][\w.-]*)`?\](?:\*\*)?\s*[:—–-]?|`?([a-z][\w-]*\.[A-Za-z][\w.-]*)`?(?:\*\*)?\s*(?:[:—–]|\s-\s))\s*(.+)$/;

/** understanding/questions.md → [{ section, text }], deduplicated per section (same text once). */
export function readQuestions(ctx) {
  const file = ctx.p('understanding', 'questions.md');
  if (!exists(file)) return [];
  const out = [];
  const seen = new Set();
  let current = null;
  for (const raw of readText(file).split('\n')) {
    const line = raw.replace(/\r$/, '');
    const h = /^#{1,6}\s+`?([a-z][\w-]*\.[A-Za-z][\w.-]*)`?\s*$/.exec(line.trim());
    if (h) { current = h[1]; continue; }
    if (/^#{1,6}\s/.test(line.trim())) { current = null; continue; }
    const m = SECTION_LINE.exec(line);
    let section = null, text = null;
    if (m) { section = m[1] || m[2]; text = m[3]; } else if (/^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)) { section = current; text = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''); }
    if (!text) continue;
    text = text.trim();
    // eslint-disable-next-line no-control-regex
    text = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
    const key = `${section || ''}|${text.toLowerCase().replace(/\W+/g, ' ').trim()}`;
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push({ section, text });
  }
  return out;
}
