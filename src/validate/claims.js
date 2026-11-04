// Claims check: what the text says, held against what the org has. Deterministic rules, one lexicon
// per language (claims-lexicon.json), each issue located at its source line:
//   absent-feature        a product or feature the facts say the org does not have
//   unproven-schedule     a frequency (« toutes les heures », nightly, cron…) for a component that is not scheduled
//   environment-mismatch  production / sandbox / Developer Edition contradicting the org (or the cover)
//   risk-wording          debt and risk vocabulary in the TAD (it belongs to the Improvement Axes)
//   control-chars         C0 control characters (other than tab and line feed) in a source
//   untranslated          a table header or heading made only of English words in a non-English document
//   duplicate-figure      the same @@SEQ / @@STATE / @@ERD-DOMAIN twice, or outside the section that owns it
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, readText, readYaml } from '../util/fsx.js';
import { TEMPLATES } from '../util/paths.js';
import { normalizeLang, templateLang } from '../util/i18n.js';
import { sourceFlags } from '../util/config.js';
import { loadFacts } from '../facts/index.js';
import { get } from '../build/directives.js';
import { skeletonOf } from './anchors.js';
import fsx from 'node:fs';
import pathx from 'node:path';

export const LEXICON = JSON.parse(readText(fileURLToPath(new URL('./claims-lexicon.json', import.meta.url))));

export const CLAIM_CODES = ['absent-feature', 'unproven-schedule', 'environment-mismatch', 'risk-wording', 'control-chars', 'untranslated', 'duplicate-figure'];

// C0 controls except tab (\t) and line feed (\n); CR is normalised away when sources are read
export const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const baseLang = (lang) => normalizeLang(lang).split('-')[0];

/** The entries of a lexicon group for a document language: any + the language (+ English for French, + generic for others). */
export function terms(entry, lang) {
  if (!entry) return [];
  const l = baseLang(lang);
  const out = [...(entry.any || [])];
  if (l === 'en') out.push(...(entry.en || []));
  else if (l === 'fr') out.push(...(entry.fr || []), ...(entry.en || []));
  else out.push(...(entry.en || []), ...(entry.generic || []));
  return [...new Set(out)];
}

const word = (src) => `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
const compile = (list, flags = 'iu') => (list.length ? new RegExp(list.map(word).join('|'), flags) : null);
const test = (re, s) => !!re && re.test(s);
const mask = (re, s) => (re ? s.replace(new RegExp(re.source, 'giu'), (m) => ' '.repeat(m.length)) : s);
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v);

/** Compiled lexicon of one language (cached). */
const compiled = new Map();
function lexFor(lang) {
  const l = baseLang(lang);
  if (compiled.has(l)) return compiled.get(l);
  const L = LEXICON;
  const env = L.environment || {};
  const out = {
    features: (L.features || []).map((f) => ({ ...f, strongRe: compile(terms(f.strong, l)), weakRe: compile(terms(f.weak, l)) })),
    negation: compile(terms(L.negation, l)),
    proposal: compile(terms(L.proposal, l)),
    frequency: compile(terms(L.frequency, l)),
    scheduled: compile(terms(L.scheduled, l)),
    exempt: compile(terms(L.scheduleExempt, l)),
    jobs: compile(terms(L.jobWords, l)),
    production: compile(terms(env.production, l)),
    goLive: env.goLive ? compile(terms(env.goLive, l)) : null,
    sandbox: compile(terms(env.sandbox, l)),
    developer: compile(terms(env.developer, l)),
    thisSandbox: compile(terms(env.thisSandbox, l)),
    thisProduction: compile(terms(env.thisProduction, l)),
    risk: compile(terms(L.risk, l)),
    riskAllow: compile(terms(L.riskAllow, l)),
  };
  compiled.set(l, out);
  return out;
}

// ---------------------------------------------------------------- reading the sources

/**
 * Lines of a document as the reader gets them: conditional blocks evaluated, code fences, HTML comments
 * and directives set apart. Each line: { f, n, raw, text, kind: 'text'|'heading'|'table'|'directive'|'code'|'skip', active }.
 */
export function sourceLines(files, scope) {
  const out = [];
  const stack = [];
  let inCode = false, inComment = false;
  for (const { f, text } of files) {
    const lines = text.split('\n');
    lines.forEach((raw, i) => {
      const line = { f, n: i + 1, raw, text: raw, kind: 'text', active: true, next: lines[i + 1] || '' };
      out.push(line);
      const mIf = /^\s*<!--\s*tad:if\s+(!?)([\w.|-]+)\s*-->\s*$/.exec(raw);
      const mElse = /^\s*<!--\s*tad:else\s*-->\s*$/.test(raw);
      const mEnd = /^\s*<!--\s*tad:endif\s*-->\s*$/.test(raw);
      if (!inCode && !inComment && (mIf || mElse || mEnd)) {
        line.kind = 'skip';
        if (mIf) { let v = mIf[2].split('|').some((p) => truthy(get(scope, p))); if (mIf[1]) v = !v; stack.push({ on: v }); }
        else if (mElse && stack.length) stack[stack.length - 1].on = !stack[stack.length - 1].on;
        else if (mEnd && stack.length) stack.pop();
        line.active = stack.every((s) => s.on);
        return;
      }
      line.active = stack.every((s) => s.on);
      if (!inComment && raw.trimStart().startsWith('```')) { inCode = !inCode; line.kind = 'code'; return; }
      if (inCode) { line.kind = 'code'; return; }
      let s = raw;
      if (inComment) {
        const end = s.indexOf('-->');
        if (end < 0) { line.kind = 'skip'; return; }
        s = s.slice(end + 3); inComment = false;
      }
      s = s.replace(/<!--[\s\S]*?-->/g, ' ');
      const open = s.indexOf('<!--');
      if (open >= 0) { s = s.slice(0, open); inComment = true; }
      line.text = s;
      if (/^\s*@@[A-Z][A-Z-]*(?::[^@]*)?@@\s*$/.test(s)) line.kind = 'directive';
      else if (/^#{1,6} /.test(s)) line.kind = 'heading';
      else if (/^\s*\|/.test(s)) line.kind = /^\s*\|?[\s|:-]+\|?\s*$/.test(s) && /-{2,}/.test(s) ? 'skip' : 'table';
      else if (!s.trim()) line.kind = 'skip';
    });
  }
  return out;
}

/** Plain text of a source line: placeholders, attributes, tags and emphasis out, `code` kept apart. */
function plainOf(s) {
  s = s.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`').replace(/\{\{[^}]*\}\}/g, ' ').replace(/\s*\{[-#\w\s]*\}\s*$/, '')
    .replace(/<[^>]+>/g, ' ').replace(/^\s*>\s?/, '').replace(/\[!\w+\]/, ' ').replace(/^#{1,6}\s+/, '').replace(/\*\*|__(?=\s)|(?<=\s)__/g, '');
  const codes = [];
  const plain = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c.trim()); return ' ⟦c⟧ '; })
    .replace(/«[^»]{1,60}»/g, ' ⟦q⟧ ').replace(/“[^”]{1,60}”/g, ' ⟦q⟧ ').replace(/(^|[\s(])"[^"]{1,60}"/g, '$1 ⟦q⟧ ');
  return { plain, codes };
}

/** Sentences (or table cells) of a line, each { plain, codes }. */
function sentencesOf(line) {
  const parts = line.kind === 'table'
    ? line.text.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/)
    : line.text.split(/(?<=[.!?;])\s+/);
  return parts.map(plainOf).filter((x) => x.plain.trim() || x.codes.length);
}

// ---------------------------------------------------------------- facts helpers

const KNOWN = (v) => v !== undefined && v !== null;
function featureState(f, facts) {
  const cov = facts.coverageByCount || {};
  const values = (f.absentWhen || []).map((p) => {
    const k = p.replace(/^counts\./, '');
    if (p.startsWith('counts.') && cov[k] === 'missing') return undefined;
    return get(facts, p);
  }).filter(KNOWN);
  if (!values.length) return 'unknown';
  return values.some(truthy) ? 'present' : 'absent';
}
function weakModules(facts) {
  const w = facts.modules && facts.modules.weak;
  if (!w) return new Set();
  return new Set(Array.isArray(w) ? w.map((x) => (x && typeof x === 'object' ? x.id : x)).map(String) : Object.keys(w));
}

/** What the org is: 'production' | 'sandbox' | 'developer' | null (org facts first, then the configured environment). */
export function environmentKind(org, cfgEnv) {
  const o = org && org.organization;
  if (o) {
    if (o.sandbox === true || o.isSandbox === true) return 'sandbox';
    if (/developer/i.test(String(o.edition || o.organizationType || ''))) return 'developer';
    if (o.edition || o.sandbox === false) return 'production';
  }
  return envOfText(cfgEnv);
}
function envOfText(s) {
  s = String(s || '');
  if (/developer|dev edition/i.test(s)) return 'developer';
  if (/sandbox|bac à sable|recette|uat|pré-?prod|pre-?prod|staging|homologation|intégration|integration|test|qa\b|dev\b|scratch/i.test(s)) return 'sandbox';
  if (/prod/i.test(s)) return 'production';
  return null;
}
const ENV_WORD = { production: 'production', sandbox: 'a sandbox', developer: 'a Developer Edition' };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const compId = (c) => String(c).replace(/\(\)$/, '').split('.')[0].trim();

// ---------------------------------------------------------------- the check

/**
 * Check the claims of a document's sources against the org.
 *
 * @param ctx   workspace context (loadWorkspace): cfg, ws, p()
 * @param doc   'tad' | 'axes'
 * @param opts.facts  facts (default: facts/facts.json of the workspace, with facts.org)
 * @param opts.org    org facts (default: facts.org, i.e. facts/org.json)
 * @param opts.model  understanding model (unused by the rules today; accepted for the review task)
 * @param opts.text   sources to check instead of src/<doc>/*.md: a string, or [{ file, text }]
 * @param opts.figures ownership map ({ own: { figureId: sectionId } }; default understanding/figures.json)
 * @returns {Array<{ level: 'error'|'warn', code, message, where }>}
 */
export function claimsCheck(ctx, doc, { facts = null, org, model = null, text = null, figures } = {}) {
  const issues = [];
  const add = (level, code, message, where) => issues.push({ level, code, message, where });
  const cfg = (ctx && ctx.cfg) || {};
  facts = facts || (ctx && ctx.ws ? loadFacts(ctx.ws) : null) || {};
  if (org === undefined) org = facts.org || null;
  const lang = baseLang(cfg.language || 'en');
  const lex = lexFor(lang);
  const glossary = (ctx && typeof ctx.glossary === 'function' && ctx.glossary()) || {};

  // the sources
  let files;
  if (typeof text === 'string') files = [{ f: doc, text, where: (n) => `${doc}:${n}` }];
  else if (Array.isArray(text)) files = text.map((x) => ({ f: x.file || x.f || doc, text: x.text, where: (n) => `${x.file || x.f || doc}:${n}` }));
  else {
    const dir = ctx.p('src', doc);
    files = exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => ({ f, text: readText(path.join(dir, f)), where: (n) => `src/${doc}/${f}:${n}` })) : [];
  }
  const whereOf = new Map(files.map((x) => [x.f, x.where]));
  const at = (line) => whereOf.get(line.f)(line.n);
  const scope = { modules: facts.modules || {}, counts: facts.counts || {}, org: facts.org, cfg, facts, glossary, source: sourceFlags(cfg) };
  const lines = sourceLines(files, scope);

  // control characters: every line, code included (the build strips them)
  for (const line of lines) {
    const found = line.raw.match(CONTROL_CHARS);
    if (found) add('error', 'control-chars', `${found.length} control character(s) (${[...new Set(found)].map((c) => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join(', ')}) in the text: they usually stand for « : » or « ; » lost on the way — retype the punctuation (the build strips them).`, at(line));
  }

  const skel = skeletonOf(doc, templateLang(cfg.language || 'en'));
  // the skeleton sections containing each line: a writer's own headings continue the skeleton section above them
  const stack = [];
  for (const line of lines) {
    if (line.active && line.kind === 'heading') {
      const lvl = /^(#{1,6})/.exec(line.text)[1].length;
      const a = (/\{[^}]*#([\w-]+)[^}]*\}\s*$/.exec(line.text) || [])[1] || null;
      const isSkel = !!a && skel.headings.has(a);
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.lvl > lvl || (top.lvl === lvl && (isSkel || !top.skel))) stack.pop(); else break;
      }
      stack.push({ lvl, anchor: a, skel: isSkel });
    }
    line.anchors = stack.map((x) => x.anchor).filter(Boolean);
  }
  // the outlook chapter speaks of what the org does not have yet
  const FUTURE = new Set(['ch-outlook']);

  const fromTemplate = templateLines(doc, templateLang(cfg.language || 'en'));
  const active = lines.filter((l) => l.active && ['text', 'heading', 'table'].includes(l.kind) && !fromTemplate.has(l.text.trim()));

  // ---- absent-feature
  const weak = weakModules(facts);
  const systemNames = (glossary.systems || []).flatMap((x) => [x.name, x.id]).filter(Boolean).map((x) => escapeRe(String(x)));
  const systemsRe = systemNames.length ? compile(systemNames) : null;
  const states = lex.features.map((f) => ({ f, state: featureState(f, facts) }));
  const absent = states.filter((x) => x.state === 'absent').map((x) => x.f);
  const presentRe = states.filter((x) => x.state === 'present' && x.f.strongRe).map((x) => x.f.strongRe);
  for (const line of active) {
    if (line.anchors.some((a) => FUTURE.has(a))) continue;
    const seen = new Set();
    for (const sn of sentencesOf(line)) {
      let s = sn.plain;
      for (const re of presentRe) s = mask(re, s); // « Marketing Cloud Account Engagement » when only Account Engagement is present
      s = mask(systemsRe, s);
      const negated = test(lex.negation, s);
      if (negated) continue;
      for (const f of absent) {
        if (seen.has(f.id)) continue;
        const strong = f.strongRe && f.strongRe.exec(s);
        const hit = strong || (f.weakRe && f.weakRe.exec(s));
        if (!hit) continue;
        if (doc === 'axes' && test(lex.proposal, s)) continue; // the Axes may propose what the org lacks
        const isWeak = !strong || (f.absentWhen || []).some((p) => weak.has(p.replace(/^modules\./, ''))) || weak.has(f.id);
        seen.add(f.id);
        const evidence = (f.absentWhen || []).filter((p) => KNOWN(get(facts, p))).map((p) => `${p} = ${JSON.stringify(get(facts, p))}`).slice(0, 2).join(', ');
        add(isWeak || doc === 'axes' ? 'warn' : 'error', 'absent-feature', `« ${hit[0].trim()} »: the org has no ${f.name} (${evidence}). Remove the claim, or say plainly that it is not used.`, at(line));
      }
    }
  }

  // ---- unproven-schedule
  const classes = new Set(((facts.apex && facts.apex.classes) || []).map((c) => c.name));
  const flows = new Map(((facts.automation && facts.automation.flows) || []).map((x) => [x.name, x]));
  const jobs = org && Array.isArray(org.scheduledJobs) ? org.scheduledJobs : null;
  const scheduledFlows = [...flows.values()].filter((x) => /schedul/i.test(String(x.triggerType || '')) && String(x.status || 'Active') !== 'Obsolete');
  const proven = (c) => {
    const fl = flows.get(c);
    if (fl && /schedul/i.test(String(fl.triggerType || ''))) return true;
    if (!jobs) return false;
    const n = norm(c), lbl = fl && norm(fl.label);
    return jobs.some((j) => {
      if ([j.apexClass, j.class, j.flow, j.component].some((x) => x && compId(x) === c)) return true;
      const jn = norm(j.name);
      if (jn.length < 4) return false;
      return jn.includes(n) || (n.length >= 4 && n.includes(jn)) || (!!lbl && lbl.length >= 4 && jn.includes(lbl));
    });
  };
  for (const line of active) {
    for (const sn of sentencesOf(line)) {
      const s = sn.plain;
      const freq = lex.frequency && lex.frequency.exec(s);
      const sched = !freq && lex.scheduled && lex.scheduled.exec(s);
      if (!freq && !sched) continue;
      if (test(lex.exempt, s)) continue;
      const comps = [...new Set(sn.codes.map(compId).filter((c) => classes.has(c) || flows.has(c)))];
      const claim = (freq || sched)[0].trim();
      if (comps.length) {
        if (comps.some(proven)) continue;
        if (jobs) add(freq ? 'error' : 'warn', 'unproven-schedule', `« ${claim} » next to ${comps.map((c) => '`' + c + '`').join(', ')}: no scheduled job of the org runs it (facts/org.json › scheduledJobs${jobs.length ? ': ' + jobs.slice(0, 4).map((j) => j.name).join(', ') + (jobs.length > 4 ? '…' : '') : ': none'}). Write what the code allows (« can be scheduled »), or name the job that runs it.`, at(line));
        else add('warn', 'unproven-schedule', `« ${claim} » next to ${comps.map((c) => '`' + c + '`').join(', ')}: the scheduled jobs of the org were not collected (tadforce facts --org), so the frequency cannot be proven. Collect them, or write « when scheduled ».`, at(line));
      } else if (freq && line.kind !== 'heading' && test(lex.jobs, s) && jobs && !jobs.length && !scheduledFlows.length) {
        add('error', 'unproven-schedule', `« ${claim} »: a recurring job is described, but the org has no scheduled job and no scheduled flow (facts/org.json › scheduledJobs). Remove the frequency, or name the component and how it is scheduled.`, at(line));
      }
    }
  }

  // ---- environment-mismatch
  const cfgEnv = cfg.document && cfg.document.environment;
  const actual = environmentKind(org, cfgEnv);
  if (org && org.organization && envOfText(cfgEnv) && actual && envOfText(cfgEnv) !== actual) {
    add('error', 'environment-mismatch', `The cover says « ${cfgEnv} » but the org is ${ENV_WORD[actual]} (facts/org.json › organization: ${org.organization.edition || ''}${org.organization.sandbox ? ', sandbox' : ''}): fix tadforce.config.json › document.environment.`, 'tadforce.config.json › document.environment');
  }
  if (actual) {
    for (const line of active) {
      const seen = new Set();
      for (const sn of sentencesOf(line)) {
        const s = mask(lex.goLive, sn.plain);
        if (test(lex.negation, s)) continue;
        const hits = [];
        if (actual === 'developer') hits.push(lex.production && lex.production.exec(s), lex.sandbox && lex.sandbox.exec(s));
        else hits.push(lex.developer && lex.developer.exec(s));
        if (actual === 'production') hits.push(lex.thisSandbox && lex.thisSandbox.exec(s));
        if (actual === 'sandbox') hits.push(lex.thisProduction && lex.thisProduction.exec(s));
        for (const h of hits.filter(Boolean)) {
          const k = h[0].toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          add(doc === 'axes' ? 'warn' : 'error', 'environment-mismatch', `« ${h[0].trim()} »: the documented org is ${ENV_WORD[actual]}${org && org.organization ? ` (facts/org.json › organization)` : ` (tadforce.config.json › document.environment: ${cfgEnv})`}. Describe the environment as it is.`, at(line));
        }
      }
    }
  }

  // ---- risk-wording (the TAD describes; debts and risks go to the Improvement Axes)
  if (doc === 'tad') {
    const allowTerms = [...(glossary.terms || []).flatMap((x) => [x.term, x.use]), ...(glossary.allow || [])].filter(Boolean).map((x) => escapeRe(String(x)));
    const allowRe = allowTerms.length ? compile(allowTerms) : null;
    for (const line of active) {
      for (const sn of sentencesOf(line)) {
        const s = mask(allowRe, mask(lex.riskAllow, sn.plain));
        const m = lex.risk && lex.risk.exec(s);
        if (m) { add('error', 'risk-wording', `« ${m[0].trim()} »: risk and debt wording belongs to the Improvement Axes, not to the TAD. Describe what is in place; move the assessment to the Axes.`, at(line)); break; }
      }
    }
  }

  // ---- untranslated (non-English documents)
  if (lang !== 'en') {
    const U = LEXICON.untranslated || {};
    const EN = new Set((U.english || []).map((w) => w.toLowerCase()));
    const SAME = new Set(((U.same || {})[lang] || []).map((w) => w.toLowerCase()));
    const NEUTRAL = new Set((U.neutral || []).map((w) => w.toLowerCase()));
    const english = (s) => {
      const words = (s.replace(/`[^`]*`/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').replace(/<[^>]+>/g, ' ').match(/\p{L}+/gu) || []).map((w) => w.toLowerCase());
      if (!words.length) return false;
      if (!words.every((w) => EN.has(w) || SAME.has(w) || NEUTRAL.has(w))) return false;
      return words.some((w) => EN.has(w) && !SAME.has(w) && !NEUTRAL.has(w));
    };
    for (const line of active) {
      if (line.kind === 'heading') {
        const h = line.text.replace(/^#{1,6}\s+/, '').replace(/\s*\{[^{}]*\}\s*$/, '').replace(/\{\{(letter|sub)\}\}/g, '');
        if (english(h)) add('warn', 'untranslated', `Heading « ${h.trim()} » is in English in a ${lang} document: translate it (keep the {#anchor}).`, at(line));
      } else if (line.kind === 'table' && /^\s*\|?[\s|:-]+\|?\s*$/.test(line.next) && /-{2,}/.test(line.next)) {
        const cells = line.text.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((c) => c.trim()).filter(Boolean);
        const bad = cells.filter(english);
        if (bad.length) add('warn', 'untranslated', `Table header ${bad.map((c) => '« ' + c + ' »').join(', ')} in English in a ${lang} document: translate it.`, at(line));
      }
    }
  }

  // ---- duplicate-figure (and figure ownership: understanding/figures.json › own)
  let own = null;
  if (figures !== undefined) own = figures && figures.own;
  else if (ctx && typeof ctx.p === 'function') {
    const p = ctx.p('understanding', 'figures.json');
    if (exists(p)) { try { own = JSON.parse(readText(p)).own || null; } catch { own = null; } }
  }
  const specs = (readYaml(path.join(TEMPLATES, 'specs', 'sections.yml'), {}).sections) || {};
  const docAnchors = new Set();
  for (const l of lines) if (l.active && l.kind === 'heading') { const a = /\{[^}]*#([\w-]+)[^}]*\}\s*$/.exec(l.text); if (a) docAnchors.add(a[1]); }
  const resolveOwner = (sec) => {
    const out = new Set();
    for (const s of [].concat(sec || [])) {
      const id = String(s && typeof s === 'object' ? s.section || s.id : s);
      if (docAnchors.has(id)) out.add(id);
      else if (skel.anchors[id] && docAnchors.has(skel.anchors[id])) out.add(skel.anchors[id]);
      else if (specs[id] && specs[id].anchor && docAnchors.has(specs[id].anchor)) out.add(specs[id].anchor);
    }
    return out;
  };
  const ownerOf = (kind, id) => {
    if (!own) return null;
    const keys = [`${kind}:${id}`, `${kind.toLowerCase()}:${id}`, `@@${kind}:${id}@@`, id];
    for (const k of keys) if (own[k] !== undefined) return { key: k, anchors: resolveOwner(own[k]), raw: own[k] };
    return null;
  };
  const occurrences = new Map();
  for (const line of lines) {
    if (!line.active || line.kind !== 'directive') continue;
    const m = /^\s*@@(SEQ|STATE|ERD-DOMAIN):([^@|]+?)\s*(?:\|[^@]*)?@@\s*$/.exec(line.text);
    if (!m) continue;
    const key = `${m[1]}:${m[2].trim()}`;
    if (!occurrences.has(key)) occurrences.set(key, []);
    occurrences.get(key).push({ line, anchors: line.anchors });
  }
  for (const [key, occ] of occurrences) {
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const owner = ownerOf(kind, id);
    const inside = (o) => o.anchors.some((a) => owner.anchors.has(a));
    if (owner && owner.anchors.size) {
      let kept = false;
      for (const o of occ) {
        if (!inside(o)) add('error', 'duplicate-figure', `@@${key}@@ is drawn outside its section (understanding/figures.json › own: « ${[].concat(owner.raw).join(', ')} »): refer to it ({{ref:${[...owner.anchors][0]}}}) instead of drawing it here.`, at(o.line));
        else if (kept) add('error', 'duplicate-figure', `@@${key}@@ is drawn twice in its section: keep one.`, at(o.line));
        else kept = true;
      }
    } else {
      occ.slice(1).forEach((o) => add('error', 'duplicate-figure', `@@${key}@@ is already drawn at ${at(occ[0].line)}: the same figure twice says nothing new — refer to it ({{ref:…}}) or draw another view.`, at(o.line)));
    }
  }
  void model;
  return issues;
}

const TEMPLATE_LINES = new Map();
/** Lines of the chapter skeletons (headings, ready-made paragraphs): TADForce's own text, never a writer's claim. */
function templateLines(doc, lang) {
  const key = doc + '/' + lang;
  if (TEMPLATE_LINES.has(key)) return TEMPLATE_LINES.get(key);
  const out = new Set();
  const dir = pathx.join(TEMPLATES, doc, lang);
  if (fsx.existsSync(dir)) {
    for (const f of fsx.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      for (const l of fsx.readFileSync(pathx.join(dir, f), 'utf8').split(/\r?\n/)) if (l.trim().length > 3) out.add(l.trim());
    }
  }
  TEMPLATE_LINES.set(key, out);
  return out;
}
