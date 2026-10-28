import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { getBrowser } from './browser.js';

/** PDF through the browser print engine (same layout as « Print / export › PDF »). */
export async function exportPdf(htmlPath, pdfPath) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load', timeout: 120000 });
    await page.emulateMediaType('print');
    await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, timeout: 300000 });
  } finally {
    await page.close();
  }
  return fs.statSync(pdfPath).size;
}

/** DOCX through the page's own export (same result as « Print / export › Word »). */
export async function exportDocx(htmlPath, docxPath) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1400, height: 1000 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load', timeout: 120000 });
    const b64 = await page.evaluate(async () => {
      let blob = null;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (b) { blob = b; return orig(b); };
      HTMLAnchorElement.prototype.click = function () {};
      document.getElementById('doDocx').click();
      for (let i = 0; i < 480 && !blob; i++) await new Promise((r) => setTimeout(r, 250));
      if (!blob) return null;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      return btoa(s);
    });
    if (!b64) throw new Error('The page did not produce a DOCX file.');
    fs.writeFileSync(docxPath, Buffer.from(b64, 'base64'));
  } finally {
    await page.close();
  }
  return fs.statSync(docxPath).size;
}

/** PNG screenshot of a page region (used for README visuals). */
export async function screenshot(htmlPath, pngPath, { width = 1440, height = 900, script } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    if (script) await page.evaluate(script);
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: pngPath });
  } finally {
    await page.close();
  }
}
