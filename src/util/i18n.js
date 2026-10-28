import path from 'node:path';
import { readJson, exists } from './fsx.js';
import { TEMPLATES } from './paths.js';

export const LANGUAGES = ['en', 'fr'];

export function loadI18n(lang) {
  const l = LANGUAGES.includes(lang) ? lang : 'en';
  const base = readJson(path.join(TEMPLATES, 'i18n', 'en.json'));
  if (l === 'en') return { lang: 'en', dict: base };
  const p = path.join(TEMPLATES, 'i18n', `${l}.json`);
  const loc = exists(p) ? readJson(p) : {};
  return { lang: l, dict: merge(base, loc) };
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

export function formatNumber(n, lang) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  // fr-FR uses a narrow no-break space as thousands separator, as in the reference document.
  return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(n);
}
