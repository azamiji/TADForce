// Visual QA of the figures of a built document. The page is laid out as it prints (print media,
// width of the A4 content box), then each figure is measured in the DOM — labels that overlap,
// text too small once the figure is scaled to the page, figure wider than the page, Mermaid errors —
// and photographed to tadforce/out/figures/<doc>-fig-<n>.png so that the agent can look at it.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getBrowser } from './browser.js';

/** A4 (210 mm) minus 14 mm margins on each side, at 96 px per inch. */
export const QA = {
  contentWidthPx: Math.round(((210 - 28) / 25.4) * 96),
  minFontPx: 7, // below: unreadable on paper (≈ 5 pt) — error
  warnFontPx: 8.5, // below: small (≈ 6.4 pt) — warning
  overlapRatio: 0.18, // share of the smaller label covered by another one
};

/* eslint-disable no-undef */
function measure(qa) {
  const doc = document.querySelector('article.doc') || document.body;
  const contentW = doc.clientWidth;
  const out = [];
  const nodes = [...doc.querySelectorAll('figure.diagram, p.figcap')];
  const scaleOf = (el) => { const m = el.getScreenCTM && el.getScreenCTM(); return m ? Math.hypot(m.a, m.b) : 1; };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0.5 && r.height > 0.5 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0; };
  for (const node of nodes) {
    const isFig = node.matches('figure.diagram');
    const body = isFig ? node.querySelector('.fig-body') || node : node.previousElementSibling && node.previousElementSibling.matches('.fig-body') ? node.previousElementSibling : null;
    if (!isFig && !body) continue;
    const capEl = isFig ? node.querySelector('figcaption') : node;
    const capText = (capEl ? capEl.textContent : '').trim();
    const num = /(\d+)/.exec(capText);
    const fig = { n: num ? Number(num[1]) : out.length + 1, id: node.id || '', caption: capText.replace(/^[^—]*\d+\s*—\s*/, ''), issues: [] };
    const add = (code, detail) => fig.issues.push({ code, detail });
    const err = node.querySelector('.mmd-error') || (body && body.querySelector('.mmd-error'));
    if (err) add('render-error', err.textContent.trim().split('\n')[0].slice(0, 200));
    if (body && body.querySelector('.mmd-src')) add('not-rendered', 'Mermaid source shown as text (built without a browser)');
    const svgs = body ? [...body.querySelectorAll('svg')].filter((s) => !s.parentElement.closest('svg')) : [];
    // wider than the page content box (or clipped by its frame)
    const box = (body || node).getBoundingClientRect();
    const wide = svgs.some((s) => s.getBoundingClientRect().width > contentW + 1) || box.width > contentW + 1 || (body && body.scrollWidth > body.clientWidth + 2);
    if (wide) add('too-wide', `wider than the page (${Math.round(Math.max(box.width, body ? body.scrollWidth : 0))} px for ${contentW} px)`);
    // labels: SVG text and HTML labels inside foreignObject
    const labels = [];
    let minFont = Infinity, minText = '';
    for (const svg of svgs) {
      for (const el of svg.querySelectorAll('text')) {
        const s = el.textContent.trim();
        if (!s || !visible(el)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize) * scaleOf(el);
        // the numbers in the circles of an autonumbered sequence are markers, sized by Mermaid
        if (px < minFont && !el.classList.contains('sequenceNumber')) { minFont = px; minText = s; }
        labels.push({ s, r: el.getBoundingClientRect() });
      }
      for (const fo of svg.querySelectorAll('foreignObject')) {
        const k = scaleOf(fo);
        for (const el of fo.querySelectorAll('*')) {
          if (![...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())) continue;
          if (!visible(el)) continue;
          const px = parseFloat(getComputedStyle(el).fontSize) * k;
          if (px < minFont) { minFont = px; minText = el.textContent.trim(); }
          labels.push({ s: el.textContent.trim(), r: el.getBoundingClientRect() });
        }
      }
    }
    if (minFont < qa.minFontPx) add('too-small', `smallest text ${minFont.toFixed(1)} px once scaled to the page («${minText.slice(0, 40)}»), minimum ${qa.minFontPx} px`);
    else if (minFont < qa.warnFontPx) add('small-text', `smallest text ${minFont.toFixed(1)} px once scaled to the page («${minText.slice(0, 40)}»)`);
    // overlapping labels (boxes trimmed of the line spacing)
    const rs = labels.map((l) => { const h = l.r.height * 0.2; return { s: l.s, x1: l.r.left + 0.5, x2: l.r.right - 0.5, y1: l.r.top + h, y2: l.r.bottom - h }; });
    const pairs = [];
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        const ix = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), iy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (ix <= 1 || iy <= 1) continue;
        const small = Math.min((a.x2 - a.x1) * (a.y2 - a.y1), (b.x2 - b.x1) * (b.y2 - b.y1));
        if (small > 0 && (ix * iy) / small > qa.overlapRatio) pairs.push([a.s, b.s]);
      }
    }
    if (pairs.length) add('overlap', `${pairs.length} overlapping label(s), e.g. «${pairs[0][0].slice(0, 40)}» over «${pairs[0][1].slice(0, 40)}»`);
    // area to photograph: the figure with its caption
    const top = Math.min(box.top, capEl ? capEl.getBoundingClientRect().top : box.top);
    const bottom = Math.max(box.bottom, capEl ? capEl.getBoundingClientRect().bottom : box.bottom);
    fig.clip = { x: Math.max(0, box.left - 4), y: Math.max(0, top + window.scrollY - 4), width: Math.min(box.width + 8, document.documentElement.scrollWidth), height: bottom - top + 8 };
    out.push(fig);
  }
  return { contentW, figures: out };
}
/* eslint-enable no-undef */

/**
 * Measure and photograph every figure of a built HTML document.
 * @returns {Promise<{ figures: Array<{ n, id, caption, png, issues: Array<{ code, detail }> }>, contentWidth }>}
 */
export async function figureQA(ctx, htmlPath, doc, opts = {}) {
  const qa = { ...QA, ...(opts.thresholds || {}) };
  const outDir = opts.outDir || ctx.p('out', 'figures');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.startsWith(`${doc}-fig-`) && f.endsWith('.png')) fs.rmSync(path.join(outDir, f), { force: true });
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: qa.contentWidthPx, height: 1100, deviceScaleFactor: opts.scale || 2 });
    await page.emulateMediaType('print');
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load', timeout: 120000 });
    // the watermark of a draft would be photographed with every figure
    await page.addStyleTag({ content: '.watermark{display:none!important}' });
    const res = await page.evaluate(measure, qa);
    const figures = [];
    for (const f of res.figures) {
      const png = path.join(outDir, `${doc}-fig-${f.n}.png`);
      try {
        if (f.clip.width > 1 && f.clip.height > 1) await page.screenshot({ path: png, clip: f.clip, captureBeyondViewport: true });
      } catch (e) { f.issues.push({ code: 'no-screenshot', detail: String(e.message || e).slice(0, 120) }); }
      figures.push({ n: f.n, id: f.id, caption: f.caption, png: fs.existsSync(png) ? png : null, issues: f.issues });
    }
    return { figures, contentWidth: res.contentW };
  } finally {
    await page.close();
  }
}
