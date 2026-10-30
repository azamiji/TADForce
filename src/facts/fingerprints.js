// Content fingerprints of the metadata, one per file: what `tadforce update` compares between two versions.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { walk, toPosix } from '../util/fsx.js';

/** Metadata folder → facts.json area it feeds. */
export const AREAS = {
  classes: 'apex', triggers: 'apex',
  objects: 'data', customMetadata: 'data.cmdtTypes', globalValueSets: 'data',
  flows: 'automation.flows', workflows: 'automation',
  omniScripts: 'automation.omnistudio', omniIntegrationProcedures: 'automation.omnistudio', omniDataTransforms: 'automation.omnistudio', omniUiCard: 'automation.omnistudio',
  lwc: 'ui', aura: 'ui', pages: 'ui', components: 'ui', flexipages: 'ui', applications: 'ui', tabs: 'ui', quickActions: 'ui', messageChannels: 'ui', experiences: 'ui', digitalExperiences: 'ui', callCenters: 'integration',
  permissionsets: 'security', permissionsetgroups: 'security', profiles: 'security', roles: 'security', queues: 'security', groups: 'security', sharingRules: 'security', customPermissions: 'security',
  namedCredentials: 'integration', externalCredentials: 'integration', remoteSiteSettings: 'integration', connectedApps: 'integration', authproviders: 'integration', cspTrustedSites: 'integration', corsWhitelistOrigins: 'integration', externalServiceRegistrations: 'integration',
  reports: 'misc', dashboards: 'misc', reportTypes: 'misc', staticresources: 'misc', labels: 'misc', email: 'misc',
  genAiPlugins: 'modules', genAiFunctions: 'modules', genAiPromptTemplates: 'modules', bots: 'modules',
};

/** One hash per metadata file, keyed by its path from the type folder (classes/Foo.cls). */
export function fingerprints(dirs) {
  const out = {};
  for (const dir of dirs) {
    for (const f of walk(dir)) {
      const parts = toPosix(path.relative(dir, f)).split('/');
      const i = parts.findIndex((p) => AREAS[p]);
      if (i < 0) continue;
      out[parts.slice(i).join('/')] = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
