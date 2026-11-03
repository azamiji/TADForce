// The full inventory as an Excel workbook (tadforce/out/<DOC>_inventory.xlsx), so that the document's
// appendices stay short. No dependency: SpreadsheetML parts in a ZIP archive (stored, not compressed).
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- ZIP (store)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** A ZIP archive of { name, data } entries, stored without compression (fixed date: same input, same bytes). */
export function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (2020 - 1980) << 9 | 1 << 5 | 1; // 2020-01-01 00:00
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------------------------------------------------------------- SpreadsheetML
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

function cellXml(v, ref, header) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${header ? ' s="1"' : ''}><v>${v}</v></c>`;
  const s = Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
  return `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(s.slice(0, 32000))}</t></is></c>`;
}

function sheetXml(headers, rows) {
  const all = [headers, ...rows];
  const widths = headers.map((h, i) => Math.min(60, Math.max(8, ...all.slice(0, 500).map((r) => String(Array.isArray(r[i]) ? r[i].join(', ') : r[i] ?? '').length + 2))));
  const last = `${col(headers.length - 1)}${all.length}`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${all.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cellXml(v, `${col(ci)}${ri + 1}`, ri === 0)).join('')}</row>`).join('')}</sheetData>`
    + (rows.length ? `<autoFilter ref="A1:${last}"/>` : '')
    + '</worksheet>';
}

/** Sheet names: 31 characters at most, no []:*?/\ and unique. */
function sheetName(name, used) {
  let base = String(name).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

/** A workbook from sheets [{ name, headers, rows }]: the bytes of the .xlsx file. */
export function workbook(sheets) {
  const used = new Set();
  const named = sheets.map((s) => ({ ...s, name: sheetName(s.name, used) }));
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + named.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + named.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + named.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.headers, s.rows) })),
  ];
  return zip(files);
}

// ---------------------------------------------------------------- the inventory
const on = (v) => (v ? 'yes' : 'no');

/** One sheet per inventory family of facts.json (families without component are left out, the summary always stays). */
export function inventorySheets(facts) {
  const f = facts, org = f.org || null;
  const local = f.data.objects;
  const leaves = [];
  const visit = (o, p) => { for (const [k, v] of Object.entries(o || {})) { const key = p ? `${p}.${k}` : k; if (v && typeof v === 'object') visit(v, key); else leaves.push([key, v, (f.coverageByCount || {})[key] || 'collected']); } };
  visit(f.counts, '');
  const sheets = [
    { name: 'Summary', headers: ['Count', 'Value', 'Coverage'], rows: leaves.map(([k, v, cov]) => [k, cov === 'missing' ? 'not collected' : v, cov]) },
    { name: 'Apex classes', headers: ['Class', 'Test', 'Kinds', 'Sharing', 'API version', 'Lines', 'REST URL', 'Named credentials'], rows: f.apex.classes.map((c) => [c.name, on(c.test), c.kinds, c.sharing, c.apiVersion, c.lines, c.restUrl, c.namedCredentials]) },
    { name: 'Apex triggers', headers: ['Trigger', 'Object', 'Events', 'Active', 'API version', 'Lines'], rows: f.apex.triggers.map((t) => [t.name, t.object, t.events, on(t.active), t.apiVersion, t.lines]) },
    { name: 'Flows', headers: ['Flow', 'Label', 'Process type', 'Trigger', 'Object', 'Status', 'API version'], rows: f.automation.flows.map((x) => [x.name, x.label, x.processType, [x.triggerType, x.recordTriggerType, x.scheduleFrequency].filter(Boolean).join(' · '), x.object, x.status, x.apiVersion]) },
    { name: 'Objects', headers: ['Object', 'Label', 'Kind', 'Namespace', 'Used by the project', 'Custom fields', 'Record types', 'Validation rules', 'Relations', 'Sharing (internal)', 'Sharing (external)', 'Description'], rows: local.map((o) => [o.name, o.label, o.kind, o.namespace, on(o.used !== false), o.customFields, o.recordTypes.length, o.validationRules.length, o.relations.length, o.sharingModel, o.externalSharingModel, o.description]) },
    { name: 'Custom fields', headers: ['Object', 'Field'], rows: local.flatMap((o) => (o.customFieldNames || []).map((x) => [o.name, x])) },
    { name: 'Relationships', headers: ['Object', 'Field', 'Type', 'To'], rows: local.flatMap((o) => o.relations.map((r) => [o.name, r.field, r.type, r.to])) },
    { name: 'Record types', headers: ['Object', 'Record type', 'Label', 'Active'], rows: local.flatMap((o) => o.recordTypes.map((r) => [o.name, r.name, r.label, on(r.active)])) },
    { name: 'Validation rules', headers: ['Object', 'Rule', 'Active'], rows: local.flatMap((o) => o.validationRules.map((v) => [o.name, v.name, on(v.active)])) },
    { name: 'Custom Metadata', headers: ['Type', 'Records', 'Record names'], rows: f.data.cmdtTypes.map((t) => [t.type, t.records, t.names]) },
    ...['omniScripts', 'integrationProcedures', 'dataMappers', 'flexCards'].map((k) => ({ name: { omniScripts: 'OmniScripts', integrationProcedures: 'Integration Procedures', dataMappers: 'Data Mappers', flexCards: 'FlexCards' }[k], headers: ['Name', 'Label', 'Type', 'Sub type', 'Language', 'Active', 'Version'], rows: f.automation.omnistudio[k].map((x) => [x.name, x.label, x.type, x.subType, x.language, on(x.active), x.version]) })),
    { name: 'Lightning apps', headers: ['App', 'Label', 'Navigation', 'Form factors', 'Utility bar'], rows: f.ui.apps.map((a) => [a.name, a.label, a.navType, a.formFactors, a.utilityBar]) },
    { name: 'Lightning pages', headers: ['Page', 'Label', 'Type', 'Object', 'Custom components'], rows: f.ui.flexipages.map((p) => [p.name, p.label, p.type, p.object, p.customComponents]) },
    { name: 'LWC', headers: ['Component', 'Label', 'Exposed', 'Targets', 'Placed in', 'Apex'], rows: f.ui.lwc.map((l) => [l.name, l.label, on(l.exposed), l.targets, [...new Set((l.placedIn || []).map((u) => `${u.kind}:${u.name}`))], l.apex]) },
    { name: 'Aura', headers: ['Component', 'Type', 'Controller', 'Placed in'], rows: f.ui.aura.map((a) => [a.name, a.type, a.controller, (a.placedIn || []).map((u) => `${u.kind}:${u.name}`)]) },
    { name: 'Visualforce', headers: ['Page', 'Controller', 'Extensions'], rows: f.ui.vfPages.map((p) => [p.name, p.controller, p.extensions]) },
    { name: 'Tabs', headers: ['Tab', 'Label', 'Kind'], rows: f.ui.tabs.map((t) => [t.name, t.label, t.kind]) },
    { name: 'Quick actions', headers: ['Action', 'Type', 'Object', 'LWC', 'Flow'], rows: f.ui.quickActions.map((q) => [q.name, q.type, q.object, q.lwc, q.flow]) },
    { name: 'Permission set groups', headers: ['Group', 'Label', 'Permission sets', 'Users'], rows: f.security.permissionSetGroups.map((g) => [g.name, g.label, g.permissionSets, org && org.psgAssignments ? (org.psgAssignments.find((a) => a.group === g.name) || {}).users || 0 : null]) },
    { name: 'Permission sets', headers: ['Permission set', 'Label', 'License', 'Object permissions', 'Field permissions', 'Apps', 'Powerful permissions'], rows: f.security.permissionSets.map((p) => [p.name, p.label, p.license, p.objectPermissions, p.fieldPermissions, p.apps || [], p.powerful]) },
    { name: 'Profiles', headers: ['Profile', 'License', 'Custom', 'Users', 'Powerful permissions'], rows: f.security.profiles.map((p) => [p.name, p.userLicense, on(p.custom), org && org.usersByProfile ? (org.usersByProfile.find((u) => u.profile === p.name) || {}).users || 0 : null, p.powerful]) },
    { name: 'Roles', headers: ['Role', 'Label', 'Parent', 'Users'], rows: f.security.roles.map((r) => [r.name, r.label, r.parent, org && org.usersByRole ? (org.usersByRole.find((u) => u.role === r.name) || {}).users || 0 : null]) },
    { name: 'Queues', headers: ['Queue', 'Label', 'Objects'], rows: f.security.queues.map((q) => [q.name, q.label, q.objects]) },
    { name: 'Public groups', headers: ['Group', 'Label'], rows: f.security.groups.map((g) => [g.name, g.label]) },
    { name: 'Sharing rules', headers: ['Object', 'Rule', 'Kind', 'Access'], rows: f.security.sharingRules.flatMap((s) => s.rules.map((r) => [s.object, r.name, r.kind, r.access])) },
    { name: 'Sharing defaults', headers: ['Object', 'Label', 'Internal', 'External'], rows: (f.data.owd || []).map((o) => [o.object, o.label, o.internal, o.external]) },
    { name: 'Named credentials', headers: ['Named credential', 'Label', 'Type', 'Host', 'External credential'], rows: f.integration.namedCredentials.map((x) => [x.name, x.label, x.type, x.host, x.externalCredential]) },
    { name: 'External credentials', headers: ['External credential', 'Label', 'Protocol'], rows: f.integration.externalCredentials.map((x) => [x.name, x.label, x.protocol]) },
    { name: 'Connected apps', headers: ['Connected app', 'Label', 'OAuth', 'Scopes', 'SAML'], rows: f.integration.connectedApps.map((x) => [x.name, x.label, on(x.oauth), x.scopes, on(x.saml)]) },
    { name: 'Auth providers', headers: ['Provider', 'Label', 'Type', 'Registration handler'], rows: f.integration.authProviders.map((x) => [x.name, x.label, x.type, x.registrationHandler]) },
    { name: 'Allowed domains', headers: ['Kind', 'Name', 'Host'], rows: [...f.integration.remoteSites.map((x) => ['Remote Site', x.name, x.host]), ...f.integration.cspTrustedSites.map((x) => ['CSP Trusted Site', x.name, x.host]), ...f.integration.corsOrigins.map((x) => ['CORS', x.name, x.host])] },
    { name: 'Reports', headers: ['Report'], rows: f.misc.reports.names.map((x) => [x]) },
    { name: 'Dashboards', headers: ['Dashboard'], rows: f.misc.dashboards.names.map((x) => [x]) },
    { name: 'Report types', headers: ['Report type'], rows: f.misc.reportTypes.map((x) => [x]) },
    { name: 'Email templates', headers: ['Email template'], rows: f.misc.emailTemplates.map((x) => [x]) },
    { name: 'Custom labels', headers: ['Label', 'Category'], rows: f.misc.labels.map((l) => [l.name, l.category]) },
    { name: 'Static resources', headers: ['Static resource'], rows: f.misc.staticResources.map((x) => [x]) },
    { name: 'Metadata folders', headers: ['Folder', 'Files', 'Collected'], rows: Object.entries(f.coverage || {}).filter(([, v]) => v.files || v.collected).map(([k, v]) => [k, v.files, on(v.collected)]) },
    { name: 'Excluded', headers: ['Type', 'Name', 'Reason'], rows: f.exclusions.applied.map((x) => [x.type, x.name, x.reason]) },
    { name: 'Exclusion candidates', headers: ['Type', 'Name', 'Category', 'Reasons'], rows: f.exclusions.candidates.map((x) => [x.type, x.name, x.category, x.reasons]) },
  ];
  if (org) {
    sheets.push(
      { name: 'Scheduled jobs', headers: ['Job', 'Type', 'Cron', 'State', 'Next run', 'Owner'], rows: (org.scheduledJobs || []).map((j) => [j.name, j.type, j.cron, j.state, j.next, j.owner]) },
      { name: 'Volumes', headers: ['Object', 'Label', 'Records', 'Last created'], rows: (org.volumes || []).map((v) => [v.object, v.label, v.records, v.lastCreated]) },
      { name: 'Users by profile', headers: ['Profile', 'Active users'], rows: (org.usersByProfile || []).map((u) => [u.profile, u.users]) },
      { name: 'Users by role', headers: ['Role', 'Active users'], rows: (org.usersByRole || []).map((u) => [u.role, u.users]) },
      { name: 'Personas by role', headers: ['Permission set group', 'Role', 'Active users'], rows: (org.psgByRole || []).map((u) => [u.group, u.role, u.users]) },
    );
  }
  return sheets.filter((s, i) => i === 0 || s.rows.length);
}

/**
 * Write the full inventory workbook. ctx: the workspace (unused for now, kept for the output location
 * and future labels); facts: facts.json (with .org when org facts exist). Returns { path, sheets, bytes }.
 */
export function writeInventoryXlsx(ctx, facts, outPath) {
  const sheets = inventorySheets(facts);
  const bytes = workbook(sheets);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, bytes);
  return { path: outPath, sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length })), bytes: bytes.length };
}
