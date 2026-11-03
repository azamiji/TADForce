// `when:` conditions of sections.yml: a tiny, safe expression language over facts (no eval).
//
//   expr   := or
//   or     := and ( '||' and )*
//   and    := not ( '&&' not )*
//   not    := '!' not | cmp
//   cmp    := atom ( ( '>' | '>=' | '<' | '<=' | '==' | '!=' ) atom )?
//   atom   := '(' expr ')' | number | true | false | null | 'string' | "string" | path
//   path   := name ( '.' name )*          resolved in facts, then in facts.counts ({{n:…}} paths)
//
// Arrays count as their length in comparisons; alone, a value is true when it is a non-zero number, a
// non-empty array, object or string, or true. Unknown paths are false (and 0 in comparisons).

const TOKEN = /\s*(?:(\|\||&&|>=|<=|==|!=|[()!<>])|(-?\d+(?:\.\d+)?)|'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$-]*(?:\.[\w$-]+)*))/y;

function tokenize(expr) {
  const out = [];
  TOKEN.lastIndex = 0;
  let i = 0;
  const s = String(expr);
  while (i < s.length) {
    if (/^\s*$/.test(s.slice(i))) break;
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(s);
    if (!m) throw new Error(`when: unexpected "${s.slice(i).trim().slice(0, 20)}" in « ${s} »`);
    i = TOKEN.lastIndex;
    if (m[1]) out.push({ op: m[1] });
    else if (m[2] !== undefined) out.push({ value: Number(m[2]) });
    else if (m[3] !== undefined || m[4] !== undefined) out.push({ value: m[3] ?? m[4] });
    else if (m[5] === 'true' || m[5] === 'false') out.push({ value: m[5] === 'true' });
    else if (m[5] === 'null') out.push({ value: null });
    else out.push({ path: m[5] });
  }
  return out;
}

/** Parse an expression into a small tree; throws on a syntax error. */
export function parseWhen(expr) {
  const t = tokenize(expr);
  let k = 0;
  const peek = (op) => t[k] && t[k].op === op;
  const take = (op) => { if (!peek(op)) throw new Error(`when: expected "${op}" in « ${expr} »`); k++; };
  const or = () => { let n = and(); while (peek('||')) { k++; n = { or: [n, and()] }; } return n; };
  const and = () => { let n = not(); while (peek('&&')) { k++; n = { and: [n, not()] }; } return n; };
  const not = () => { if (peek('!')) { k++; return { not: not() }; } return cmp(); };
  const cmp = () => {
    const left = atom();
    const op = t[k] && ['>', '>=', '<', '<=', '==', '!='].includes(t[k].op) ? t[k++].op : null;
    return op ? { cmp: op, left, right: atom() } : left;
  };
  const atom = () => {
    const x = t[k];
    if (!x) throw new Error(`when: unexpected end of « ${expr} »`);
    if (x.op === '(') { k++; const n = or(); take(')'); return n; }
    if (x.op) throw new Error(`when: unexpected "${x.op}" in « ${expr} »`);
    k++;
    return 'path' in x ? { path: x.path } : { value: x.value };
  };
  const tree = or();
  if (k < t.length) throw new Error(`when: unexpected "${t[k].op || t[k].path || t[k].value}" in « ${expr} »`);
  return tree;
}

const get = (obj, p) => p.split('.').reduce((o, key) => (o == null ? undefined : o[key]), obj);

/** A facts path, then the same path under counts (as {{n:…}} does). */
export function resolvePath(facts, p) {
  const v = get(facts, p);
  return v !== undefined ? v : get((facts && facts.counts) || {}, p);
}

export const truthy = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v);
const num = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : typeof v === 'boolean' ? Number(v) : v == null ? 0 : Number(v));

function evalNode(n, facts) {
  if ('or' in n) return evalNode(n.or[0], facts) || evalNode(n.or[1], facts);
  if ('and' in n) return evalNode(n.and[0], facts) && evalNode(n.and[1], facts);
  if ('not' in n) return !evalNode(n.not, facts);
  if ('cmp' in n) {
    const a = value(n.left, facts), b = value(n.right, facts);
    if ((n.cmp === '==' || n.cmp === '!=') && (typeof a === 'string' || typeof b === 'string')) return (String(a ?? '') === String(b ?? '')) === (n.cmp === '==');
    if ((n.cmp === '==' || n.cmp === '!=') && (typeof a === 'boolean' || typeof b === 'boolean')) return (truthy(a) === truthy(b)) === (n.cmp === '==');
    const x = num(a), y = num(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    return { '>': x > y, '>=': x >= y, '<': x < y, '<=': x <= y, '==': x === y, '!=': x !== y }[n.cmp];
  }
  return truthy(value(n, facts));
}

const value = (n, facts) => ('path' in n ? resolvePath(facts, n.path) : 'value' in n ? n.value : evalNode(n, facts));

const cache = new Map();
/** true when the condition holds for these facts; an empty condition always holds. Throws on a syntax error. */
export function evaluateWhen(expr, facts) {
  if (expr === undefined || expr === null || expr === true || String(expr).trim() === '') return true;
  if (expr === false) return false;
  const key = String(expr);
  if (!cache.has(key)) cache.set(key, parseWhen(key));
  return !!evalNode(cache.get(key), facts || {});
}
