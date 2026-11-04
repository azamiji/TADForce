// French typography of the rendered HTML (French documents only):
//   no-break space (U+00A0) before « : » and « » », after « « »; narrow no-break space (U+202F) before
//   « ; », « ! », « ? »; narrow no-break space as the thousands separator (12 345) and no-break space
//   before %, € and $ after a number.
// Never inside tags or attributes, <code>, <pre>, <kbd>, <samp>, <script>, <style>, <textarea> or <svg>
// (figures, Mermaid sources), and never in HTML entities, URLs, e-mail addresses, times (12:30) or
// leftover directives and placeholders (@@…@@, {{…}}).
const NBSP = ' ';
const NNBSP = ' ';
const SPACE = '[ \\u00A0\\u202F]';
const SKIP = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style', 'textarea', 'svg', 'math']);
const PROTECT = /(&#?\w+;|\b(?:https?|ftp|mailto|file):[^\s<]+|\bwww\.[^\s<]+|[\w.+-]+@[\w-]+\.[\w.-]+|\b\d{1,2}:\d{2}(?::\d{2})?\b|@@[^@\n]*@@|\{\{[^}\n]*\}\})/;

/** French typography of one run of plain text (no tags, no protected tokens). */
export function frenchText(s) {
  return s
    // a run that starts right after a tag (`<code>x</code> : …`)
    .replace(/^ (?=[;!?])/, NNBSP).replace(/^ (?=:(?:\s|$))/, NBSP)
    // high punctuation: one narrow no-break space before ; ! ? (and no-break before :), added when missing
    .replace(new RegExp(`([^\\s\\u00A0\\u202F(\\[«;!?:])${SPACE}?([;!?]+)(?=[\\s)\\]»"'’.,]|$)`, 'gu'), (m, a, p) => a + NNBSP + p)
    .replace(new RegExp(`([^\\s\\u00A0\\u202F(\\[«:/])${SPACE}?:(?=\\s|$)`, 'gu'), (m, a) => a + NBSP + ':')
    // French quotes hold their text with no-break spaces
    .replace(new RegExp(`«${SPACE}*`, 'gu'), '«' + NBSP)
    .replace(new RegExp(`${SPACE}*»`, 'gu'), NBSP + '»')
    // numbers: 12 345 → narrow no-break space; 50 % / 10 € → no-break space
    .replace(/(?<![\d., ])\d{1,3}(?:[   ]\d{3})+(?!\d)/g, (m) => m.replace(/[  ]/g, NNBSP))
    .replace(/(\d)[  ](%|€|\$|k€|M€)/g, `$1${NBSP}$2`);
}

/** Apply French typography to the text of an HTML fragment. */
export function frenchTypography(html) {
  const parts = String(html).split(/(<!--[\s\S]*?-->|<[^>]+>)/);
  let depth = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i % 2 === 1) {
      const m = /^<\s*(\/)?\s*([a-zA-Z][\w-]*)/.exec(p);
      if (m && SKIP.has(m[2].toLowerCase())) {
        if (m[1]) depth = Math.max(0, depth - 1);
        else if (!/\/\s*>$/.test(p)) depth++;
      }
      continue;
    }
    if (depth || !p) continue;
    parts[i] = p.split(PROTECT).map((x, k) => (k % 2 ? x : frenchText(x))).join('');
  }
  return parts.join('');
}
