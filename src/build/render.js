import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { exists, readText, writeText, readJson } from '../util/fsx.js';
import { TEMPLATES, PKG_ROOT } from '../util/paths.js';
import { loadI18n, t, formatDate } from '../util/i18n.js';
import { loadFacts } from '../facts/index.js';
import { sourceFlags } from '../util/config.js';
import { CLASSDEFS, renderMermaid, escapeHtml } from './mermaid.js';
import { resolveConditionals, resolveIncludes, resolveDirectives, resolveValues, present } from './directives.js';
import { qualityGate } from '../validate/index.js';
import { frenchTypography } from './typography.js';

// C0 control characters other than tab and line feed: never meant (they stood for lost punctuation)
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export const DOCS = ['tad', 'axes'];
const VERSION = readJson(path.join(PKG_ROOT, 'package.json')).version;

export function slug(text, used) {
  let s = String(text).replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').toLowerCase();
  s = s.replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '') || 's';
  let base = s, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s);
  return s;
}

/** Extract Mermaid figures and number headings. `# Title {-}` is unnumbered, `{#id}` sets the anchor. */
export function preprocess(md) {
  const figures = [];
  md = md.replace(/```mermaid\r?\n([\s\S]*?)```[ \t]*\r?\n(?:Figure:[ \t]*([^\n]*)\n)?/g, (m, code, caption) => {
    code = code.replace(/\s+$/, '');
    // the directive that generated it (« %% tad-src=SEQ:x », see directives.js): the visual QA can ask for its simplified variant
    let src = null;
    code = code.replace(/\n?%% tad-src=(\S+)[ \t]*$/, (x, s) => { src = s; return ''; });
    const first = code.trimStart().split('\n', 1)[0];
    // the colour legend classes, in every diagram that supports classDef (unless the author redefined them)
    if (/^(flowchart|graph|stateDiagram)/.test(first)) code += '\n' + CLASSDEFS.split('\n').filter((l) => l.trim() && !new RegExp('classDef\\s+' + l.split(/\s+/)[1] + '\\b').test(code)).join('\n');
    figures.push({ code, caption: (caption || '').trim(), src });
    return `\n\n@@FIG${figures.length - 1}@@\n\n`;
  });
  const out = [], counters = [0, 0, 0], headings = [], used = new Set();
  let inCode = false, letter = 0, sub = 0;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode;
    const m = inCode ? null : /^(#{1,3}) (.*)$/.exec(line);
    if (!m) { out.push(line); continue; }
    const lvl = m[1].length;
    let text = m[2].trim();
    // Appendices are lettered in order, so that optional ones never leave gaps: {{letter}} and {{sub}}
    if (text.includes('{{letter}}')) { letter++; sub = 0; text = text.replace('{{letter}}', String.fromCharCode(64 + letter)); }
    if (text.includes('{{sub}}')) { sub++; text = text.replace('{{sub}}', `${String.fromCharCode(64 + Math.max(letter, 1))}.${sub}`); }
    const attr = /\s*\{([^{}]*)\}\s*$/.exec(text);
    let nonum = false, id = null;
    if (attr && /^(\s*(-|#[\w-]+)\s*)+$/.test(attr[1])) {
      nonum = /(^|\s)-(\s|$)/.test(attr[1]);
      id = (/#([\w-]+)/.exec(attr[1]) || [])[1] || null;
      text = text.slice(0, attr.index).trim();
    }
    let num = null;
    if (!nonum) {
      counters[lvl - 1]++;
      for (let k = lvl; k < 3; k++) counters[k] = 0;
      num = counters.slice(0, lvl).join('.');
    }
    if (id) used.add(id); else id = slug((num ? num + ' ' : '') + text, used);
    headings.push({ lvl, id, num, text });
    out.push(`${m[1]} ${num ? `<span class="num">${num}</span> ` : ''}${text}`);
  }
  return { md: out.join('\n'), figures, headings };
}

export function resolveRefs(md, headings, problems) {
  const byId = new Map(headings.map((h) => [h.id, h]));
  return md.replace(/\{\{(ref|title):([\w-]+)\}\}/g, (m, kind, id) => {
    const h = byId.get(id);
    if (!h) { problems.push({ level: 'error', code: 'unknown-ref', message: `Reference to unknown section ${m}` }); return `⟨${id}⟩`; }
    const plain = h.text.replace(/`/g, '');
    if (kind === 'ref') return `[${h.num ? '§ ' + h.num : plain}](#${id})`;
    return `[${h.num ? h.num + ' ' : ''}${plain}](#${id})`;
  });
}

function mime(p) {
  const ext = path.extname(p).toLowerCase();
  return { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'application/octet-stream';
}
const dataUri = (p) => `data:${mime(p)};base64,${fs.readFileSync(p).toString('base64')}`;

/** Text badge used when no logo file is configured. */
export function badgeLogo(name, color) {
  const initials = String(name || '?').split(/[\s&.-]+/).filter(Boolean).slice(0, 3).map((w) => w[0].toUpperCase()).join('') || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="32" fill="${color}"/><text x="80" y="96" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="${initials.length > 2 ? 48 : 60}" font-weight="700" fill="#fff">${escapeHtml(initials)}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/**
 * Base name of a built document. The HTML keeps the same name from one version to the next
 * (the review comments live in it); `{ versioned: true }` adds the version, for PDF and DOCX archives.
 */
export function outputName(cfg, doc, { versioned = false } = {}) {
  const short = String(cfg.client.short || cfg.client.name || 'CLIENT').replace(/[^\w-]+/g, '_');
  const custom = cfg.outputs && cfg.outputs.names && cfg.outputs.names[doc];
  const base = custom || `${doc === 'tad' ? 'TAD' : 'Axes'}_${short}`;
  return versioned && !custom ? `${base}_v${cfg.document.version}` : base;
}

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

/** The understanding model (tadforce/understanding/model.json), or null when the step has not run. */
export function loadModel(wsCtx) {
  const p = wsCtx.p('understanding', 'model.json');
  if (!exists(p)) return null;
  try { return JSON.parse(readText(p)); } catch (e) { return { _error: e.message }; }
}

// last build report of each HTML file: qualityGate() reads it when the caller does not pass it
const REPORTS = new Map();
export const reportFor = (htmlPath) => REPORTS.get(path.resolve(htmlPath)) || null;

/**
 * Mark a built document as a draft: watermark on every page (HTML, PDF; the Word export repeats it
 * on every chapter), status forced to the draft status. Idempotent. Returns the new HTML.
 */
export function markDraftHtml(html, dict, { errors = 0 } = {}) {
  const label = escapeHtml(t(dict, 'doc.draft'));
  const status = escapeHtml(t(dict, 'doc.draftStatus'));
  let out = html.replace(/<span class="doc-status">[\s\S]*?<\/span>/g, `<span class="doc-status"> — ${status}</span>`);
  if (!/<body[^>]*class="[^"]*\bdraft\b/.test(out)) {
    out = out.replace(/<body([^>]*)>/, (m, a) => (/class="/.test(a) ? `<body${a.replace(/class="/, 'class="draft ')}>` : `<body class="draft"${a}>`) + `\n<div class="watermark" aria-hidden="true" data-label="${label}">${label}</div>`);
  }
  const note = `<p class="draft-note">${escapeHtml(t(dict, 'doc.draftNote', { n: errors }))}</p>`;
  out = /<p class="draft-note">[^<]*<\/p>/.test(out) ? out.replace(/<p class="draft-note">[^<]*<\/p>/, note) : out.replace('<p class="conf">', note + '<p class="conf">');
  return out;
}

/** markDraftHtml() on a file. */
export function markDraft(htmlPath, dict, opts) {
  writeText(htmlPath, markDraftHtml(readText(htmlPath), dict, opts));
}

/**
 * Build one document (tad | axes) of a workspace. Returns a report (paths, figures, problems).
 * opts.render = false skips Mermaid rendering (tests, dry runs).
 */
export async function buildDocument(wsCtx, doc, opts = {}) {
  const { cfg } = wsCtx;
  const problems = [];
  const report = {};
  const facts = loadFacts(wsCtx.ws);
  if (!facts) throw new Error('facts/facts.json not found: run `tadforce facts` first.');
  const { lang, dict } = loadI18n(cfg.language, wsCtx.ws);
  const glossary = wsCtx.glossary() || {};
  const srcDir = wsCtx.p('src', doc);
  if (!exists(srcDir)) throw new Error(`No sources in ${srcDir}: run \`tadforce scaffold --doc ${doc}\`.`);
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort();
  if (!files.length) throw new Error(`No Markdown chapters in ${srcDir}.`);

  let text = files.map((f) => readText(path.join(srcDir, f))).join('\n\n');
  // stray control characters are stripped (the claims check reports each line: control-chars)
  const controls = (text.match(CONTROL) || []).length;
  if (controls) text = text.replace(CONTROL, '');
  report.sanitized = { controlChars: controls };
  const scope = { modules: facts.modules, counts: facts.counts, org: facts.org, cfg, facts, glossary, source: sourceFlags(cfg) };
  const docName = doc === 'tad' ? t(dict, 'meta.docName') : t(dict, 'meta.axesName');
  const model = loadModel(wsCtx);
  if (model && model._error) problems.push({ level: 'error', code: 'model-invalid', message: `understanding/model.json is not valid JSON: ${model._error}` });
  // opts.simplify: directives (« SEQ:x », « ERD-DOMAIN:y ») whose figure failed the visual QA: drawn in their simplified variant
  const simplify = opts.simplify ? new Set(opts.simplify) : null;
  const ctx = { facts, cfg, dict, lang, glossary, doc, docName, simplify, model: model && !model._error ? model : null, chapterTitle: (k) => `{{title:ch-${k}}}` };
  text = resolveConditionals(text, scope);
  text = resolveIncludes(text, wsCtx.ws);
  text = resolveDirectives(text, ctx, problems);
  text = resolveConditionals(text, scope);
  text = resolveValues(text, ctx, problems);

  const pending = [...text.matchAll(/<!--\s*tad:pending\s+([\w.-]+)\s*-->/g)].map((m) => m[1]);
  const pre = preprocess(text);
  let body = resolveRefs(pre.md, pre.headings, problems);
  body = body.replace(/<!--\s*tad:pending\s+([\w.-]+)\s*-->/g, (m, id) => `<div class="pending" data-section="${id}">✍ ${escapeHtml(t(dict, 'ui.pending'))} — <code>${id}</code></div>`);
  body = body.replace(/<!--[\s\S]*?-->/g, '');

  const figures = pre.figures;
  if (opts.render !== false) await renderMermaid(figures, wsCtx.p('.cache', 'mermaid'));
  else for (const f of figures) f.svg = `<pre class="mmd-src">${escapeHtml(f.code)}</pre>`;
  for (const f of figures) if (f.error) problems.push({ level: 'error', code: 'mermaid', message: `Figure "${f.caption || f.code.slice(0, 40)}" failed: ${f.error}` });

  let html = md.render(body);

  // Callouts: blockquotes starting with [!INTEGRATOR] / [!NOTE] / [!RECO] / [!WARN]
  html = html.replace(/<blockquote>\s*([\s\S]*?)<\/blockquote>/g, (m, inner) => {
    const k = /\[!(\w+)\]\s*/.exec(inner);
    if (!k) return m;
    const kind = k[1].toLowerCase();
    const title = { integrator: cfg.integrator.name ? t(dict, 'doc.callout.integrator', { integrator: cfg.integrator.name }) : t(dict, 'doc.callout.team'), note: t(dict, 'doc.callout.note'), reco: t(dict, 'doc.callout.reco'), warn: t(dict, 'doc.callout.warn') }[kind] || kind;
    return `<aside class="callout ${kind}"><div class="ct">${escapeHtml(title)}</div>${inner.replace(k[0], '')}</aside>`;
  });

  // Figures (Mermaid and hand-made SVG / HTML blocks), numbered in reading order
  let nfig = 0;
  const figlist = [];
  const label = t(dict, 'doc.figure');
  html = html.replace(/<figure class="diagram hand"([^>]*)>([\s\S]*?)<figcaption class="figcap">Figure — ([\s\S]*?)<\/figcaption><\/figure>|<p>@@FIG(\d+)@@<\/p>|<p class="figcap">Figure — ([\s\S]*?)<\/p>/g, (m, attrs, inner, hcap, idx, cap) => {
    nfig++;
    if (hcap !== undefined) {
      figlist.push([nfig, hcap.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')]);
      return `<figure class="diagram hand" id="fig-${nfig}"${attrs}>${inner}<figcaption>${label} ${nfig} — ${hcap}</figcaption></figure>`;
    }
    if (idx !== undefined) {
      const f = figures[Number(idx)];
      figlist.push([nfig, f.caption]);
      const c = f.caption ? `${label} ${nfig} — ${escapeHtml(f.caption)}` : `${label} ${nfig}`;
      return `<figure class="diagram mmd" id="fig-${nfig}" data-kind="${escapeHtml((f.code.trim().split(/\s/, 1)[0] || '').toLowerCase())}"${f.src ? ` data-src="${escapeHtml(f.src)}"` : ''}><div class="fig-body">${f.svg}</div><figcaption>${c}</figcaption></figure>`;
    }
    figlist.push([nfig, cap.replace(/<[^>]+>/g, '')]);
    return `<p class="figcap" id="fig-${nfig}">${label} ${nfig} — ${cap}</p>`;
  });

  // Heading ids (same order as preprocess) and anchors
  let hi = 0;
  html = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (m, lvl, inner) => {
    const h = pre.headings[hi++];
    if (!h) return m;
    return `<h${lvl} id="${h.id}">${inner}<a class="anchor" href="#${h.id}">#</a></h${lvl}>`;
  });
  html = html.replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, '</table></div>');
  // French typography: no-break spaces before : ; ! ? », after «, in numbers (never in code, URLs, figures)
  const french = /^fr\b/.test(lang);
  if (french) html = frenchTypography(html);
  const typo = (s) => (french ? frenchTypography(s) : s);

  // Table of contents (levels 1-2) and list of figures
  const toc = [];
  let open = false;
  for (const h of pre.headings.filter((x) => x.lvl <= 2)) {
    const inner = `${h.num ? `<span class="num">${h.num}</span> ` : ''}${typo(md.renderInline(h.text))}`;
    if (h.lvl === 1) { if (open) toc.push('</ul></li>'); toc.push(`<li class="l1"><a href="#${h.id}">${inner}</a><ul>`); open = true; }
    else toc.push(`<li class="l2"><a href="#${h.id}">${inner}</a></li>`);
  }
  if (open) toc.push('</ul></li>');
  const figs = figlist.map(([n, c]) => `<li><a href="#fig-${n}">${label} ${n} — ${typo(escapeHtml(c))}</a></li>`).join('');
  report.figlist = figlist;

  // Page assembly
  const brand = cfg.brand;
  const cssStr = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const css = readText(path.join(TEMPLATES, 'html', 'style.css'))
    .replace('{{PRINT_FOOTER}}', cssStr(doc === 'axes' && cfg.integrator.name ? `${docName} — ${cfg.document.title} · ${cfg.integrator.name} · ${t(dict, 'doc.axesKicker')}` : `${docName} — ${cfg.document.title} · ${cfg.client.name} · ${cfg.document.classification}`))
    .replace('{{PRINT_PAGE}}', cssStr(t(dict, 'doc.page')));
  const brandCss = `:root{--brand:${brand.primary};--accent:${brand.accent};--accent2:${brand.accent2};--grad:linear-gradient(90deg,${brand.gradient[0]},${brand.gradient[1]});--th:${brand.tableHeader};--kpiMore:"${cssStr(t(dict, 'ui.kpiMore'))}"}@media print{:root{--brand:${brand.primary};--th:${brand.tableHeader}}}`;
  const logoFile = (who) => {
    const p = cfg[who] && present(cfg[who].logo) && wsCtx.p(cfg[who].logo);
    if (p && !exists(p)) problems.push({ level: 'warn', code: 'logo-missing', message: `${who}.logo: no such file ${cfg[who].logo} (tadforce.config.json).` });
    return p && exists(p) ? p : null;
  };
  const logo = (who) => {
    const p = logoFile(who);
    return p ? dataUri(p) : badgeLogo(cfg[who].short || cfg[who].name, who === 'client' ? brand.primary : brand.accent2);
  };
  // Integrator and author are optional: without them the document only names the client (never « — »).
  const integrator = present(cfg.integrator.name) || null;
  const author = present(cfg.document.author) || null;
  const preparedBy = [author, integrator].filter(Boolean).join(' — ');
  const intLogo = integrator && logoFile('integrator');
  const sideLogo = integrator ? logo('integrator') : logo('client');
  // The Improvement Axes are the integrator's internal document: its brand only (the client's when there is none).
  const internal = doc === 'axes' && integrator;
  // The TAD: the client logo, and next to it the integrator's (its logo file when configured, else its initials).
  const coverLogos = internal
    ? `<img src="${logo('integrator')}" alt="${escapeHtml(integrator)}">`
    : integrator
      ? `<img src="${logo('client')}" alt="${escapeHtml(cfg.client.name)}"><span class="logo-sep" aria-hidden="true"></span><img src="${intLogo ? dataUri(intLogo) : logo('integrator')}" alt="${escapeHtml(integrator)}" class="logo-int-cover">`
      : `<img src="${logo('client')}" alt="${escapeHtml(cfg.client.name)}">`;
  const vendor = (f) => readText(path.join(TEMPLATES, 'vendor', f));
  const coverTpl = readText(path.join(TEMPLATES, 'html', 'cover.html'));
  const tokens = {
    '{{VERSION}}': VERSION,
    '{{LANG}}': t(dict, 'meta.htmlLang'),
    '{{CSS}}': css,
    '{{BRAND_CSS}}': brandCss,
    '{{TITLE}}': escapeHtml(`${docName} — ${cfg.document.title} — ${cfg.client.name}`),
    '{{DESCRIPTION}}': escapeHtml(`${docName} — ${cfg.document.title} — ${cfg.client.name}${integrator ? ` (${integrator})` : ''}`),
    '{{COVER}}': coverTpl,
    '{{COVER_KICKER}}': escapeHtml(doc === 'tad' ? t(dict, 'doc.kicker') : t(dict, 'doc.axesKicker')),
    '{{COVER_NOTE}}': escapeHtml(t(dict, (doc === 'tad' ? 'doc.confidential' : 'doc.axesConfidential') + (integrator ? '' : 'Solo'), { client: cfg.client.name, integrator })),
    '{{DOC_TITLE}}': escapeHtml(cfg.document.title),
    '{{DOC_SUBTITLE}}': escapeHtml(cfg.document.subtitle || [cfg.client.name, ...facts.modules.clouds.filter((x) => !['events', 'shield', 'slack'].includes(x.id)).slice(0, 3).map((x) => x.name)].join(' · ')),
    '{{DOC_REFERENCE}}': escapeHtml(doc === 'tad' ? cfg.document.reference : cfg.document.reference + '-AX'),
    '{{DOC_VERSION}}': `${escapeHtml(cfg.document.version)}<span class="doc-status">${present(cfg.document.status) ? ' — ' + escapeHtml(cfg.document.status) : ''}</span>`,
    '{{DOC_DATE}}': escapeHtml(formatDate(cfg.document.date, lang)),
    '{{DOC_CLASSIFICATION}}': escapeHtml(doc === 'tad' ? cfg.document.classification : t(dict, 'doc.axesKicker')),
    '{{INTEGRATOR_NAME}}': escapeHtml(integrator || cfg.client.name),
    '{{COVER_LOGOS}}': coverLogos,
    '{{PREPARED_BY_ROW}}': preparedBy ? `<div><b>${escapeHtml(t(dict, 'doc.meta.author'))}</b><span>${escapeHtml(preparedBy)}</span></div>` : '',
    '{{CLIENT_NAME}}': escapeHtml(cfg.client.name),
    '{{TOC}}': toc.join(''),
    '{{FIGLIST}}': figs,
    '{{BODY}}': html,
    '{{INTEGRATOR_LOGO}}': sideLogo,
    '{{CLIENT_LOGO}}': logo('client'),
    '{{SIDE_TITLE}}': escapeHtml(`${docName} — ${cfg.document.title}`),
    '{{SIDE_SUB}}': escapeHtml(`${cfg.client.name} · v${cfg.document.version} · ${formatDate(cfg.document.date, lang)}`),
    '{{FOOTER}}': escapeHtml(`${integrator ? integrator + ' · ' : ''}${internal ? '' : cfg.client.name + ' · '}${doc === 'tad' ? cfg.document.classification : t(dict, 'doc.axesKicker')}`) + ` · <span class="gen">${escapeHtml(t(dict, 'doc.generatedBy'))}</span>`,
    '{{I18N_JSON}}': JSON.stringify({ editor: dict.editor }).replace(/</g, '\\u003c'),
    '{{BRAND_JSON}}': JSON.stringify(brand).replace(/</g, '\\u003c'),
    '{{DOCX_LIB}}': vendor('html-docx.js'),
    '{{CAPTURE_LIB}}': vendor('html2canvas.min.js'),
    '{{EDITOR_JS}}': readText(path.join(TEMPLATES, 'html', 'editor.js')),
  };
  let tpl = readText(path.join(TEMPLATES, 'html', 'template.html'));
  if (!figs) tpl = tpl.replace(/<details class="figs">[\s\S]*?<\/details>/, '');
  // Two passes over the template only (cover tokens live inside {{COVER}}); inserted content is never re-scanned.
  const fill = (s) => s.split(/(\{\{[A-Z0-9_]+\}\}|\{\{T:[\w.]+\}\})/).map((x) => {
    if (tokens[x] !== undefined) return tokens[x];
    const k = /^\{\{T:([\w.]+)\}\}$/.exec(x);
    return k ? t(dict, k[1]) : x;
  }).join('');
  tokens['{{COVER}}'] = fill(coverTpl);
  let out = fill(tpl);

  // Comments saved in the browser are carried over, with their resolution.
  const review = (cfg.review && cfg.review[doc]) || {};
  const carried = [];
  for (const rel of review.commentsFrom || []) {
    const p = wsCtx.p(rel);
    if (!exists(p)) { problems.push({ level: 'warn', code: 'comments-missing', message: `commentsFrom file not found: ${rel}` }); continue; }
    carried.push(...readComments(readText(p)));
  }
  // The HTML keeps one name across versions: the comments already saved in it are carried over too.
  const outDir = wsCtx.p(cfg.outputs.dir || 'out');
  const htmlPath = path.join(outDir, outputName(cfg, doc) + '.html');
  const prev = exists(htmlPath) ? readText(htmlPath) : null;
  if (prev) {
    const known = new Set(carried.map((c) => c.id));
    for (const c of readComments(prev)) if (!known.has(c.id)) carried.push(c);
  }
  for (const c of carried) {
    if (c.status === 'résolu') c.status = 'resolved';
    const res = review.resolutions && review.resolutions[c.id];
    // already answered with this resolution, yet open again: a reader reopened it — keep it open
    if (res && c.status === 'open' && c.response === res) problems.push({ level: 'warn', code: 'comment-reopened', message: `Comment ${c.id} was reopened by a reader after its resolution: answer it again (review.${doc}.resolutions).` });
    else if (res) { c.status = 'resolved'; c.response = res; }
    if ((review.dropImages || []).includes(c.id)) c.image = null;
  }
  if (carried.length) {
    const payload = JSON.stringify(carried, null, 1).replace(/</g, '\\u003c');
    out = out.replace('<script type="application/json" id="tad-comments">[]</script>', () => `<script type="application/json" id="tad-comments">${payload}</script>`);
  }

  let backup = null;
  // In-browser text edits cannot be merged into the Markdown sources: keep a copy so that nothing is lost.
  if (prev && prev.includes('data-edited="1"')) {
    backup = htmlPath.replace(/\.html$/, `_comments_${stamp()}.html`);
    writeText(backup, prev);
    problems.push({ level: 'warn', code: 'backup', message: `Existing file held in-browser text edits: copy kept as ${path.basename(backup)}. Report the edits into src/${doc}/*.md (comments are carried over automatically).` });
  }
  writeText(htmlPath, out);
  // how to draw it again with simplified figures: figureQA() calls it once when a figure does not read well
  Object.defineProperty(report, 'rebuild', { enumerable: false, configurable: true, writable: true,
    value: (more) => buildDocument(wsCtx, doc, { ...opts, simplify: [...new Set([...(opts.simplify || []), ...more])] }) });
  report.simplified = [...(opts.simplify || [])];
  Object.assign(report, { doc, html: htmlPath, backup, sizeKB: Math.round(out.length / 1024), figures: nfig, mermaid: figures.length, problems, pending, headings: pre.headings, rendered: opts.render !== false, draft: false });
  REPORTS.set(path.resolve(htmlPath), report);
  // Quality gate: a document with errors is a draft (watermark, draft status), never « For review ».
  if (opts.gate !== false) {
    const gate = await qualityGate(wsCtx, doc, { html: htmlPath, report });
    report.gate = gate;
  }
  return report;
}

export function readComments(html) {
  const m = /<script type="application\/json" id="tad-comments">([\s\S]*?)<\/script>/.exec(html);
  if (!m || !m[1].trim()) return [];
  try { return JSON.parse(m[1]); } catch { return []; }
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
