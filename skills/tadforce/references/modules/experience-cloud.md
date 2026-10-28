# Experience Cloud (sites and portals)

**Detected by** `networks`, `experiences` / `digitalExperiences` bundles, `sites`, `navigationMenus`.

## Document

| Chapter | What |
|---|---|
| 3 Context | External populations (customers, partners, citizens, employees) and their channel |
| 8 UI | One `###` per site: audience, template (LWR or Aura), pages and custom components, navigation, branding, languages, mobile |
| 9 Integrations | Identity (self-registration, SSO, social login), embedded services (messaging), CMS content |
| 10 Security | Licences (Customer Community, Partner Community…), sharing sets and share groups, guest user access and its sharing rules, external OWD, CSP/CORS for the site, clickjack and session settings |

## Read

`networks/*.network-meta.xml` (self-registration, login, member profiles), `experiences` / `digitalExperiences` (routes, views, components used), `sites`, `sharingSets`, guest sharing rules (`sharingGuestRules`), profiles with community licences, `navigationMenus`, `cspTrustedSites`.

## Draw

Context view of the site (external users ↔ site ↔ org ↔ systems); sequence of self-registration or login.

## Watch out

Guest user access is a security topic: describe it factually in the TAD, put any overexposure in the Improvement Axes. External OWD differs from internal OWD.
