import { files, baseName, safeRead, readXml, str } from '../xml.js';

/** Split Apex source into code without comments/strings, and the list of string literals. */
export function scanApex(src) {
  let code = '', i = 0;
  const strings = [];
  while (i < src.length) {
    const ch = src[i], nx = src[i + 1];
    if (ch === '/' && nx === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; code += ' '; continue; }
    if (ch === '/' && nx === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (ch === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== "'") { if (src[j] === '\\') { s += src[j + 1] ?? ''; j += 2; } else s += src[j++]; }
      strings.push(s); code += "''"; i = j + 1; continue;
    }
    code += ch; i++;
  }
  return { code, strings };
}

const KIND_RULES = [
  ['batch', /implements[^{]*\bDatabase\.Batchable\b/i],
  ['queueable', /implements[^{]*\bQueueable\b/i],
  ['schedulable', /implements[^{]*\bSchedulable\b/i],
  ['future', /@future\b/i],
  ['auraEnabled', /@AuraEnabled\b/i],
  ['invocable', /@InvocableMethod\b/i],
  ['soap', /\bwebservice\s+static\b/i],
  ['callout', /\bnew\s+Http\s*\(|\bHttpRequest\b/i],
  ['registrationHandler', /implements[^{]*\bAuth\.RegistrationHandler\b/i],
  ['emailHandler', /implements[^{]*\bMessaging\.InboundEmailHandler\b/i],
  ['stateful', /\bDatabase\.Stateful\b/i],
];

export function extractApex(roots) {
  const classes = [];
  for (const f of files(roots, 'classes', '.cls')) {
    const name = baseName(f, '.cls');
    const raw = safeRead(f);
    const { code, strings } = scanApex(raw);
    const meta = readXml(f + '-meta.xml');
    const declIdx = code.search(/\b(class|interface|enum)\s+\w+/i);
    const decl = declIdx >= 0 ? code.slice(0, declIdx + 60) : code.slice(0, 400);
    const declKind = (/\b(class|interface|enum)\s+\w+/i.exec(decl) || [])[1]?.toLowerCase() || 'class';
    const isTest = /@istest\b/i.test(code.slice(0, Math.max(0, declIdx))) || (/@istest\b/i.test(code) && /Test$/i.test(name) && declKind === 'class');
    const sharing = (/\b(with|without|inherited)\s+sharing\b/i.exec(decl) || [])[1]?.toLowerCase() || (declKind === 'class' ? 'none' : 'n/a');
    const rest = restMapping(code, strings);
    const kinds = KIND_RULES.filter(([, re]) => re.test(code)).map(([k]) => k);
    if (rest) kinds.push('rest');
    if (/\babstract\s+class\b/i.test(decl)) kinds.push('abstract');
    if (declKind !== 'class') kinds.push(declKind);
    if (/^global\b/i.test(decl.trim()) || /\bglobal\s+(with|without|inherited|abstract|virtual|class)/i.test(decl)) kinds.push('global');
    const namedCredentials = [...new Set(strings.map((s) => /^callout:([A-Za-z0-9_]+)/.exec(s)?.[1]).filter(Boolean))].sort();
    const hardcodedIds = strings.filter((s) => /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(s) && /^0[0-9A-Za-z]{2}/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s.slice(3))).length;
    classes.push({
      name,
      apiVersion: str(meta.apiVersion),
      test: !!isTest,
      sharing: isTest ? 'n/a' : sharing,
      kinds: [...new Set(kinds)].sort(),
      restUrl: rest,
      namedCredentials,
      userMode: (code.match(/\bWITH\s+USER_MODE\b|AccessLevel\.USER_MODE/gi) || []).length,
      securityEnforced: (code.match(/\bWITH\s+SECURITY_ENFORCED\b/gi) || []).length,
      stripInaccessible: (code.match(/Security\.stripInaccessible/gi) || []).length,
      hardcodedIds,
      soqlInLoops: countSoqlInLoops(code),
      lines: raw.split('\n').filter((l) => l.trim()).length,
      _tokens: tokens(code),
    });
  }

  const triggers = [];
  for (const f of files(roots, 'triggers', '.trigger')) {
    const name = baseName(f, '.trigger');
    const { code } = scanApex(safeRead(f));
    const m = /\btrigger\s+(\w+)\s+on\s+(\w+)\s*\(([^)]*)\)/i.exec(code);
    const meta = readXml(f + '-meta.xml');
    triggers.push({
      name,
      object: m ? m[2] : null,
      events: m ? m[3].split(',').map((e) => e.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean) : [],
      apiVersion: str(meta.apiVersion),
      active: str(meta.status) ? str(meta.status) === 'Active' : true,
      lines: code.split('\n').filter((l) => l.trim()).length,
      _tokens: tokens(code),
    });
  }
  return { classes, triggers };
}

/**
 * urlMapping of @RestResource, read from the scanned code: comments are already gone and string literals
 * are taken whole, so a mapping such as '/api/*' is never mistaken for the start of a comment.
 */
export function restMapping(code, strings) {
  const m = /@RestResource\s*\(\s*urlMapping\s*=\s*''/i.exec(code);
  if (!m) return null;
  const idx = (code.slice(0, m.index + m[0].length - 2).match(/''/g) || []).length;
  const url = String(strings[idx] ?? '').trim();
  return /^\/\S{0,254}$/.test(url) ? url : null;
}

export function tokens(code) {
  return new Set(code.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []);
}

/** Rough count of SOQL/DML statements placed inside for/while loops (review signal, not proof). */
function countSoqlInLoops(code) {
  let n = 0;
  const re = /\b(for|while)\s*\([^)]*\)\s*\{/gi;
  let m;
  while ((m = re.exec(code))) {
    let depth = 1, j = m.index + m[0].length;
    const start = j;
    while (j < code.length && depth) { if (code[j] === '{') depth++; else if (code[j] === '}') depth--; j++; }
    const body = code.slice(start, j);
    // a `for (x : [SELECT ...])` loop header is fine; only statements inside the body count
    n += (body.match(/\[\s*SELECT\b|\bDatabase\.query\s*\(|\b(insert|update|upsert|delete)\s+\w/gi) || []).length;
  }
  return n;
}
