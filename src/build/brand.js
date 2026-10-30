// Client branding: find the logo in the org snapshot, derive the document colours from evidence
// (the Lightning theme of the org first, the logo second). Everything stays editable in tadforce.config.json.
import fs from 'node:fs';
import path from 'node:path';
import { walk, readText } from '../util/fsx.js';
import { getBrowser } from './browser.js';

const IMAGE = /\.(svg|png|jpe?g|webp|gif)$/i;
const IMAGE_TYPES = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

/** Logo candidates in retrieved metadata: static resources, content assets and site assets named *logo*. */
export function findLogoCandidates(dirs) {
  const out = [];
  for (const dir of dirs) {
    for (const f of walk(dir, { filter: (p) => /logo/i.test(path.basename(p)) && !/-meta\.xml$/.test(p) })) {
      const rel = f.split(path.sep);
      const folder = rel.find((x) => ['staticresources', 'contentassets', 'experiences', 'digitalExperiences', 'documents', 'siteDotComSites'].includes(x));
      if (!folder) continue;
      let ext = path.extname(f).toLowerCase();
      // Static resources and content assets keep their MIME type in the companion -meta.xml.
      if (!IMAGE.test(f)) {
        const meta = [f + '-meta.xml', f.replace(/\.[^.]+$/, '') + '.resource-meta.xml', f.replace(/\.[^.]+$/, '') + '.asset-meta.xml'].find((m) => fs.existsSync(m));
        const type = meta && (/<contentType>([^<]+)<\/contentType>/.exec(readText(meta)) || [])[1];
        ext = type && IMAGE_TYPES[type.trim()];
        if (!ext) {
          const head = fs.readFileSync(f).subarray(0, 12);
          ext = head[0] === 0x89 && head[1] === 0x50 ? '.png' : head[0] === 0xff && head[1] === 0xd8 ? '.jpg' : /^\s*<(\?xml|svg)/.test(head.toString('utf8')) ? '.svg' : null;
        }
        if (!ext) continue;
      }
      out.push({ file: f, ext, source: folder, size: fs.statSync(f).size });
    }
  }
  // "logo" alone in the name first, then the larger file (a header logo beats a favicon).
  const score = (c) => (/^(client|company|brand)?[-_ ]?logo/i.test(path.basename(c.file)) ? 2 : 0) + (c.source === 'staticresources' ? 1 : 0);
  return out.sort((a, b) => score(b) - score(a) || b.size - a.size);
}

/** Brand colours declared in the org: LightningExperienceTheme → BrandingSet properties. */
export function orgThemeColors(dirs) {
  const colors = [];
  for (const dir of dirs) {
    for (const f of walk(dir, { filter: (p) => /\.brandingSet-meta\.xml$/.test(p) })) {
      const xml = readText(f);
      for (const m of xml.matchAll(/<brandingSetProperty>([\s\S]*?)<\/brandingSetProperty>/g)) {
        const name = (/<propertyName>([^<]+)</.exec(m[1]) || [])[1] || '';
        const value = (/<propertyValue>([^<]+)</.exec(m[1]) || [])[1] || '';
        if (/^#[0-9a-f]{6}$/i.test(value.trim()) && /brand|primary|action|header/i.test(name)) colors.push({ name, value: value.trim().toUpperCase(), file: path.basename(f) });
      }
    }
  }
  return colors;
}

// ---------------------------------------------------------------- colour maths (WCAG relative luminance)
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = (h) => { const [r, g, b] = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (h, target, t) => rgb2hex(hex2rgb(h).map((v, i) => v + (hex2rgb(target)[i] - v) * t));
/** Darken towards black until the colour reaches the contrast ratio on white. */
function darkEnough(h, ratio) { let c = h; for (let t = 0.1; contrast(c, '#FFFFFF') < ratio && t <= 1; t += 0.1) c = mix(h, '#000000', t); return c; }
const saturation = (h) => { const [r, g, b] = hex2rgb(h); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };

/**
 * A document palette from one or two brand colours: headings and table headers dark enough for
 * text on white (WCAG AA, 4.5:1), the brand colour itself kept for accents and the title gradient.
 */
export function paletteFrom(main, second) {
  const accent = darkEnough(main, 3);
  const accent2 = second && second !== main ? darkEnough(second, 3) : darkEnough(mix(main, '#7B3FE4', 0.45), 3);
  return {
    primary: darkEnough(mix(main, '#0B1A2E', 0.55), 9),
    accent,
    accent2,
    gradient: [main, second && second !== main ? second : accent2],
    tableHeader: darkEnough(mix(main, '#0B1A2E', 0.4), 7),
  };
}

/** Dominant saturated colours of an image, rendered in the headless browser (no extra dependency). */
export async function imageColors(file, max = 2) {
  const mime = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(file).toLowerCase()];
  const uri = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const buckets = await page.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const w = 96, h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * 96)) || 96;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data, count = {};
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue;
        const k = [d[i], d[i + 1], d[i + 2]].map((v) => Math.round(v / 24) * 24).join(',');
        count[k] = (count[k] || 0) + 1;
      }
      return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 40);
    }, uri);
    const colors = buckets.map(([k]) => rgb2hex(k.split(',').map(Number)))
      .filter((c) => saturation(c) > 0.25 && lum(c) > 0.02 && lum(c) < 0.85);
    const picked = [];
    for (const c of colors) if (!picked.some((p) => contrast(p, c) < 1.6)) { picked.push(c); if (picked.length === max) break; }
    return picked;
  } finally { await page.close(); }
}
