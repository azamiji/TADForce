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

Main count keys: `apex.classes`, `apex.tests`, `apex.triggers`, `apex.batch`, `apex.queueable`, `apex.schedulable`, `apex.future`, `apex.rest`, `apex.withSharing`, `apex.withoutSharing`, `objects.custom`, `objects.standard`, `objects.platformEvents`, `fields.custom`, `fields.externalIds`, `recordTypes`, `validationRules.active`, `cmdt.types`, `cmdt.records`, `flows.active`, `flows.recordTriggered`, `flows.scheduled`, `omni.scriptsActive`, `omni.ipsActive`, `omni.dataMappers`, `ui.apps`, `ui.flexipages`, `ui.lwc`, `ui.aura`, `ui.vfPages`, `security.profiles`, `security.permissionSets`, `security.permissionSetGroups`, `security.roles`, `security.queues`, `security.sharingRules`, `integration.namedCredentials`, `integration.externalCredentials`, `integration.restResources`, `integration.connectedApps`, `integration.systems`, `misc.reports`, `misc.dashboards`, `misc.labels`.

## Directives (one per line)

- `@@ANNEX:<name>@@` — generated table. Names: `doc-control`, `version-history`, `legend`, `key-figures`, `products`, `naming`, `objects`, `standard-objects`, `external-ids`, `record-types`, `validation-rules`, `cmdt`, `platform-events`, `volumes`, `apex-summary`, `triggers`, `async`, `rest`, `flows`, `omni-scripts`, `integration-procedures`, `data-mappers`, `apps`, `flexipages`, `lwc`, `aura`, `visualforce`, `psg`, `permission-sets`, `profiles`, `roles`, `owd`, `sharing-rules`, `queues`, `named-credentials`, `external-credentials`, `connected-apps`, `auth-providers`, `allowed-domains`, `call-centers`, `systems`, `reports`, `labels`, `scheduled-jobs`, `packages`, `exclusions`, `inventory`, `traceability`, `glossary`, `signals`, `signals-trusted`, `signals-easy`, `signals-adaptable`, `exclusion-candidates`.
- `@@ERD:Obj1,Obj2|caption@@`, `@@FIGURE:context|layers|integrations|roles@@`, `@@KPIS@@`.
- `@@INCLUDE:knowledge/figures/x.svg@@` — include a file (SVG figures are framed). Follow it with `<p class="figcap">Figure — caption</p>` to number it.

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

## Pending markers

`<!-- tad:pending <id> -->` marks a section to write. Replace the whole line. `tadforce next` gives the next one; `tadforce validate` fails while active ones remain.
