#!/usr/bin/env node
// Record the README GIFs from the real demo document (docs/demo/TAD_NWB.html).
// Needs Chrome/Edge (as for the build) and ffmpeg on the PATH. Usage: node tools/record-demo.js [document|review|doctor]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getBrowser, closeBrowser } from '../src/build/browser.js';
import { serveDocument } from '../src/build/serve.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'gifs');
const DEMO = path.join(ROOT, 'docs', 'demo', 'TAD_NWB.html');
const W = 1280, H = 760;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const trace = (m) => { if (process.env.TADFORCE_DEBUG) console.error(`  · ${m}`); };

// Headless pages have no mouse pointer: draw one that follows the mouse events.
const CURSOR = `(() => { const c = document.createElement('div');
  c.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;pointer-events:none;left:-40px;top:-40px;background:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2718%27 height=%2718%27><path d=%27M1 1l6 15 2-6 6-2z%27 fill=%27%23111%27 stroke=%27white%27 stroke-width=%271.5%27/></svg>") no-repeat';
  document.addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(c)); if (document.body) document.body.appendChild(c); })();`;

async function record(name, url, script) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.evaluateOnNewDocument(CURSOR);
  trace(`open ${url}`);
  await page.goto(url, { waitUntil: 'load' });
  trace('loaded');
  await sleep(800);
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-frames-'));
  let n = 0, recording = true;
  const loop = (async () => { while (recording) { await page.screenshot({ path: path.join(frames, `f${String(n++).padStart(5, '0')}.png`) }).catch(() => {}); await sleep(60); } })();
  const t0 = Date.now();
  try { await script(page); } finally { recording = false; await loop; }
  const fps = Math.max(4, Math.round(n / ((Date.now() - t0) / 1000)));
  fs.mkdirSync(OUT, { recursive: true });
  const gif = path.join(OUT, `${name}.gif`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%05d.png'),
    '-vf', 'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif], { stdio: 'inherit' });
  fs.rmSync(frames, { recursive: true, force: true });
  await page.close();
  if (r.status !== 0) throw new Error('ffmpeg failed (is it on the PATH?)');
  console.log(`${path.relative(ROOT, gif)} — ${n} frames, ${Math.round(fs.statSync(gif).size / 1024)} KB`);
}

async function glide(page, x, y, steps = 18) { await page.mouse.move(x, y, { steps }); }
async function scrollTo(page, sel, offset = 20) {
  await page.evaluate((s, o) => { const el = document.querySelector(s); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: 'smooth' }); }, sel, offset);
  await sleep(1100);
}
async function clickToc(page, id) {
  const box = await (await page.$(`#toc a[href="#${id}"]`)).boundingBox();
  await glide(page, box.x + 40, box.y + box.height / 2);
  await sleep(250);
  await page.mouse.click(box.x + 40, box.y + box.height / 2);
  await sleep(1500);
}

const SCENES = {
  // Navigating the generated document: cover, KPI tiles, generated ERD, integrations.
  async document() {
    await record('document', 'file:///' + DEMO.split(path.sep).join('/'), async (page) => {
      await sleep(1200);
      await clickToc(page, 'ch-summary');
      await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' })); await sleep(1400);
      await clickToc(page, 'ch-data');
      await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })); await sleep(1600);
      await clickToc(page, 'ch-integration');
      await page.evaluate(() => window.scrollBy({ top: 380, behavior: 'smooth' })); await sleep(1600);
    });
  },

  // Review: comment a passage, Save — into the same file (served by `tadforce review`).
  async review() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tadforce-review-'));
    const file = path.join(dir, 'TAD_NWB.html');
    fs.copyFileSync(DEMO, file);
    const server = await serveDocument(file);
    try {
      await record('review', server.url, async (page) => {
        // 1. Comment a passage
        trace('1 comment');
        const btn = await (await page.$('#btnComment')).boundingBox();
        await glide(page, btn.x + btn.width / 2, btn.y + btn.height / 2); await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2); await sleep(500);
        const r = await page.evaluate(() => {
          const all = [...document.querySelectorAll('article.doc p')];
          const h = document.getElementById('ch-summary');
          const p = all.find((x) => (h.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) && x.textContent.length > 120);
          p.scrollIntoView({ block: 'center', behavior: 'instant' });
          const range = document.createRange(); range.selectNodeContents(p); const rects = range.getClientRects();
          const a = rects[0];
          const right = Math.max(...[...rects].filter((x) => Math.abs(x.top - a.top) < 4).map((x) => x.right));
          return { x0: a.left + 1, y0: a.top + a.height / 2, x1: Math.min(right - 4, a.left + 460), y1: a.top + a.height / 2 };
        });
        await glide(page, r.x0, r.y0); await page.mouse.down(); await glide(page, r.x1, r.y1, 25); await page.mouse.up(); await sleep(700);
        await page.type('#cmtPopText', 'Call it "the Customer 360 console", as in the specifications.', { delay: 28 });
        await sleep(300);
        const ok = await (await page.$('#cmtOk')).boundingBox();
        await glide(page, ok.x + ok.width / 2, ok.y + ok.height / 2); await page.mouse.click(ok.x + ok.width / 2, ok.y + ok.height / 2); await sleep(900);
        // (« Capture an area » is not recorded: html2canvas does not finish in headless Chrome)
        // 3. Save: the server writes the same file
        trace('3 save');
        const save = await (await page.$('#btnSave')).boundingBox();
        await glide(page, save.x + save.width / 2, save.y + save.height / 2); await page.mouse.click(save.x + save.width / 2, save.y + save.height / 2); await sleep(1800);
        const panel = await (await page.$('#btnPanel')).boundingBox();
        await glide(page, panel.x + panel.width / 2, panel.y + panel.height / 2);
        if (!(await page.evaluate(() => document.body.classList.contains('panel-open')))) await page.mouse.click(panel.x + panel.width / 2, panel.y + panel.height / 2);
        await sleep(2400);
      });
      const saved = fs.readFileSync(file, 'utf8');
      if (!/Customer 360 console/.test(saved)) throw new Error('the comment was not saved into the same file');
    } finally { await server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  },

  // `tadforce doctor` in a terminal: the prompts and messages of src/commands/doctor.js, replayed.
  async doctor() {
    // Fictional project and org (Northwind Bank); the numbers and questions are those of test/fixtures/northwind.
    const lines = [
      ['cmd', 'npx tadforce doctor'],
      ['dim', '▲ TADForce · no evidence, no sentence · doctor'],
      ['ask', '  Salesforce project found: northwind-crm (C:\\dev\\northwind-crm).\n  Generate the TAD for this project? [Y/n] ', 'y'],
      ['ok', '✔ Workspace created: tadforce/ (skills installed for your agents)'],
      ['ask', '  Default org of this project: nwb-prod (admin@northwind-bank.example, https://northwind-bank.my.salesforce.com)\n  Generate the TAD from this org? [Y/n/l = local sources only] ', 'y'],
      ['step', '› A few facts only you can confirm:'],
      ['dim', '  1. Document language — recommended: en\n  2. Client name — recommended: Northwind Bank\n  3. Integrator — recommended: (blank: the document only names the client)\n  4. Author — recommended: (blank: no author shown)\n  5. Functional specifications — recommended: (blank)\n  6. Part of the org to document — recommended: (blank: the whole org)'],
      ['ask', '  Accept all the recommended answers? [Y/n] ', 'y'],
      ['step', '› Metadata for the document:'],
      ['dim', '    1. retrieve all the metadata of nwb-prod, read-only (several minutes)  (recommended)\n    2. you retrieve the metadata yourself first, then give the go'],
      ['ask', '  Your choice [1]: ', '1'],
      ['ask', '  The retrieve takes several minutes, read-only. Start now? [Y/n] ', 'y'],
      ['step', '› Retrieving the metadata from the org (read-only, into tadforce/.snapshot)…'],
      ['ok', '✔ [1/18] ApexClass\n✔ [2/18] ApexTrigger\n✔ [5/18] CustomObject\n✔ [7/18] Flow\n  …\n✔ [18/18] RemoteSiteSetting, NamedCredential, ConnectedApp, …'],
      ['ok', '✔ facts.json: 13 classes (+5 tests), 2 triggers, 3 active flows, 5 LWC, 4 custom objects, 3 PSG'],
      ['ask', '  Logo: none (a badge with the initials) · colours: TADForce default colours\n  Keep it? [Y / path or URL of another logo] ', 'y'],
      ['step', '› What the metadata cannot tell:'],
      ['dim', '  1. Which system is api.corebanking.northwind-bank.example? (name as the client calls it)\n  2. Which system is sms.telco-partner.example? (name as the client calls it)\n  …\n  8. 4 component(s): name suggests an unused component (test, demo, POC, sample, old, legacy…). Exclude?\n     recommended: systems « to be confirmed », nothing excluded, no decommissioned feature'],
      ['ask', '  Accept the recommended answers? [Y/n] ', 'y'],
      ['ok', '✔ Org: nwb-prod (https://northwind-bank.my.salesforce.com)\n✔ Metadata: retrieved from the org → facts/facts.json\n✔ Ready. Evidence first.'],
      ['ask', '  Launch the writing of the document now with Claude Code? [Y/n] ', 'y'],
      ['step', '› Handing over to Claude Code: it writes the document, then builds and validates it…'],
    ];
    const html = `<!doctype html><html><body style="margin:0;background:#0b1020;font:15px/1.55 Consolas,Menlo,monospace;color:#e2e8f0">
      <div style="margin:28px;border-radius:12px;background:#111827;box-shadow:0 10px 40px #0008;overflow:hidden">
      <div style="background:#1f2937;padding:9px 14px;color:#9ca3af;font-size:13px">● ● ●&nbsp;&nbsp; my-salesforce-project — PowerShell</div>
      <pre id="t" style="margin:0;padding:18px 20px;min-height:640px;white-space:pre-wrap"></pre></div></body></html>`;
    const tmp = path.join(os.tmpdir(), 'tadforce-term.html'); fs.writeFileSync(tmp, html);
    await record('doctor', 'file:///' + tmp.split(path.sep).join('/'), async (page) => {
      const color = { cmd: '#e2e8f0', dim: '#94a3b8', ok: '#4ade80', ask: '#e2e8f0', hum: '#22d3ee', step: '#60a5fa' };
      for (const [kind, text, answer] of lines) {
        await page.evaluate((t, c, k) => { const s = document.createElement('span'); s.style.color = c; s.textContent = k === 'cmd' ? '' : t; document.getElementById('t').appendChild(s); if (k === 'cmd') { const p = document.createElement('span'); p.style.color = '#7dd3fc'; p.textContent = 'PS> '; s.before(p); } }, text, color[kind], kind);
        if (kind === 'cmd') for (const ch of text) { await page.evaluate((x) => { document.getElementById('t').lastChild.textContent += x; }, ch); await sleep(45); }
        if (kind === 'ask') { await sleep(350); for (const ch of answer || '') { await page.evaluate((x) => { const s = document.createElement('span'); s.style.color = '#fbbf24'; s.textContent = x; document.getElementById('t').appendChild(s); }, ch); await sleep(40); } }
        // the terminal scrolls like a real one: the last lines stay in view
        await page.evaluate(() => { document.getElementById('t').appendChild(document.createTextNode('\n')); window.scrollTo(0, document.body.scrollHeight); });
        await sleep(kind === 'step' ? 700 : kind === 'cmd' ? 500 : 260);
      }
      await sleep(1800);
    });
    fs.rmSync(tmp, { force: true });
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
try {
  if (!fs.existsSync(DEMO)) throw new Error('docs/demo/TAD_NWB.html not found: run `npm run example` first.');
  for (const s of wanted) await SCENES[s]();
} finally { await closeBrowser(); }
