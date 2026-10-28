// Review signals for the Improvement Axes document. A signal is a measurable observation,
// not a verdict: the architect confirms, qualifies and prioritises it.

const list = (items, n = 12) => items.slice(0, n);

export function computeSignals(f, org = null, codeAnalyzer = null) {
  const s = [];
  const add = (id, pillar, priority, value, evidence = [], extra = {}) => { if (value) s.push({ id, pillar, priority, value, evidence: list(evidence), total: evidence.length, ...extra }); };
  const app = f.apex.classes.filter((c) => !c.test);
  const tests = f.apex.classes.filter((c) => c.test);

  const versions = [...app, ...f.apex.triggers, ...f.automation.flows].map((x) => parseFloat(x.apiVersion)).filter((v) => !Number.isNaN(v));
  const maxApi = versions.length ? Math.max(...versions) : null;
  if (maxApi) {
    const old = [...app, ...f.apex.triggers].filter((x) => parseFloat(x.apiVersion) <= maxApi - 15);
    add('api-version-old', 'adaptable', 'p3', old.length, old.map((x) => `${x.name} (${x.apiVersion})`), { threshold: `≤ ${(maxApi - 15).toFixed(1)}` });
  }
  const without = app.filter((c) => c.sharing === 'without');
  add('without-sharing', 'trusted', 'p2', without.length, without.map((c) => c.name));
  const none = app.filter((c) => c.sharing === 'none' && !c.kinds.includes('interface') && !c.kinds.includes('enum'));
  add('no-sharing-keyword', 'trusted', 'p3', none.length, none.map((c) => c.name));
  const ids = app.filter((c) => c.hardcodedIds > 0);
  add('hardcoded-ids', 'adaptable', 'p2', ids.length, ids.map((c) => c.name));
  const loops = app.filter((c) => c.soqlInLoops > 0);
  add('soql-dml-in-loops', 'easy', 'p2', loops.length, loops.map((c) => `${c.name} (${c.soqlInLoops})`));
  const big = app.filter((c) => c.lines > 1000);
  add('large-classes', 'adaptable', 'p3', big.length, big.map((c) => `${c.name} (${c.lines} lines)`));

  const perObject = {};
  for (const t of f.apex.triggers) (perObject[t.object] ||= []).push(t.name);
  const multi = Object.entries(perObject).filter(([, v]) => v.length > 1);
  add('multiple-triggers-per-object', 'adaptable', 'p2', multi.length, multi.map(([o, v]) => `${o}: ${v.join(', ')}`));
  const fat = f.apex.triggers.filter((t) => t.lines > 30);
  add('logic-in-triggers', 'adaptable', 'p3', fat.length, fat.map((t) => `${t.name} (${t.lines} lines)`));

  if (app.length) {
    const ratio = tests.length / app.length;
    if (ratio < 0.5) add('low-test-ratio', 'trusted', 'p2', `${tests.length}/${app.length}`, [], { ratio: Math.round(ratio * 100) / 100 });
  }
  if (org && typeof org.coverage === 'number') {
    if (org.coverage < 75) add('org-coverage', 'trusted', 'p1', `${org.coverage}%`);
    else if (org.coverage < 85) add('org-coverage', 'trusted', 'p3', `${org.coverage}%`);
  }

  add('aura-residual', 'adaptable', 'p3', f.ui.aura.length, f.ui.aura.map((a) => a.name));
  add('visualforce-residual', 'adaptable', 'p3', f.ui.vfPages.length, f.ui.vfPages.map((p) => p.name));
  add('workflow-rules', 'adaptable', 'p2', f.automation.rules.workflowRules);
  add('process-builders', 'adaptable', 'p2', f.automation.rules.processBuilders, f.automation.flows.filter((x) => x.processType === 'Workflow').map((x) => x.name));
  const inactive = f.automation.flows.filter((x) => !x.active);
  add('inactive-flows', 'easy', 'p3', inactive.length, inactive.map((x) => `${x.name} (${x.status})`));
  const flowsPerObject = {};
  for (const fl of f.automation.flows.filter((x) => x.active && x.object && /Record/.test(x.triggerType || ''))) (flowsPerObject[fl.object] ||= []).push(fl.name);
  const crowded = Object.entries(flowsPerObject).filter(([o]) => perObject[o]);
  add('flows-and-triggers-same-object', 'adaptable', 'p3', crowded.length, crowded.map(([o, v]) => `${o}: ${perObject[o].join(', ')} + ${v.join(', ')}`));

  const powerful = [...f.security.profiles, ...f.security.permissionSets].filter((p) => p.powerful.some((x) => ['ModifyAllData', 'ViewAllData'].includes(x)));
  add('powerful-permissions', 'trusted', 'p2', powerful.length, powerful.map((p) => `${p.name} (${p.powerful.filter((x) => ['ModifyAllData', 'ViewAllData'].includes(x)).join(', ')})`));
  const publicRW = f.data.objects.filter((o) => o.kind === 'custom' && !o.namespace && o.sharingModel === 'ReadWrite');
  add('public-read-write-objects', 'trusted', 'p3', publicRW.length, publicRW.map((o) => o.name));
  const insecure = f.integration.remoteSites.filter((r) => r.insecure);
  add('insecure-remote-sites', 'trusted', 'p1', insecure.length, insecure.map((r) => r.name));
  const legacyNc = f.integration.namedCredentials.filter((n) => n.type === 'Legacy');
  add('legacy-named-credentials', 'trusted', 'p3', legacyNc.length, legacyNc.map((n) => n.name));
  const fullScope = f.integration.connectedApps.filter((a) => a.scopes.includes('Full'));
  add('connected-app-full-scope', 'trusted', 'p2', fullScope.length, fullScope.map((a) => a.name));
  const undocumented = f.data.objects.filter((o) => o.kind === 'custom' && !o.namespace && !o.description);
  add('objects-without-description', 'easy', 'p3', undocumented.length, undocumented.map((o) => o.name));
  add('exclusion-candidates', 'easy', 'p3', f.exclusions.candidates.length, f.exclusions.candidates.map((c) => `${c.type} ${c.name}`));

  if (codeAnalyzer) {
    for (const [sev, n] of Object.entries(codeAnalyzer.bySeverity || {})) {
      if (n) add(`code-analyzer-sev${sev}`, 'trusted', Number(sev) <= 2 ? 'p1' : Number(sev) === 3 ? 'p2' : 'p3', n, (codeAnalyzer.topRules || []).map((r) => `${r.rule} (${r.count})`));
    }
  }
  return s;
}
