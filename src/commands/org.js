// auth (browser login), detect (startup facts for the questions), manifest and retrieve.
import fs from 'node:fs';
import path from 'node:path';
import { exists, readText, writeText, writeJson } from '../util/fsx.js';
import { loadWorkspace } from '../util/config.js';
import { TEMPLATES } from '../util/paths.js';
import { sfJson, sfInteractive, soql } from '../sf/sf.js';
import { log } from '../util/log.js';
import { retrieveCompleteness, EXPECTED_NON_EMPTY } from '../facts/coverage.js';

function requireAlias(ctx, args) {
  const alias = args.org || ctx.cfg.org.alias;
  if (!alias) throw new Error('No target org. Pass --org <alias> or run `tadforce init --org <alias>`.');
  return alias;
}

export async function auth(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const alias = args.alias || args.org || ctx.cfg.org.alias || 'tadforce-org';
  const instance = args.instanceUrl || (args.sandbox ? 'https://test.salesforce.com' : null);
  log.banner('auth');
  log.human(`a browser window opens: log in to the org, then click « Allow ». Alias: ${alias}`);
  const ok = sfInteractive(['org', 'login', 'web', '--alias', alias, ...(instance ? ['--instance-url', instance] : [])]);
  if (!ok) { log.fail('Login did not complete.'); return 1; }
  ctx.save({ ...ctx.cfg, org: { ...ctx.cfg.org, alias } });
  log.ok(`Org authorized and saved in the workspace as "${alias}".`);
  return 0;
}

/** Facts to propose answers for the startup questions (language, client, integrator, environment). */
export async function detect(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const alias = requireAlias(ctx, args);
  const display = await sfJson(['org', 'display', '--target-org', alias]);
  const org = ((await soql('SELECT Name, IsSandbox, OrganizationType, LanguageLocaleKey, DefaultLocaleSidKey, InstanceName FROM Organization', alias)).records || [])[0] || {};
  const username = display.username || '';
  const domain = (/@([^@]+)$/.exec(username) || [])[1] || null;
  const result = {
    alias,
    username,
    instanceUrl: display.instanceUrl,
    apiVersion: display.apiVersion,
    organization: { name: org.Name, sandbox: org.IsSandbox, edition: org.OrganizationType, language: org.LanguageLocaleKey, locale: org.DefaultLocaleSidKey, instance: org.InstanceName },
    proposals: {
      language: /^fr/i.test(org.LanguageLocaleKey || '') ? 'fr' : 'en',
      client: org.Name,
      environment: org.IsSandbox ? 'Sandbox' : 'Production',
      integratorFromUserDomain: domain && !/salesforce\.com$|force\.com$/.test(domain) ? domain.split('.').slice(-2, -1)[0] : null,
    },
  };
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

const FOLDERED = { Report: 'ReportFolder', Dashboard: 'DashboardFolder', EmailTemplate: 'EmailFolder', Document: 'DocumentFolder' };

/** Build tadforce/.snapshot/package.xml: curated wildcard manifest filtered on what the org supports. */
export async function manifest(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const alias = requireAlias(ctx, args);
  const mode = args.mode || ctx.cfg.manifest.mode || 'curated';
  const out = ctx.p('.snapshot', 'package.xml');
  log.banner('manifest');
  if (mode === 'full') {
    log.step('Listing every metadata component of the org (packages excluded)…');
    await sfJson(['project', 'generate', 'manifest', '--from-org', alias, '--output-dir', ctx.p('.snapshot'), '--name', 'package.xml', ...(ctx.cfg.manifest.includePackages ? ['--include-packages', 'managed,unlocked'] : [])], { timeoutMs: 1800000 });
    log.ok(`Manifest written: ${path.relative(ctx.project, out)}`);
    return 0;
  }
  const tpl = readText(path.join(TEMPLATES, 'manifest', 'package-tad.xml'));
  const types = [...tpl.matchAll(/<types>([\s\S]*?)<\/types>/g)].map((m) => ({ name: /<name>([^<]+)<\/name>/.exec(m[1])[1], members: [...m[1].matchAll(/<members>([^<]+)<\/members>/g)].map((x) => x[1]) }));
  const version = /<version>([^<]+)<\/version>/.exec(tpl)[1];
  log.step('Asking the org which metadata types it supports…');
  const described = await sfJson(['org', 'list', 'metadata-types', '--target-org', alias], { timeoutMs: 300000 });
  const supported = new Set();
  for (const o of described.metadataObjects || []) { supported.add(o.xmlName); for (const ch of o.childXmlNames || []) supported.add(ch); }
  const kept = [], dropped = [];
  for (const t of types) (supported.has(t.name) || t.name === 'CustomObject' ? kept : dropped).push(t);

  // Foldered types: `*` does not reach inside folders, list each folder's content explicitly.
  for (const t of kept.filter((x) => FOLDERED[x.name])) {
    try {
      const folders = await sfJson(['org', 'list', 'metadata', '--metadata-type', FOLDERED[t.name], '--target-org', alias]);
      const names = [];
      for (const fo of (Array.isArray(folders) ? folders : []).filter((x) => !x.namespacePrefix)) {
        names.push(fo.fullName);
        const items = await sfJson(['org', 'list', 'metadata', '--metadata-type', t.name, '--folder', fo.fullName, '--target-org', alias]).catch(() => []);
        for (const it of Array.isArray(items) ? items : []) if (!it.namespacePrefix) names.push(it.fullName);
      }
      if (t.name === 'Report' || t.name === 'Dashboard') {
        const unfiled = await sfJson(['org', 'list', 'metadata', '--metadata-type', t.name, '--folder', 'unfiled$public', '--target-org', alias]).catch(() => []);
        for (const it of Array.isArray(unfiled) ? unfiled : []) names.push(it.fullName);
      }
      t.members = [...new Set(names)].sort();
      log.info(`${t.name}: ${t.members.length} member(s) in folders`);
    } catch (e) { log.warn(`${t.name}: folder listing failed (${e.message.slice(0, 120)})`); }
  }
  // Standard objects: `*` covers custom objects only; add the standard objects the org exposes.
  try {
    const objs = await sfJson(['org', 'list', 'metadata', '--metadata-type', 'CustomObject', '--target-org', alias], { timeoutMs: 300000 });
    const co = kept.find((x) => x.name === 'CustomObject');
    const std = (Array.isArray(objs) ? objs : []).filter((o) => !o.namespacePrefix && !/__/.test(o.fullName)).map((o) => o.fullName);
    co.members = [...new Set(['*', ...co.members, ...std])].sort((a, b) => (a === '*' ? -1 : b === '*' ? 1 : a.localeCompare(b)));
    log.info(`CustomObject: * plus ${std.length} standard object(s)`);
  } catch (e) { log.warn(`Standard objects listing failed, keeping the template list (${e.message.slice(0, 120)})`); }

  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
    ...kept.filter((t) => t.members.length).map((t) => `    <types>\n${t.members.map((m) => `        <members>${m}</members>`).join('\n')}\n        <name>${t.name}</name>\n    </types>`),
    `    <version>${version}</version>`, '</Package>', ''].join('\n');
  writeText(out, xml);
  writeJson(ctx.p('.snapshot', 'manifest-report.json'), { mode, kept: kept.map((t) => t.name), dropped: dropped.map((t) => t.name) });
  log.ok(`Manifest written: ${path.relative(ctx.project, out)} (${kept.length} types${dropped.length ? `, ${dropped.length} not available in this org` : ''})`);
  return 0;
}

/** Retrieve the manifest into tadforce/.snapshot/source, type batch by type batch. force-app is never touched. */
export async function retrieve(args) {
  const ctx = loadWorkspace(args.cwd || process.cwd());
  const alias = requireAlias(ctx, args);
  const mf = ctx.p('.snapshot', 'package.xml');
  if (!exists(mf)) throw new Error('No manifest: run `tadforce manifest` first.');
  const xml = readText(mf);
  const types = [...xml.matchAll(/<types>[\s\S]*?<\/types>/g)].map((m) => m[0]);
  const version = /<version>([^<]+)<\/version>/.exec(xml)[1];
  const size = Number(args.batchSize || 12);
  const outDir = ctx.p(ctx.cfg.source.dir);
  fs.mkdirSync(outDir, { recursive: true });
  // the CLI refuses to retrieve when a package directory of the project is missing
  for (const d of (exists(path.join(ctx.project, 'sfdx-project.json')) ? JSON.parse(readText(path.join(ctx.project, 'sfdx-project.json'))).packageDirectories || [] : [])) fs.mkdirSync(path.join(ctx.project, d.path), { recursive: true });
  log.banner('retrieve');
  const failed = [];
  const nameOf = (b) => /<name>([^<]+)<\/name>/.exec(b)[1];
  const typeXml = (name, members) => `    <types>\n${members.map((m) => `        <members>${m}</members>`).join('\n')}\n        <name>${name}</name>\n    </types>`;
  const runBatch = async (batch, label, minutes) => {
    const p = ctx.p('.snapshot', 'batch.xml');
    writeText(p, `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n${batch.join('\n')}\n    <version>${version}</version>\n</Package>\n`);
    await sfJson(['project', 'retrieve', 'start', '--manifest', p, '--target-org', alias, '--output-dir', outDir, '--wait', String(minutes), '--ignore-conflicts'], { timeoutMs: (minutes + 2) * 60000, cwd: ctx.project });
    if (label) log.ok(label);
  };
  // the CLI stopped waiting (« The client has timed out »): the job was too big for one retrieve
  const timedOut = (e) => /timed out|MetadataTransferError/i.test(`${e.message} ${e.sf && e.sf.name}`);
  // an error about the project itself fails every type the same way: stop at once, do not retry type by type
  const projectError = (e) => /MissingPackageDirectory|InvalidProjectWorkspace|specified in sfdx-project\.json, does not exist|sfdx-project\.json/i.test(`${e.message} ${e.sf && e.sf.name}`);
  // types the local Salesforce CLI does not know fail at once and never succeed: dropped, not retried
  const unknownType = (e) => (/registry for id '([^']+)'|Missing metadata type definition[^']*'([^']+)'/.exec(e.message) || []).slice(1).find(Boolean);
  // The types the document is built on come first, one by one, with up to 60 minutes each (--wait can only
  // lengthen it). Too big for one retrieve (huge org, 39 MB / 10,000 files limit): its components are listed
  // and retrieved by chunks of 100. The other types go by batches of 12 (30 minutes), then one by one (10 minutes).
  const CORE = ['ApexClass', 'ApexTrigger', 'CustomObject', 'Flow', 'LightningComponentBundle', 'AuraDefinitionBundle', 'Profile', 'PermissionSet', 'PermissionSetGroup', 'FlexiPage', 'CustomApplication', 'CustomMetadata', 'OmniScript', 'OmniIntegrationProcedure', 'OmniDataTransform', 'OmniUiCard'];
  // --core-wait shortens the first try (tests, impatient runs); the chunks always get the full 60 minutes
  if (args.coreWait !== undefined && !/^\d+$/.test(String(args.coreWait))) throw new Error('--core-wait takes a number of minutes (0 or more).');
  const coreWait = args.coreWait !== undefined ? Number(args.coreWait) : 60;
  const chunkWait = 60;
  const restWait = Math.min(Number(args.wait || 30), 30);
  const byChunks = async (b, step) => {
    const name = nameOf(b);
    let listed;
    try { listed = await sfJson(['org', 'list', 'metadata', '--metadata-type', name, '--target-org', alias], { timeoutMs: 600000 }); } catch (e) {
      // a product this org does not have (OmniStudio, …): nothing to retrieve, as `*` would say
      if (/INVALID_TYPE|Cannot use/i.test(e.message)) { log.info(`${step} ${name}: not used in this org`); return; }
      throw e;
    }
    const explicit = [...b.matchAll(/<members>([^<]+)<\/members>/g)].map((m) => m[1]).filter((m) => m !== '*');
    // the same components as `*`: everything but what installed packages bring (standard__ apps, force__ groups stay)
    const own = (Array.isArray(listed) ? listed : []).filter((x) => !/^(installed|deprecated)/i.test(x.manageableState || ''));
    const members = [...new Set([...own.map((x) => x.fullName), ...explicit])].sort();
    if (!members.length) {
      log.info(`${step} ${name}: nothing listed — one more try with the full wait`);
      return runBatch([b], `${step} ${name}`, chunkWait);
    }
    log.info(`${step} ${name}: did not finish in ${coreWait} min — ${members.length} component(s), retrieved by chunks of 100`);
    for (let i = 0; i < members.length; i += 100) await runBatch([typeXml(name, members.slice(i, i + 100))], `${step} ${name} ${Math.min(i + 100, members.length)}/${members.length}`, chunkWait);
  };
  const core = types.filter((b) => CORE.includes(nameOf(b)));
  const rest = types.filter((b) => !CORE.includes(nameOf(b)));
  const total = core.length + Math.ceil(rest.length / size);
  let n = 0;
  for (const b of core) {
    const step = `[${++n}/${total}]`;
    try {
      try { await runBatch([b], `${step} ${nameOf(b)}`, coreWait); } catch (e) { if (!timedOut(e)) throw e; await byChunks(b, step); }
    } catch (e) {
      if (projectError(e)) throw new Error(`The Salesforce DX project cannot be used (${e.message.slice(0, 200)}). Fix sfdx-project.json or its package directories, then retrieve again.`);
      const why = unknownType(e) ? 'not supported by this Salesforce CLI version' : e.message.slice(0, 300);
      failed.push({ type: nameOf(b), error: why, core: true });
      log.warn(`${step} ${nameOf(b)}: NOT retrieved (${why.slice(0, 120)}) — the document needs it`);
    }
  }
  for (let i = 0; i < rest.length; i += size) {
    let batch = rest.slice(i, i + size);
    const step = `[${++n}/${total}]`;
    for (let tries = 0; batch.length && tries < 3; tries++) {
      try { await runBatch(batch, `${step} ${batch.map(nameOf).join(', ')}`, restWait); batch = []; } catch (e) {
        if (projectError(e)) throw new Error(`The Salesforce DX project cannot be used (${e.message.slice(0, 200)}). Fix sfdx-project.json or its package directories, then retrieve again.`);
        const bad = unknownType(e);
        if (bad && batch.some((b) => nameOf(b) === bad)) {
          failed.push({ type: bad, error: 'not supported by this Salesforce CLI version' });
          log.warn(`${bad}: skipped (not supported by this Salesforce CLI version)`);
          batch = batch.filter((b) => nameOf(b) !== bad);
          continue;
        }
        log.warn(`${step} batch failed (${e.message.slice(0, 160)}) — retrying type by type`);
        for (const b of batch) {
          try { await runBatch([b], `${step} ${nameOf(b)}`, Math.min(10, restWait)); } catch (e2) { failed.push({ type: nameOf(b), error: e2.message.slice(0, 300) }); log.warn(`${nameOf(b)}: skipped (${e2.message.slice(0, 120)})`); }
        }
        batch = [];
      }
    }
  }
  // completeness: per type asked, the files that came back; a type every org has that came back empty was missed
  const check = retrieveCompleteness(types.map(nameOf), outDir, failed.map((x) => x.type));
  const suspicious = check.empty.filter((t) => EXPECTED_NON_EMPTY.includes(t));
  writeJson(ctx.p('.snapshot', 'retrieve-report.json'), { failed, types: check.byType, empty: check.empty, suspicious });
  if (suspicious.length) log.warn(`Requested but nothing came back: ${suspicious.join(', ')} — every org has some. Their counts are « not collected » until the retrieve gets them (tadforce doctor --refresh).`);
  // a type the document is built on is missing: not a ready snapshot
  const lost = failed.filter((x) => x.core).map((x) => x.type);
  if (lost.length) { log.fail(`Not retrieved, and the document needs them: ${lost.join(', ')}. Run the retrieve again (tadforce doctor --refresh).`); return 1; }
  log.ok(`Snapshot ready in ${path.relative(ctx.project, outDir)}${failed.length ? ` — ${failed.length} type(s) could not be retrieved (see .snapshot/retrieve-report.json)` : ''}.`);
  return 0;
}
