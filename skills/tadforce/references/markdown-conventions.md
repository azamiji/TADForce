# Markdown conventions of TADForce sources

The sources live in `tadforce/src/tad/*.md` and `tadforce/src/axes/*.md`, concatenated in file-name order.

## Headings

- `#` chapter, `##` section, `###` subsection — numbered automatically (1, 1.2, 1.2.3).
- `{-}` at the end: not numbered. `{#my-id}`: explicit anchor. Both: `{- #my-id}`.
- In appendices, `{{letter}}` in a `##` title becomes A, B, C… and `{{sub}}` in a `###` becomes A.1, A.2… so optional appendices never leave gaps.
- Keep the anchors of the skeleton: KPI tiles, references and validation rely on them.

## Placeholders (resolved at build)

| Placeholder | Result |
|---|---|
| `{{n:apex.classes}}` | Formatted number from `facts.counts` (then from the facts root) |
| `{{v:modules.products}}` | Raw value from facts |
| `{{cfg:client.name}}` | Value from `tadforce.config.json` |
| `{{ref:data-overview}}` | Link « § 6.2 » to the section |
| `{{title:ch-data}}` | Link « 6 Data architecture » |

A count the facts could not collect (`facts.coverageByCount["<path>"] === "missing"`, e.g. org-only figures in a local build) prints « not collected » (« non collecté ») in a muted style — never 0 — and validation warns `count-not-collected`; KPI tiles and layer chips with a missing count are left out. Never type a count by hand: a number that equals a known count next to its word (« 13 Apex classes ») is a validation **error** (`hardcoded-count`).

Main count keys: `apex.classes`, `apex.tests`, `apex.triggers`, `apex.batch`, `apex.queueable`, `apex.schedulable`, `apex.future`, `apex.rest`, `apex.withSharing`, `apex.withoutSharing`, `objects.custom`, `objects.standard`, `objects.platformEvents`, `fields.custom`, `fields.externalIds`, `recordTypes`, `validationRules.active`, `cmdt.types`, `cmdt.records`, `flows.active`, `flows.recordTriggered`, `flows.scheduled`, `omni.scriptsActive`, `omni.ipsActive`, `omni.dataMappers`, `ui.apps`, `ui.flexipages`, `ui.lwc`, `ui.aura`, `ui.vfPages`, `security.profiles`, `security.permissionSets`, `security.permissionSetGroups`, `security.roles`, `security.queues`, `security.sharingRules`, `integration.namedCredentials`, `integration.externalCredentials`, `integration.restResources`, `integration.connectedApps`, `integration.systems`, `misc.reports`, `misc.dashboards`, `misc.labels`.

## Directives (one per line)

- `@@ANNEX:<name>@@` — generated table. Names: `doc-control`, `version-history`, `legend`, `key-figures`, `products`, `naming`, `objects`, `standard-objects`, `external-ids`, `record-types`, `validation-rules`, `cmdt`, `platform-events`, `volumes`, `apex-summary`, `triggers`, `async`, `rest`, `flows`, `omni-scripts`, `integration-procedures`, `data-mappers`, `apps`, `flexipages`, `lwc`, `aura`, `visualforce`, `psg`, `permission-sets`, `profiles`, `roles`, `owd`, `sharing-rules`, `queues`, `named-credentials`, `external-credentials`, `connected-apps`, `auth-providers`, `allowed-domains`, `call-centers`, `systems`, `reports`, `labels`, `scheduled-jobs`, `packages`, `exclusions`, `inventory`, `traceability`, `glossary`, `signals`, `signals-trusted`, `signals-easy`, `signals-adaptable`, `exclusion-candidates`.
- Figures (details in figure-rules.md): `@@CONTEXT@@`, `@@LAYERS@@`, `@@ROLES@@`, `@@LEGEND@@`, `@@ERD-DOMAIN:<domainId>[|caption]@@`, `@@ERD:Obj1,Obj2[|caption]@@` (8 objects at most; `auto`), `@@SEQ:<processId>[|caption]@@`, `@@STATE:<lifecycleId>[|caption]@@`, `@@FIGURE:integrations|caption@@`. Aliases kept: `@@FIGURE:context|layers|roles@@`. ERD-DOMAIN, SEQ and STATE read `tadforce/understanding/model.json`; an unknown id is an error.
- `@@KPIS@@` — KPI tiles (big number + label, each one a link to its appendix).
- `@@INCLUDE:knowledge/figures/x.svg@@` — include a file (SVG figures are framed). Follow it with `<p class="figcap">Figure — caption</p>` to number it.

Conditions of `<!-- tad:if … -->` can name any facts path, hyphens included: `<!-- tad:if facts.annexes.named-credentials.count -->`.

## Conditional blocks

```
<!-- tad:if modules.omnistudio -->
…only when OmniStudio is detected…
<!-- tad:else -->
…otherwise…
<!-- tad:endif -->
```

Conditions are facts paths (`modules.*`, `counts.*`, `org.*`, `facts.*`), `!` negates, `a|b` means either.

## Callouts

```
> [!INTEGRATOR]
> The scoring rules are Custom Metadata records: a new rule needs no deployment.
```

Kinds: `INTEGRATOR` (the integrator's contribution), `NOTE`, `RECO` (rare in the TAD), `WARN`.

## HTML blocks

Cards (achievements):

```html
<div class="cards">
<div class="card"><h4>Title</h4><p>Two to four sentences with `code` replaced by <code>code</code>.</p></div>
</div>
```

Markdown is not processed inside HTML blocks: use `<code>`, `<b>`, `<a href="#id">`.

Priority badges (Improvement Axes): `<span class="b p1">P1</span>`, `p2`, `p3`.

KPI tiles come from `@@KPIS@@` only (never hand-made). Cards are for the summary's achievements; the `[!INTEGRATOR]` callout is for what the integrator designed (one or two per chapter at most).

## Pending markers

`<!-- tad:pending <id> -->` marks a section to write. Replace the whole line. `tadforce next` gives the next one; `tadforce validate` fails while active ones remain.

## Quality gate (`tadforce validate`, and every build)

Errors — while one remains the document is a **DRAFT** (watermark on every page, draft status on the cover):

| Code | Meaning |
|---|---|
| `pending` | a section is still a pending marker |
| `empty-section` | a heading followed by nothing but a heading of the same or a higher level |
| `todo`, `filler` | TODO / TBD / lorem, or filler in any language: « to be completed », « à compléter », « por completar », « zu ergänzen »… (« to be confirmed » with the business is an open question, allowed) |
| `section-out-of-scope` | a section whose spec has `when:` that is false for this org (its module is absent): remove it |
| `unknown-component` | an identifier in code font that is not in the metadata |
| `hardcoded-count` | a number typed by hand that equals a known count: use `{{n:…}}` |
| `chapter-without-figure` | functional, data, application, integrations or security chapter without a figure |
| `figure-unreadable` | overlapping labels, text too small on A4, Mermaid error (see figure-rules.md, the QA loop) |
| `cover-client`, `cover-title`, `cover-empty-field` | no client name, a code as title (`NWB_CRM`), a « — » on the cover |
| `unknown-model-id` | a figure directive names an id absent from understanding/model.json |

Plus the earlier checks (terminology, excluded components, secrets, broken anchors, unknown placeholders). Warnings lower the score but do not make a draft. An empty author or integrator is never printed as « — »: the line is left out.
