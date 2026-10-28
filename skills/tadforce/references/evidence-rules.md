# Evidence rules — no evidence, no sentence

## Levels of evidence

| Level | Source | Example | How to write it |
|---|---|---|---|
| **P1** | Metadata or code of the org | `LeadTrigger` calls `LeadTriggerHandler.run()` | State it as a fact |
| **P2** | Technical document provided by the project | Release procedure in `knowledge/inputs/` | State it as a fact; cite the reference (DR-nn) when it matters |
| **P3** | Functional document, ticket, interview | « Advisors handle 30 leads a day » | Attribute it: « according to the specifications (DR-01) » |
| **To confirm** | Deduction, missing or contradictory information | Retention policy not configured in the org | Write « to be confirmed » / « à confirmer » and list it in your hand-over |

## Kinds of statements

Keep them apart in your head and in the text:

- **Documented requirement** — written in a specification.
- **Technical observation** — visible in the metadata or the code.
- **Deduction** — logical but not proven: say so, or leave it out.
- **Unavailable information** — absent from the snapshot: say it is not visible, never fill the gap.
- **Recommendation** — goes to the Improvement Axes, not to the TAD.

## Non-equivalences

- A name that looks like a business term is not a proof of the link (`LegacyCoreId__c` does not mean the system is called « Legacy Core »).
- Absent from the snapshot ≠ absent from the org (a type may have failed to retrieve: check `.snapshot/retrieve-report.json`).
- Present in the snapshot ≠ used (inactive flows, components placed nowhere, objects with no record).
- A ticket status or a file date is not a proof of deployment.
- What a Salesforce product *can* do is not what this org *does*.

## Reading code for evidence

- Read the handler, not only the trigger; the service, not only the controller.
- Note thresholds and switches (`if (records.size() > 200) Database.executeBatch…`), named credentials (`callout:X`), custom metadata read (`X__mdt.getAll()`), platform events published (`EventBus.publish`).
- For flows: start element (object, trigger type), decisions, actions (Apex, subflows), record operations.
- For OmniStudio: OmniScript elements → Integration Procedure → Data Mapper / Remote Action / HTTP.
- Keep a short list of `file:line` for the sentences that matter; you need it when the human challenges a statement.

## When to ask

Ask when a sentence would otherwise rely on a guess about: the name of a system, the use of a component that looks dead, a decommissioned feature, an environment or a release step, a number not in facts. Batch the questions (`questions.md`).
