import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES } from '../util/paths.js';
import { getBrowser } from './browser.js';
import { LEGEND } from './figures.js';

// The colour legend as Mermaid classes (actors, Salesforce, external systems, data, warnings): added to
// every flowchart and state diagram, so `A["Advisor"]:::actor` needs no classDef in the source.
export const CLASSDEFS = '\n' + Object.entries(LEGEND).map(([k, [fill, stroke, ink]]) => `classDef ${k} fill:${fill},stroke:${stroke},color:${ink},stroke-width:1.2px`).join('\n') + '\n';

// One theme for every diagram: the legend colours (not the brand), one font, sizes that stay
// readable once the figure is scaled to the A4 content width (≈ 690 px) in the PDF and in Word.
export const MERMAID_CFG = {
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'loose',
  htmlLabels: false,
  fontFamily: 'Segoe UI, Arial, sans-serif',
  themeVariables: {
    fontFamily: 'Segoe UI, Arial, sans-serif',
    fontSize: '14px',
    primaryColor: LEGEND.sf[0],
    primaryBorderColor: LEGEND.sf[1],
    primaryTextColor: LEGEND.sf[2],
    lineColor: '#5B6B7D',
    secondaryColor: LEGEND.actor[0],
    tertiaryColor: '#F6F8FB',
    clusterBkg: '#F7F9FC',
    clusterBorder: '#C9D4E3',
    actorBkg: LEGEND.sf[0],
    actorBorder: LEGEND.sf[1],
    actorTextColor: LEGEND.sf[2],
    actorLineColor: '#8A99AB',
    signalColor: '#33475B',
    signalTextColor: '#1B2632',
    labelBoxBkgColor: '#FFFFFF',
    labelBoxBorderColor: '#5B6B7D',
    labelTextColor: '#1B2632',
    loopTextColor: '#1B2632',
    noteBkgColor: '#FFF8E1',
    noteBorderColor: '#E0B000',
    noteTextColor: '#3D2E00',
    activationBkgColor: '#DCE8FF',
    sequenceNumberColor: '#FFFFFF',
    edgeLabelBackground: '#FFFFFF',
    labelBackgroundColor: '#FFFFFF',
    stateBkg: LEGEND.data[0],
    stateBorder: LEGEND.data[1],
    transitionColor: '#5B6B7D',
    transitionLabelColor: '#1B2632',
  },
  // One layout engine for every graph (flowcharts, state diagrams, ERDs): ELK, layered, with orthogonal
  // edges. It keeps parents above children, gives every edge its own route and places the labels
  // without overlap — what erd.js once did by hand. Sequence diagrams and Gantt charts keep their own layout.
  layout: 'elk',
  elk: { mergeEdges: false, nodePlacementStrategy: 'BRANDES_KOEPF', considerModelOrder: 'NODES_AND_EDGES' },
  flowchart: { htmlLabels: false, curve: 'basis', padding: 12, nodeSpacing: 40, rankSpacing: 50, wrappingWidth: 180, useMaxWidth: true },
  sequence: { showSequenceNumbers: true, mirrorActors: false, actorMargin: 22, width: 120, height: 84, boxMargin: 6, messageFontSize: 14, actorFontSize: 14, noteFontSize: 13, wrap: true, useMaxWidth: true },
  er: { fontSize: 13, layoutDirection: 'TB', useMaxWidth: true, entityPadding: 12, minEntityWidth: 150 },
  state: { fontSize: 14, useMaxWidth: true },
  // drawn at the page width (688 px): Mermaid's default (1200 px) shrinks the date axis below a readable size
  gantt: { useWidth: 688, fontSize: 13, sectionFontSize: 13, barHeight: 22, barGap: 6, topPadding: 40, leftPadding: 150, gridLineStartPadding: 30, numberSectionStyles: 4, useMaxWidth: true },
};

const VENDOR = path.join(TEMPLATES, 'vendor');
const MERMAID_JS = path.join(VENDOR, 'mermaid.min.js');
// The ELK layout (@mermaid-js/layout-elk) ships as ES modules split in chunks: it is served to the page
// from templates/vendor/ under a private origin, never fetched from the network.
const ELK_ENTRY = 'mermaid-layout-elk/mermaid-layout-elk.esm.min.mjs';
const ELK_JS = path.join(VENDOR, ELK_ENTRY);
// `.invalid` never resolves (RFC 2606): every request of the page is answered from disk or blocked.
const ORIGIN = 'https://tadforce.invalid/';
const PAGE = '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:"Segoe UI",Arial,sans-serif;width:1400px}</style></head><body></body></html>';
// ids:hash — the SVG ids (and the CSS Mermaid scopes with them) are unique per figure, not per batch
const CFG_HASH = crypto.createHash('sha1').update('ids:hash' + JSON.stringify(MERMAID_CFG) + fs.statSync(MERMAID_JS).size + ':' + fs.statSync(ELK_JS).size).digest('hex').slice(0, 8);

export const figureHash = (code) => crypto.createHash('sha1').update(CFG_HASH + code).digest('hex').slice(0, 16);

/** Answer the requests of the rendering page from templates/vendor/; anything else is blocked. */
function serveVendor(req) {
  const url = req.url();
  if (/^(data|blob|about):/.test(url)) return req.continue();
  if (!url.startsWith(ORIGIN)) return req.abort('blockedbyclient');
  const rel = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!rel || rel === 'index.html') return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE });
  const file = path.resolve(VENDOR, rel);
  if (!file.startsWith(VENDOR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return req.respond({ status: 404, contentType: 'text/plain', body: 'not found' });
  return req.respond({ status: 200, contentType: /\.m?js$/.test(file) ? 'text/javascript; charset=utf-8' : 'application/octet-stream', body: fs.readFileSync(file) });
}

/** Render Mermaid figures to SVG strings with a headless browser, using a cache keyed by content. */
export async function renderMermaid(figures, cacheDir) {
  if (!figures.length) return figures;
  fs.mkdirSync(cacheDir, { recursive: true });
  const todo = [];
  for (const f of figures) {
    f.hash = figureHash(f.code);
    const p = path.join(cacheDir, f.hash + '.svg');
    if (fs.existsSync(p)) f.svg = fs.readFileSync(p, 'utf8');
    else todo.push(f);
  }
  if (!todo.length) return figures;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1400, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', (req) => { serveVendor(req).catch(() => {}); });
    await page.goto(ORIGIN + 'index.html', { waitUntil: 'load' });
    await page.addScriptTag({ url: ORIGIN + 'mermaid.min.js' });
    const results = await page.evaluate(async (codes, ids, cfg, elkUrl) => {
      // eslint-disable-next-line no-undef
      mermaid.registerLayoutLoaders((await import(elkUrl)).default);
      // eslint-disable-next-line no-undef
      mermaid.initialize(cfg);
      const out = [];
      for (let i = 0; i < codes.length; i++) {
        try {
          // the id scopes the figure's CSS: one per figure (its hash), so that cached figures never share one
          // eslint-disable-next-line no-undef
          const r = await mermaid.render(ids[i], codes[i]);
          out.push({ svg: r.svg });
        } catch (e) {
          out.push({ error: String((e && e.message) || e) });
          document.querySelectorAll('[id^="dtadfig"]').forEach((n) => n.remove());
        }
      }
      return out;
    }, todo.map((f) => f.code), todo.map((f) => 'tadfig-' + f.hash), MERMAID_CFG, ORIGIN + ELK_ENTRY);
    todo.forEach((f, i) => {
      const r = results[i] || { error: 'no output' };
      if (r.error || !/<svg/.test(r.svg || '')) {
        f.error = (r.error || 'invalid SVG').slice(0, 400);
        f.svg = `<pre class="mmd-error">${escapeHtml(f.error)}\n\n${escapeHtml(f.code.slice(0, 600))}</pre>`;
        return;
      }
      f.svg = r.svg;
      fs.writeFileSync(path.join(cacheDir, f.hash + '.svg'), r.svg, 'utf8');
    });
  } finally {
    await page.close();
  }
  return figures;
}

export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
