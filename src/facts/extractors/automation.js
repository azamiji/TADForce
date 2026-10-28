import { files, baseName, readXml, arr, bool, str, byName } from '../xml.js';

const desc = (v) => { const s = str(v); return s ? s.replace(/\s+/g, ' ').slice(0, 280) : null; };

export function extractAutomation(roots) {
  const flowDefs = {};
  for (const f of files(roots, 'flowDefinitions', '.flowDefinition-meta.xml')) {
    const x = readXml(f);
    flowDefs[baseName(f, '.flowDefinition-meta.xml')] = str(x.activeVersionNumber);
  }

  const flows = files(roots, 'flows', '.flow-meta.xml').map((f) => {
    const x = readXml(f);
    const name = baseName(f, '.flow-meta.xml');
    const start = x.start || {};
    const sched = start.schedule || {};
    let status = str(x.status) || 'Unknown';
    if (flowDefs[name] === '0') status = 'Inactive';
    const actionCalls = arr(x.actionCalls);
    return {
      name,
      label: str(x.label),
      processType: str(x.processType),
      status,
      active: status === 'Active',
      apiVersion: str(x.apiVersion),
      object: str(start.object),
      triggerType: str(start.triggerType),
      recordTriggerType: str(start.recordTriggerType),
      scheduleFrequency: str(sched.frequency),
      description: desc(x.description),
      screens: arr(x.screens).length,
      subflows: [...new Set(arr(x.subflows).map((s) => str(s.flowName)).filter(Boolean))].sort(),
      apexActions: [...new Set(actionCalls.filter((a) => str(a.actionType) === 'apex').map((a) => str(a.actionName)).filter(Boolean))].sort(),
      recordOps: {
        create: arr(x.recordCreates).length,
        update: arr(x.recordUpdates).length,
        lookup: arr(x.recordLookups).length,
        delete: arr(x.recordDeletes).length,
      },
    };
  }).sort(byName);

  const omni = (folder, suffix, extra = () => ({})) => files(roots, folder, suffix).map((f) => {
    const x = readXml(f);
    return {
      name: baseName(f, suffix),
      label: str(x.name),
      type: str(x.type),
      subType: str(x.subType),
      language: str(x.language),
      active: bool(x.isActive),
      version: str(x.versionNumber),
      ...extra(x),
    };
  }).sort(byName);

  const omnistudio = {
    omniScripts: omni('omniScripts', '.os-meta.xml'),
    integrationProcedures: omni('omniIntegrationProcedures', '.oip-meta.xml'),
    dataMappers: omni('omniDataTransforms', '.rpt-meta.xml', (x) => ({ inputType: str(x.inputType), outputType: str(x.outputType) })),
    flexCards: omni('omniUiCard', '.ouc-meta.xml'),
  };

  // Legacy automation (review signals)
  let workflowRules = 0, workflowFieldUpdates = 0, workflowAlerts = 0;
  for (const f of files(roots, 'workflows', '.workflow-meta.xml')) {
    const x = readXml(f);
    workflowRules += arr(x.rules).length;
    workflowFieldUpdates += arr(x.fieldUpdates).length;
    workflowAlerts += arr(x.alerts).length;
  }
  const count = (folder, suffix) => files(roots, folder, suffix).length;
  const legacy = {
    workflowRules, workflowFieldUpdates, workflowAlerts,
    processBuilders: flows.filter((f) => f.processType === 'Workflow').length,
    approvalProcesses: count('approvalProcesses', '.approvalProcess-meta.xml'),
    assignmentRules: count('assignmentRules', '.assignmentRules-meta.xml'),
    autoResponseRules: count('autoResponseRules', '.autoResponseRules-meta.xml'),
    escalationRules: count('escalationRules', '.escalationRules-meta.xml'),
    duplicateRules: count('duplicateRules', '.duplicateRule-meta.xml'),
    matchingRules: count('matchingRules', '.matchingRule-meta.xml'),
  };
  return { flows, omnistudio, rules: legacy };
}
