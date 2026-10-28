import path from 'node:path';
import { exists, readJson, readYaml, writeJson } from './fsx.js';
import { CONFIG_FILE, WORKSPACE_DIR } from './paths.js';

export const DEFAULT_BRAND = {
  primary: '#0B2545',
  accent: '#3D5AFE',
  accent2: '#9B1FE8',
  gradient: ['#1E88FF', '#9B1FE8'],
  tableHeader: '#0f2a4d',
};

export function defaultConfig(overrides = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const cfg = {
    language: 'en',
    client: { name: 'Client', short: 'CLIENT', logo: null },
    integrator: { name: 'Integrator', logo: null },
    document: {
      title: 'Salesforce CRM Platform',
      subtitle: '',
      reference: 'TAD-CLIENT-CRM',
      version: '1.0',
      status: 'For review',
      date: today,
      classification: 'Confidential',
      environment: 'Production',
      history: [],
    },
    org: { alias: null },
    brand: { ...DEFAULT_BRAND },
    source: { dir: '.snapshot/source' },
    manifest: { mode: 'curated', includePackages: false },
    outputs: { dir: 'out', pdf: true, docx: true },
    review: { tad: { commentsFrom: [], resolutions: {}, dropImages: [] }, axes: { commentsFrom: [], resolutions: {}, dropImages: [] } },
  };
  return deepMerge(cfg, overrides);
}

export function deepMerge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
}

/** Locate the workspace: --cwd/<tadforce>, or ./tadforce, or the current dir if it holds the config. */
export function findWorkspace(cwd = process.cwd()) {
  const candidates = [path.join(cwd, WORKSPACE_DIR), cwd];
  for (const dir of candidates) if (exists(path.join(dir, CONFIG_FILE))) return dir;
  return null;
}

export function loadWorkspace(cwd) {
  const ws = findWorkspace(cwd);
  if (!ws) {
    const err = new Error(`No TADForce workspace found under ${cwd}. Run \`npx tadforce init\` first.`);
    err.code = 'NO_WORKSPACE';
    throw err;
  }
  const cfg = defaultConfig(readJson(path.join(ws, CONFIG_FILE)));
  const project = path.dirname(ws);
  return {
    ws,
    project,
    cfg,
    p: (...parts) => path.resolve(ws, ...parts),
    glossary: () => readYaml(path.join(ws, 'knowledge', 'glossary.yml'), {}),
    exclusions: () => readYaml(path.join(ws, 'knowledge', 'exclusions.yml'), {}),
    save: (next) => writeJson(path.join(ws, CONFIG_FILE), next),
  };
}

/** Resolve the metadata source directory: the retrieved snapshot, else the project's package dirs. */
export function sourceDirs(wsCtx) {
  const snap = wsCtx.p(wsCtx.cfg.source.dir);
  if (exists(snap)) return [snap];
  const sfdx = path.join(wsCtx.project, 'sfdx-project.json');
  if (exists(sfdx)) {
    const dirs = (readJson(sfdx).packageDirectories || []).map((d) => path.join(wsCtx.project, d.path)).filter(exists);
    if (dirs.length) return dirs;
  }
  return [];
}
