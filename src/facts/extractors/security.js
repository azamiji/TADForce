import { files, baseName, readXml, arr, bool, str, byName } from '../xml.js';

// System permissions worth surfacing in a review (powerful or sensitive).
const POWERFUL = ['ModifyAllData', 'ViewAllData', 'ManageUsers', 'AuthorApex', 'CustomizeApplication', 'ManageProfilesPermissionsets', 'ViewSetup', 'ApiEnabled', 'ManageSharing', 'ExportReport', 'ModifyMetadata', 'ManageInternalUsers', 'ResetPasswords', 'PasswordNeverExpires'];

function enabledPowerful(x) {
  return arr(x.userPermissions).filter((p) => bool(p.enabled) && POWERFUL.includes(str(p.name))).map((p) => str(p.name)).sort();
}

export function extractSecurity(roots) {
  const profiles = files(roots, 'profiles', '.profile-meta.xml').map((f) => {
    const x = readXml(f);
    return {
      name: baseName(f, '.profile-meta.xml'),
      userLicense: str(x.userLicense),
      custom: bool(x.custom),
      objectPermissions: arr(x.objectPermissions).length,
      fieldPermissions: arr(x.fieldPermissions).length,
      powerful: enabledPowerful(x),
      loginIpRanges: arr(x.loginIpRanges).length,
    };
  }).sort(byName);

  const permissionSets = files(roots, 'permissionsets', '.permissionset-meta.xml').map((f) => {
    const x = readXml(f);
    return {
      name: baseName(f, '.permissionset-meta.xml'),
      label: str(x.label),
      license: str(x.license),
      objectPermissions: arr(x.objectPermissions).length,
      fieldPermissions: arr(x.fieldPermissions).length,
      classAccesses: arr(x.classAccesses).length,
      customPermissions: arr(x.customPermissions).filter((c) => bool(c.enabled)).length,
      powerful: enabledPowerful(x),
      apps: arr(x.applicationVisibilities).filter((a) => bool(a.visible)).map((a) => str(a.application)).filter(Boolean).sort(),
    };
  }).sort(byName);

  const permissionSetGroups = files(roots, 'permissionsetgroups', '.permissionsetgroup-meta.xml').map((f) => {
    const x = readXml(f);
    return {
      name: baseName(f, '.permissionsetgroup-meta.xml'),
      label: str(x.label),
      permissionSets: arr(x.permissionSets).map(String).sort(),
      mutingPermissionSets: arr(x.mutingPermissionSets).map(String).sort(),
      status: str(x.status),
    };
  }).sort(byName);

  const roles = files(roots, 'roles', '.role-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.role-meta.xml'), label: str(x.name), parent: str(x.parentRole) };
  }).sort(byName);

  const queues = files(roots, 'queues', '.queue-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.queue-meta.xml'), label: str(x.name), objects: arr(x.queueSobject).map((q) => str(q.sobjectType)).filter(Boolean).sort() };
  }).sort(byName);

  const groups = files(roots, 'groups', '.group-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.group-meta.xml'), label: str(x.name), includeBosses: bool(x.doesIncludeBosses) };
  }).sort(byName);

  const sharingRules = files(roots, 'sharingRules', '.sharingRules-meta.xml').map((f) => {
    const x = readXml(f);
    const rule = (r, kind) => ({ name: str(r.fullName), label: str(r.label), kind, access: str(r.accessLevel) });
    const rules = [
      ...arr(x.sharingCriteriaRules).map((r) => rule(r, 'criteria')),
      ...arr(x.sharingOwnerRules).map((r) => rule(r, 'owner')),
      ...arr(x.sharingGuestRules).map((r) => rule(r, 'guest')),
      ...arr(x.sharingTerritoryRules).map((r) => rule(r, 'territory')),
    ].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { object: baseName(f, '.sharingRules-meta.xml'), rules };
  }).filter((s) => s.rules.length).sort((a, b) => a.object.localeCompare(b.object));

  const securitySettings = readXml(files(roots, 'settings', 'Security.settings-meta.xml')[0] || '');
  const session = securitySettings.sessionSettings || {};
  const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, str(o[k])]));

  return {
    profiles,
    permissionSets,
    permissionSetGroups,
    roles,
    queues,
    groups,
    sharingRules,
    customPermissions: files(roots, 'customPermissions', '.customPermission-meta.xml').map((f) => baseName(f, '.customPermission-meta.xml')).sort(),
    session: pick(session, ['sessionTimeout', 'forceLogoutOnSessionTimeout', 'lockSessionsToIp', 'lockSessionsToDomain', 'requireHttpOnly', 'enableClickjackNonsetupUser', 'enableCSRFOnGet', 'enableCSRFOnPost', 'enforceIpRangesEveryRequest', 'identityConfirmationOnTwoFactorRegistrationEnabled']),
    passwordPolicies: pick(securitySettings.passwordPolicies || {}, ['complexity', 'expiration', 'historyRestriction', 'lockoutInterval', 'maxLoginAttempts', 'minimumPasswordLength']),
  };
}
