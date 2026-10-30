// Serve a built document on 127.0.0.1 so that « Save » in the page writes back to the very same file:
// one file per document, the review comments never split across copies.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const MAX_BYTES = 128 * 1024 * 1024;

/** Atomic write: a reader never sees a half-written document. */
export function writeAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Start the server. GET and PUT on /<token>/<file name> only; the random token keeps other pages
 * and other local users from writing to the file. Resolves with { url, close }.
 */
export function serveDocument(file, { port = 0 } = {}) {
  const abs = path.resolve(file);
  const token = crypto.randomBytes(12).toString('hex');
  const route = `/${token}/${encodeURIComponent(path.basename(abs))}`;
  const server = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0];
    if (url !== route) { res.writeHead(404).end(); return; }
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      fs.createReadStream(abs).pipe(res);
      return;
    }
    if (req.method === 'PUT') {
      // Same-origin only: a page served elsewhere cannot overwrite the document.
      const origin = req.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${server.address().port}`) { res.writeHead(403).end(); return; }
      const chunks = []; let size = 0;
      req.on('data', (d) => { size += d.length; if (size > MAX_BYTES) { res.writeHead(413).end(); req.destroy(); } else chunks.push(d); });
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!/^<!doctype html>/i.test(body)) { res.writeHead(400).end('not an HTML document'); return; }
        writeAtomic(abs, body);
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, file: path.basename(abs) }));
      });
      return;
    }
    res.writeHead(405).end();
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}${route}`, close: () => new Promise((r) => server.close(r)), server }));
  });
}

export function openInBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* the URL is printed anyway */ }
}
