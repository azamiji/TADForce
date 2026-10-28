import path from 'node:path';
import { bundles, files, baseName, readXml, arr, bool, str, byName } from '../xml.js';

const RELATION_TYPES = new Set(['Lookup', 'MasterDetail', 'Hierarchy', 'ExternalLookup', 'IndirectLookup', 'MetadataRelationship']);

export function objectKind(name, meta = {}) {
  if (meta.customSettingsType) return 'customSetting';
  if (name.endsWith('__mdt')) return 'customMetadataType';
  if (name.endsWith('__e')) return 'platformEvent';
  if (name.endsWith('__b')) return 'bigObject';
  if (name.endsWith('__x')) return 'externalObject';
  if (name.endsWith('__c')) return 'custom';
  return 'standard';
}

export function namespaceOf(apiName) {
  const m = /^([A-Za-z][A-Za-z0-9]{0,14})__[A-Za-z0-9_]+?__(c|mdt|e|b|x|r)$/.exec(apiName);
  return m ? m[1] : null;
}

const desc = (v) => { const s = str(v); return s ? s.replace(/\s+/g, ' ').slice(0, 280) : null; };

export function extractData(roots) {
  const objects = [];
  for (const b of bundles(roots, 'objects')) {
    const meta = readXml(path.join(b.dir, `${b.name}.object-meta.xml`));
    const kind = objectKind(b.name, meta);
    const fields = files([b.dir], 'fields', '.field-meta.xml').map((f) => {
      const x = readXml(f);
      const name = baseName(f, '.field-meta.xml');
      return {
        name,
        label: str(x.label),
        type: str(x.type) || (x.formula ? 'Formula' : null),
        referenceTo: arr(x.referenceTo).map(String),
        relationshipName: str(x.relationshipName),
        externalId: bool(x.externalId),
        unique: bool(x.unique),
        required: bool(x.required),
        formula: x.formula != null,
        namespace: namespaceOf(name),
        custom: name.endsWith('__c'),
      };
    });
    const recordTypes = files([b.dir], 'recordTypes', '.recordType-meta.xml').map((f) => {
      const x = readXml(f);
      return { name: baseName(f, '.recordType-meta.xml'), label: str(x.label), active: x.active == null ? true : bool(x.active) };
    });
    const validationRules = files([b.dir], 'validationRules', '.validationRule-meta.xml').map((f) => {
      const x = readXml(f);
      return { name: baseName(f, '.validationRule-meta.xml'), active: bool(x.active) };
    });
    objects.push({
      name: b.name,
      label: str(meta.label),
      kind,
      namespace: namespaceOf(b.name),
      description: desc(meta.description),
      sharingModel: str(meta.sharingModel),
      externalSharingModel: str(meta.externalSharingModel),
      historyTracking: bool(meta.enableHistory),
      fieldsTotal: fields.length,
      customFields: fields.filter((f) => f.custom && !f.namespace).length,
      customFieldNames: fields.filter((f) => f.custom).map((f) => f.name).sort(),
      externalIds: fields.filter((f) => f.externalId).map((f) => f.name).sort(),
      relations: fields.filter((f) => RELATION_TYPES.has(f.type) && f.referenceTo.length).map((f) => ({ field: f.name, type: f.type, to: f.referenceTo, relationshipName: f.relationshipName }))
        .sort((a, b) => a.field.localeCompare(b.field)),
      formulaFields: fields.filter((f) => f.formula).length,
      recordTypes: recordTypes.sort(byName),
      validationRules: validationRules.sort(byName),
      fieldSets: files([b.dir], 'fieldSets', '.fieldSet-meta.xml').length,
      businessProcesses: files([b.dir], 'businessProcesses', '.businessProcess-meta.xml').length,
    });
  }

  // Custom Metadata records: <Type>.<Record>.md-meta.xml
  const cmdt = {};
  for (const f of files(roots, 'customMetadata', '.md-meta.xml')) {
    const base = baseName(f, '.md-meta.xml');
    const dot = base.indexOf('.');
    if (dot < 0) continue;
    const type = base.slice(0, dot) + '__mdt';
    (cmdt[type] ||= []).push(base.slice(dot + 1));
  }
  const cmdtTypes = Object.keys(cmdt).sort().map((type) => ({ type, records: cmdt[type].length, names: cmdt[type].sort() }));

  const globalValueSets = files(roots, 'globalValueSets', '.globalValueSet-meta.xml').map((f) => baseName(f, '.globalValueSet-meta.xml')).sort();
  const cdc = files(roots, 'platformEventChannelMembers', '.platformEventChannelMember-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.platformEventChannelMember-meta.xml'), entity: str(x.selectedEntity), channel: str(x.eventChannel) };
  });

  return { objects: objects.sort(byName), cmdtTypes, globalValueSets, cdc: cdc.sort(byName) };
}
