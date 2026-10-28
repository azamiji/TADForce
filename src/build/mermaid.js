import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES } from '../util/paths.js';
import { getBrowser } from './browser.js';

// Shared colour classes for flowcharts: actors, Salesforce, external systems, data, warnings.
export const CLASSDEFS = `
classDef actor fill:#F1E8FF,stroke:#7B3FE4,color:#2A1458,stroke-width:1.2px
classDef sf fill:#E8F1FF,stroke:#2F6FE4,color:#0B2545,stroke-width:1.2px
classDef ext fill:#FFF2E2,stroke:#E0861F,color:#4A2A05,stroke-width:1.2px
classDef data fill:#E7F6EC,stroke:#2E9E5B,color:#0E3B22,stroke-width:1.2px
classDef warn fill:#FDECEF,stroke:#D6336C,color:#5A0A23,stroke-width:1.2px
`;

export const MERMAID_CFG = {
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'loose',
  htmlLabels: false,
  fontFamily: 'Segoe UI, Arial, sans-serif',
  themeVariables: {
    fontFamily: 'Segoe UI, Arial, sans-serif',
    fontSize: '14px',
    primaryColor: '#E8F1FF',
    primaryBorderColor: '#2F6FE4',
    primaryTextColor: '#0B2545',
    lineColor: '#5B6B7D',
    secondaryColor: '#F1E8FF',
    tertiaryColor: '#F6F8FB',
    clusterBkg: '#F7F9FC',
    clusterBorder: '#C9D4E3',
    actorBkg: '#E8F1FF',
    actorBorder: '#2F6FE4',
    actorTextColor: '#0B2545',
    signalColor: '#33475B',
    signalTextColor: '#1B2632',
    labelBoxBkgColor: '#F1E8FF',
    labelBoxBorderColor: '#7B3FE4',
    noteBkgColor: '#FFF8E1',
    noteBorderColor: '#E0B000',
    activationBkgColor: '#DCE8FF',
    sequenceNumberColor: '#FFFFFF',
    edgeLabelBackground: '#FFFFFF',
  },
  flowchart: { htmlLabels: false, curve: 'basis', padding: 12, nodeSpacing: 40, rankSpacing: 50 },
  sequence: { showSequenceNumbers: true, actorMargin: 40, messageFontSize: 13, wrap: true, width: 160 },
  er: { fontSize: 13, layoutDirection: 'LR' },
  state: { fontSize: 13 },
};

const MERMAID_JS = path.join(TEMPLATES, 'vendor', 'mermaid.min.js');
const CFG_HASH = crypto.createHash('sha1').update(JSON.stringify(MERMAID_CFG) + fs.statSync(MERMAID_JS).size).digest('hex').slice(0, 8);

export const figureHash = (code) => crypto.createHash('sha1').update(CFG_HASH + code).digest('hex').slice(0, 16);

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
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:"Segoe UI",Arial,sans-serif;width:1400px}</style></head><body></body></html>');
    await page.addScriptTag({ path: MERMAID_JS });
    const results = await page.evaluate(async (codes, cfg) => {
      // eslint-disable-next-line no-undef
      mermaid.initialize(cfg);
      const out = [];
      for (let i = 0; i < codes.length; i++) {
        try {
          // eslint-disable-next-line no-undef
          const r = await mermaid.render('tadfig' + i, codes[i]);
          out.push({ svg: r.svg });
        } catch (e) {
          out.push({ error: String((e && e.message) || e) });
          document.querySelectorAll('[id^="dtadfig"]').forEach((n) => n.remove());
        }
      }
      return out;
    }, todo.map((f) => f.code), MERMAID_CFG);
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
