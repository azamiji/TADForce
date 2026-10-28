import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** Find a Chromium-based browser already installed (Chrome, Edge, Chromium) or a Puppeteer download. */
export function findBrowser() {
  const env = process.env.TADFORCE_CHROME || process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const candidates = process.platform === 'win32'
    ? [
        path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : [];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  if (process.platform !== 'win32') {
    for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      const r = spawnSync('which', [bin], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    }
  }
  // Browsers downloaded with `npx @puppeteer/browsers install chrome-headless-shell@stable`
  for (const base of [path.join(os.homedir(), '.cache', 'puppeteer'), path.join(process.cwd(), 'chrome-headless-shell'), path.join(process.cwd(), 'chrome')]) {
    if (!fs.existsSync(base)) continue;
    const hit = findExecutable(base, 4);
    if (hit) return hit;
  }
  return null;
}

function findExecutable(dir, depth) {
  if (depth < 0) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isFile() && /^(chrome|chrome-headless-shell)(\.exe)?$/.test(e.name)) return full;
    if (e.isDirectory()) { const r = findExecutable(full, depth - 1); if (r) return r; }
  }
  return null;
}

let shared = null;

/** Launch (once) a headless browser. Caller closes it with closeBrowser(). */
export async function getBrowser() {
  if (shared) return shared;
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new Error('No Chrome, Edge or Chromium found. Install one, or run `npx @puppeteer/browsers install chrome-headless-shell@stable` and set TADFORCE_CHROME to its path.');
  }
  const { default: puppeteer } = await import('puppeteer-core');
  shared = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--disable-gpu', '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  });
  return shared;
}

export async function closeBrowser() {
  if (shared) { const b = shared; shared = null; await b.close(); }
}
