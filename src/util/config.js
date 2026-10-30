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
    // integrator and author are optional: when empty they are left out of the document.
    integrator: { name: null, logo: null },
    document: {
      author: null,
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
    // Functional specifications and other documents provided by the project (evidence level P2), relative to tadforce/.
    inputs: { specs: [] },
    // Part of the org to document: name patterns ("NWB_*") and package directories. Empty: the whole org.
    scope: { include: [], packageDirectories: [] },
    brand: { ...DEFAULT_BRAND },
    // mode: org (retrieved snapshot), local (the project's package directories) or both. null: not chosen yet.
    source: { dir: '.snapshot/source', mode: null },
    // What tadforce doctor already asked or searched, so that it never asks twice.
    setup: {},
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
    const err = new Error(`No TADForce workspace found under ${cwd}. Run \`npx tadforce doctor\` in your Salesforce project first.`);
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

/** Flags for the skeletons' conditions: `<!-- tad:if source.local -->`. */
export const sourceFlags = (cfg) => ({ local: cfg.source.mode === 'local', org: cfg.source.mode !== 'local' });

/** Metadata source directories: the retrieved snapshot and/or the project's package dirs (source.mode). */
export function sourceDirs(wsCtx) {
  const mode = wsCtx.cfg.source.mode;
  const snap = wsCtx.p(wsCtx.cfg.source.dir);
  const local = localDirs(wsCtx);
  if (mode === 'local') return local;
  if (mode === 'both') return [...(exists(snap) ? [snap] : []), ...local];
  if (exists(snap)) return [snap];
  return local;
}

function localDirs(wsCtx) {
  const sfdx = path.join(wsCtx.project, 'sfdx-project.json');
  if (exists(sfdx)) {
    const only = (wsCtx.cfg.scope && wsCtx.cfg.scope.packageDirectories) || [];
    const dirs = (readJson(sfdx).packageDirectories || []).filter((d) => !only.length || only.includes(d.path)).map((d) => path.join(wsCtx.project, d.path)).filter(exists);
    if (dirs.length) return dirs;
  }
  return [];
}
