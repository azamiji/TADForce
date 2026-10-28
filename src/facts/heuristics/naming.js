// Observed naming conventions: most frequent prefixes and suffixes per component family.
const SUFFIXES = ['TriggerHandler', 'Handler', 'Controller', 'Service', 'Selector', 'Domain', 'Batch', 'Queueable', 'Scheduler', 'Schedulable', 'Helper', 'Utils', 'Util', 'Manager', 'Engine', 'Factory', 'Wrapper', 'DTO', 'Mock', 'Test', 'Exception', 'Callout', 'Client', 'Resource', 'Api'];

function top(map, n = 6, min = 2) {
  return Object.entries(map).filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([value, count]) => ({ value, count }));
}

function prefixOf(name) {
  const m = /^([A-Za-z]+\d*_)/.exec(name) || /^([a-z]+\d+)/.exec(name) || /^([A-Z]{2,5})(?=[A-Z][a-z])/.exec(name);
  return m ? m[1] : null;
}

function prefixes(names) {
  const counts = {};
  for (const n of names) { const p = prefixOf(n); if (p) counts[p] = (counts[p] || 0) + 1; }
  return top(counts);
}

export function detectNaming(f) {
  const classes = f.apex.classes.map((c) => c.name);
  const suffixCounts = {};
  for (const n of classes) { const s = SUFFIXES.find((x) => n.endsWith(x)); if (s) suffixCounts[s] = (suffixCounts[s] || 0) + 1; }
  return {
    apex: { prefixes: prefixes(classes), suffixes: top(suffixCounts, 10, 1) },
    triggers: { prefixes: prefixes(f.apex.triggers.map((t) => t.name)) },
    lwc: { prefixes: prefixes(f.ui.lwc.map((l) => l.name)) },
    flows: { prefixes: prefixes(f.automation.flows.map((x) => x.name)) },
    objects: { prefixes: prefixes(f.data.objects.filter((o) => o.kind === 'custom' && !o.namespace).map((o) => o.name)) },
    permissionSets: { prefixes: prefixes(f.security.permissionSets.map((p) => p.name)) },
  };
}
