// `tadforce review`: open the document to comment it (Save writes back to the same file),
// and list the open comments for the agent (/tadforce-review folds them into the sources).
import path from 'node:path';
import { exists } from '../util/fsx.js';
import { loadWorkspace } from '../util/config.js';
import { outputName } from '../build/render.js';
import { serveDocument, openInBrowser } from '../build/serve.js';
import { log } from '../util/log.js';
import * as docs from './docs.js';

export function documentPath(ctx, args) {
  const doc = args.doc && args.doc !== 'all' ? args.doc : 'tad';
  return args._[1] ? path.resolve(args._[1]) : path.join(ctx.p(ctx.cfg.outputs.dir || 'out'), outputName(ctx.cfg, doc) + '.html');
}

/** Serve the file until Ctrl+C. Every Save in the page replaces this file, comments included. */
export async function open(file) {
  const s = await serveDocument(file);
  log.ok(`Open: ${s.url}`);
  log.info(`« Save » in the page writes into ${file} — one file, the comments stay in it. Ctrl+C to stop.`);
  openInBrowser(s.url);
  await new Promise((resolve) => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
  await s.close();
  return 0;
}

export async function run(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const file = documentPath(ctx, args);
  if (!exists(file)) throw new Error(`No document at ${file}: run \`tadforce build\` first.`);
  await docs.comments({ ...args, _: ['comments', file] });
  if (args.json || args.open === false || !process.stdout.isTTY) return 0;
  console.log('');
  return open(file);
}
