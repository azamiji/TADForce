// Read-only wrapper around the Salesforce CLI. Every call goes through an allow-list:
// TADForce never deploys, never deletes, never reads record-level data.
import { spawn, spawnSync } from 'node:child_process';

const ALLOWED = [
  ['--version'],
  ['org', 'list'],
  ['org', 'display'],
  ['org', 'login', 'web'],
  ['org', 'list', 'metadata-types'],
  ['org', 'list', 'metadata'],
  ['org', 'list', 'limits'],
  ['project', 'generate', 'manifest'],
  ['project', 'retrieve', 'start'],
  ['data', 'query'],
  ['package', 'installed', 'list'],
  ['config', 'get'],
];

// sObjects whose rows describe the org itself (configuration, not business data).
const METADATA_SOBJECTS = new Set([
  'organization', 'crontrigger', 'flowdefinitionview', 'apexorgwidecoverage', 'apexcodecoverageaggregate',
  'asyncapexjob', 'userlicense', 'permissionsetlicense', 'entitydefinition',
]);
// sObjects allowed only through aggregated queries (GROUP BY + COUNT).
const AGGREGATE_ONLY = new Set(['user', 'permissionsetassignment']);

/** The subcommand path (leading words before the first flag) must match an allowed path exactly. */
export function isAllowed(args) {
  const cmd = [];
  for (const a of args) { if (a.startsWith('-')) break; cmd.push(a); }
  if (!cmd.length) return args[0] === '--version';
  return ALLOWED.some((p) => p.length === cmd.length && p.every((w, i) => w === cmd[i]));
}

const AGG = /^(count\(\s*(id)?\s*\)|max\(\s*(createddate|lastmodifieddate)\s*\)|min\(\s*createddate\s*\))(\s+\w+)?$/i;

/** Throws unless the SOQL only reads org configuration or aggregates — never business records. */
export function assertSafeQuery(q) {
  const s = q.replace(/\s+/g, ' ').trim();
  const refuse = (why) => { throw new Error(`Refused query (${why}): ${s}`); };
  if (!/^select\s/i.test(s)) refuse('not a SELECT');
  const from = /\sfrom\s+([A-Za-z0-9_]+)/i.exec(s);
  if (!from) refuse('no FROM');
  const obj = from[1].toLowerCase();
  if (METADATA_SOBJECTS.has(obj)) return true;
  const fields = s.slice(6, from.index).split(',').map((f) => f.trim());
  const grouped = /\bgroup by\b/i.test(s);
  if (AGGREGATE_ONLY.has(obj)) {
    const ok = grouped && fields.some((f) => AGG.test(f)) && fields.every((f) => AGG.test(f) || /^[A-Za-z0-9_.]+(\s+\w+)?$/.test(f));
    if (!ok) refuse(`aggregates only on ${from[1]}`);
    return true;
  }
  if (grouped || !fields.every((f) => AGG.test(f))) refuse('record data is never read');
  return true;
}

function resolveSf() {
  return process.env.TADFORCE_SF_BIN || 'sf';
}

// On Windows `sf` is a .cmd shim and needs a shell: build one command line with quoted arguments.
const quote = (a) => (/^[\w@+=:,./\\-]+$/.test(a) ? a : '"' + String(a).replace(/"/g, '""') + '"');
function launch(args, opts) {
  if (process.platform !== 'win32') return [resolveSf(), args, { ...opts, shell: false }];
  return [[resolveSf(), ...args].map(quote).join(' '), [], { ...opts, shell: true }];
}

/** Run `sf ... --json` and return the parsed result (throws with the CLI message on failure). */
export function sfJson(args, { timeoutMs = 600000, cwd } = {}) {
  if (!isAllowed(args)) throw new Error(`TADForce refuses to run: sf ${args.join(' ')}`);
  if (args[0] === 'data' && args[1] === 'query') {
    const qi = args.findIndex((a) => a === '--query' || a === '-q');
    assertSafeQuery(args[qi + 1] || '');
  }
  return new Promise((resolve, reject) => {
    const [cmd, argv, opts] = launch([...args, '--json'], { cwd, env: { ...process.env, SF_DISABLE_TELEMETRY: 'true', SF_AUTOUPDATE_DISABLE: 'true' } });
    const child = spawn(cmd, argv, opts);
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`sf ${args.slice(0, 3).join(' ')} timed out`)); }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', () => {
      clearTimeout(timer);
      const start = out.indexOf('{');
      let parsed = null;
      try { parsed = JSON.parse(out.slice(start)); } catch { /* not JSON */ }
      if (!parsed) return reject(new Error((err || out || 'sf returned no JSON').trim().slice(0, 800)));
      if (parsed.status !== 0 && parsed.status !== undefined) {
        const e = new Error(parsed.message || parsed.name || 'sf command failed');
        e.sf = parsed;
        return reject(e);
      }
      resolve(parsed.result);
    });
  });
}

/** Interactive `sf` call (inherits the terminal) — used for the browser login only. */
export function sfInteractive(args) {
  if (!isAllowed(args)) throw new Error(`TADForce refuses to run: sf ${args.join(' ')}`);
  const [cmd, argv, opts] = launch(args, { stdio: 'inherit' });
  const r = spawnSync(cmd, argv, opts);
  return r.status === 0;
}

export function sfVersion() {
  const [cmd, argv, opts] = launch(['--version'], { encoding: 'utf8' });
  const r = spawnSync(cmd, argv, opts);
  if (r.status !== 0) return null;
  const m = /@salesforce\/cli\/(\d+\.\d+\.\d+)/.exec(r.stdout || '');
  return m ? m[1] : (r.stdout || '').trim() || null;
}

export function soql(query, alias, { tooling = false } = {}) {
  const args = ['data', 'query', '--query', query, '--target-org', alias];
  if (tooling) args.push('--use-tooling-api');
  return sfJson(args, { timeoutMs: 180000 });
}
