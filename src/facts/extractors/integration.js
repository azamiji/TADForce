import { files, baseName, readXml, arr, bool, str, byName, host } from '../xml.js';

export function extractIntegration(roots) {
  const namedCredentials = files(roots, 'namedCredentials', '.namedCredential-meta.xml').map((f) => {
    const x = readXml(f);
    const params = arr(x.namedCredentialParameters);
    const url = str(x.endpoint) || str((params.find((p) => str(p.parameterType) === 'Url') || {}).parameterValue);
    const ec = str((params.find((p) => str(p.parameterType) === 'Authentication') || {}).externalCredential);
    return {
      name: baseName(f, '.namedCredential-meta.xml'),
      label: str(x.label),
      type: str(x.namedCredentialType) || 'Legacy',
      host: host(url),
      externalCredential: ec,
      protocol: str(x.protocol),
      principalType: str(x.principalType),
      generateAuthorizationHeader: x.generateAuthorizationHeader == null ? null : bool(x.generateAuthorizationHeader),
    };
  }).sort(byName);

  const externalCredentials = files(roots, 'externalCredentials', '.externalCredential-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.externalCredential-meta.xml'), label: str(x.label), protocol: str(x.authenticationProtocol), principals: arr(x.externalCredentialParameters).filter((p) => /Principal/.test(str(p.parameterType) || '')).length };
  }).sort(byName);

  const remoteSites = files(roots, 'remoteSiteSettings', '.remoteSite-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.remoteSite-meta.xml'), host: host(str(x.url)), active: x.isActive == null ? true : bool(x.isActive), insecure: bool(x.disableProtocolSecurity) };
  }).sort(byName);

  const connectedApps = files(roots, 'connectedApps', '.connectedApp-meta.xml').map((f) => {
    const x = readXml(f);
    const oauth = x.oauthConfig || {};
    return {
      name: baseName(f, '.connectedApp-meta.xml'),
      label: str(x.label),
      oauth: !!x.oauthConfig,
      scopes: arr(oauth.scopes).map(String).sort(),
      saml: !!x.samlConfig,
      canvas: !!x.canvasConfig,
    };
  }).sort(byName);

  const authProviders = files(roots, 'authproviders', '.authprovider-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.authprovider-meta.xml'), label: str(x.friendlyName), type: str(x.providerType), registrationHandler: str(x.registrationHandler) };
  }).sort(byName);

  const cspTrustedSites = files(roots, 'cspTrustedSites', '.cspTrustedSite-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.cspTrustedSite-meta.xml'), host: host(str(x.endpointUrl)), context: str(x.context), active: x.isActive == null ? true : bool(x.isActive) };
  }).sort(byName);

  const corsOrigins = files(roots, 'corsWhitelistOrigins', '.corsWhitelistOrigin-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.corsWhitelistOrigin-meta.xml'), host: host(str(x.urlPattern)) || str(x.urlPattern) };
  }).sort(byName);

  const callCenters = files(roots, 'callCenters', '.callCenter-meta.xml').map((f) => {
    const x = readXml(f);
    return { name: baseName(f, '.callCenter-meta.xml'), label: str(x.displayName), adapterHost: host(str(x.adapterUrl)), type: str(x.contactCenterChannels) ? 'contact-center' : 'open-cti' };
  }).sort(byName);

  return {
    namedCredentials,
    externalCredentials,
    remoteSites,
    connectedApps,
    authProviders,
    cspTrustedSites,
    corsOrigins,
    callCenters,
    externalServices: files(roots, 'externalServiceRegistrations', '.externalServiceRegistration-meta.xml').map((f) => baseName(f, '.externalServiceRegistration-meta.xml')).sort(),
    externalDataSources: files(roots, 'dataSources', '.dataSource-meta.xml').map((f) => baseName(f, '.dataSource-meta.xml')).sort(),
  };
}
