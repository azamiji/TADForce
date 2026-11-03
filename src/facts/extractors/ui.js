import path from 'node:path';
import { bundles, files, baseName, readXml, arr, bool, str, byName, safeRead } from '../xml.js';

const camel = (kebab) => kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

export function extractUi(roots) {
  const lwc = bundles(roots, 'lwc').filter((b) => !b.name.startsWith('__')).map((b) => {
    const meta = readXml(path.join(b.dir, `${b.name}.js-meta.xml`));
    const js = files([b.dir], '.', '.js').map(safeRead).join('\n');
    const html = files([b.dir], '.', '.html').map(safeRead).join('\n');
    const targets = arr(meta.targets && meta.targets.target).map(String).sort();
    return {
      name: b.name,
      label: str(meta.masterLabel),
      exposed: bool(meta.isExposed),
      targets,
      apex: [...new Set([...js.matchAll(/@salesforce\/apex\/([A-Za-z0-9_]+)\.[A-Za-z0-9_]+/g)].map((m) => m[1]))].sort(),
      children: [...new Set([...html.matchAll(/<c-([a-z0-9-]+)/g)].map((m) => camel(m[1])).concat([...js.matchAll(/from\s+['"]c\/([A-Za-z0-9_]+)['"]/g)].map((m) => m[1])))].sort(),
      usesMessageChannel: /lightning\/messageService/.test(js),
      usesNavigation: /lightning\/navigation/.test(js),
      usesWire: /@wire\s*\(/.test(js),
      service: !html.trim(),
      // objects read through @salesforce/schema imports (a standard object the project uses)
      objects: [...new Set([...js.matchAll(/@salesforce\/schema\/([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort(),
      // OmniStudio compiles OmniScripts and FlexCards into LWC that carry their runtime namespace
      runtimeNamespace: str(meta.runtimeNamespace),
    };
  });

  const aura = bundles(roots, 'aura').map((b) => {
    const markup = files([b.dir], '.', '').filter((f) => /\.(cmp|app|evt|intf|design)$/.test(f)).map(safeRead).join('\n');
    return {
      name: b.name,
      type: files([b.dir], '.', '.app').length ? 'application' : files([b.dir], '.', '.evt').length ? 'event' : 'component',
      controller: (/controller\s*=\s*"([A-Za-z0-9_.]+)"/i.exec(markup) || [])[1] || null,
      children: [...new Set([...markup.matchAll(/<c:([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort(),
    };
  });

  const vfPages = files(roots, 'pages', '.page').map((f) => {
    const src = safeRead(f);
    const tag = (/<apex:page[^>]*>/i.exec(src) || [''])[0];
    return {
      name: baseName(f, '.page'),
      controller: (/\bcontroller\s*=\s*"([^"]+)"/i.exec(tag) || [])[1] || null,
      extensions: ((/\bextensions\s*=\s*"([^"]+)"/i.exec(tag) || [])[1] || '').split(',').map((s) => s.trim()).filter(Boolean),
    };
  }).sort(byName);

  const flexipages = files(roots, 'flexipages', '.flexipage-meta.xml').map((f) => {
    const raw = safeRead(f);
    const x = readXml(f);
    const comps = [...raw.matchAll(/<componentName>([^<]+)<\/componentName>/g)].map((m) => m[1].trim());
    return {
      name: baseName(f, '.flexipage-meta.xml'),
      label: str(x.masterLabel),
      type: str(x.type),
      object: str(x.sobjectType),
      template: str(x.template && x.template.name),
      customComponents: [...new Set(comps.filter((c) => !c.includes(':')))].sort(),
      standardComponents: comps.filter((c) => c.includes(':')).length,
    };
  }).sort(byName);

  const apps = files(roots, 'applications', '.app-meta.xml').map((f) => {
    const x = readXml(f);
    return {
      name: baseName(f, '.app-meta.xml'),
      label: str(x.label),
      navType: str(x.navType),
      uiType: str(x.uiType),
      formFactors: arr(x.formFactors).map(String).sort(),
      tabs: arr(x.tabs).map(String),
      utilityBar: str(x.utilityBar),
      console: str(x.navType) === 'Console',
    };
  }).sort(byName);

  const tabs = files(roots, 'tabs', '.tab-meta.xml').map((f) => {
    const x = readXml(f);
    const kind = x.customObject ? 'object' : x.lwcComponent ? 'lwc' : x.flexiPage ? 'page' : x.url ? 'web' : x.page ? 'visualforce' : x.auraComponent ? 'aura' : 'other';
    return { name: baseName(f, '.tab-meta.xml'), kind, lwc: str(x.lwcComponent), aura: str(x.auraComponent), flexiPage: str(x.flexiPage), label: str(x.label) };
  }).sort(byName);

  const quickActions = files(roots, 'quickActions', '.quickAction-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.quickAction-meta.xml'), type: str(x.type), lwc: str(x.lightningWebComponent), aura: str(x.lightningComponent), flow: str(x.flowDefinition), object: str(x.targetObject) };
  }).sort(byName);

  const messageChannels = files(roots, 'messageChannels', '.messageChannel-meta.xml').map((f) => baseName(f, '.messageChannel-meta.xml')).sort();
  return { lwc, aura, vfPages, flexipages, apps, tabs, quickActions, messageChannels, vfComponents: files(roots, 'components', '.component').length };
}

/**
 * Where is each LWC / Aura component used? Scans pages, apps, tabs, actions, flows,
 * OmniStudio and Experience bundles. Result: { name: [{ kind, name }] }.
 */
export function placements(roots, ui) {
  const used = {};
  const add = (comp, kind, name) => { if (!comp) return; (used[comp] ||= []).push({ kind, name }); };
  for (const p of ui.flexipages) for (const c of p.customComponents) add(c, 'flexipage', p.name);
  for (const l of ui.lwc) for (const c of l.children) add(c, 'lwc', l.name);
  for (const a of ui.aura) for (const c of a.children) add(c, 'aura', a.name);
  for (const tb of ui.tabs) { add(tb.lwc, 'tab', tb.name); add(tb.aura, 'tab', tb.name); }
  for (const q of ui.quickActions) { add(q.lwc, 'quickAction', q.name); add(q.aura, 'quickAction', q.name); }
  const scan = (folder, kind, re) => {
    for (const f of files(roots, folder, '', { recursive: true })) {
      const raw = safeRead(f);
      for (const m of raw.matchAll(re)) add(m[1], kind, path.basename(f).split('.')[0]);
    }
  };
  scan('flows', 'flow', /<extensionName>c:([A-Za-z0-9_]+)<\/extensionName>/g);
  const omniRe = /lwcName(?:&quot;|")\s*:\s*(?:&quot;|")([A-Za-z0-9_]+)/g;
  scan('omniScripts', 'omniScript', omniRe);
  scan('omniUiCard', 'flexCard', omniRe);
  scan('experiences', 'experience', /"c:([A-Za-z0-9_]+)"/g);
  scan('digitalExperiences', 'experience', /"c:([A-Za-z0-9_]+)"/g);
  for (const k of Object.keys(used)) {
    const seen = new Set();
    used[k] = used[k].filter((u) => { const key = u.kind + ':' + u.name; if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a, b) => (a.kind + a.name).localeCompare(b.kind + b.name));
  }
  return used;
}
