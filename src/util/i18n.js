import path from 'node:path';
import { readJson, exists } from './fsx.js';
import { TEMPLATES } from './paths.js';

/** Languages shipped with skeletons and interface labels. Any other language works from the English ones. */
export const LANGUAGES = ['en', 'fr'];

/** A language code as written in the config: en, fr, es, de, pt-BR… (anything else falls back to en). */
export function normalizeLang(lang) {
  const m = /^([a-z]{2,3})(?:[-_]([a-z]{2}))?$/i.exec(String(lang || '').trim());
  return m ? m[1].toLowerCase() + (m[2] ? '-' + m[2].toUpperCase() : '') : 'en';
}

/** Skeletons and specs come in the built-in languages; other languages start from English. */
export const templateLang = (lang) => (LANGUAGES.includes(normalizeLang(lang)) ? normalizeLang(lang) : 'en');

/**
 * Interface and document labels: English, then the built-in translation, then the workspace's own
 * file (tadforce/i18n/<lang>.json) — the translation the agent writes for any other language.
 */
export function loadI18n(lang, ws = null) {
  const l = normalizeLang(lang);
  let dict = readJson(path.join(TEMPLATES, 'i18n', 'en.json'));
  const builtIn = path.join(TEMPLATES, 'i18n', `${l}.json`);
  if (l !== 'en' && exists(builtIn)) dict = merge(dict, readJson(builtIn));
  const own = ws && path.join(ws, 'i18n', `${l}.json`);
  if (own && exists(own)) dict = merge(dict, readJson(own));
  return { lang: l, dict };
}

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v;
  return out;
}

/** t(dict, 'annex.name', {n: 3}) → string with {n} replaced; falls back to the key. */
export function t(dict, key, vars = {}) {
  const val = key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
  const s = typeof val === 'string' ? val : key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

const locale = (lang) => (lang === 'fr' ? 'fr-FR' : lang === 'en' || !lang ? 'en-GB' : lang);

/** 2026-10-30 → 30 October 2026 / 30 octobre 2026 / 30 de octubre de 2026. Anything else is kept as written. */
export function formatDate(value, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return value;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  try { return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d); } catch { return value; }
}

export function formatNumber(n, lang) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  // fr-FR uses a narrow no-break space as thousands separator, as in the reference document.
  const locale = lang === 'fr' ? 'fr-FR' : lang === 'en' || !lang ? 'en-US' : lang;
  try { return new Intl.NumberFormat(locale).format(n); } catch { return new Intl.NumberFormat('en-US').format(n); }
}
