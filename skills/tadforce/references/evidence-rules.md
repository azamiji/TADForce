# Evidence rules — no evidence, no sentence

## Levels of evidence

| Level | Source | Example | How to write it |
|---|---|---|---|
| **P1** | Metadata or code of the org | `LeadTrigger` calls `LeadTriggerHandler.run()` | State it as a fact |
| **P2** | Technical document provided by the project | Release procedure in `knowledge/inputs/` | State it as a fact; cite the reference (DR-nn) when it matters |
| **P3** | Functional document, ticket, interview | « Advisors handle 30 leads a day » | Attribute it: « according to the specifications (DR-01) » |
| **Not proven** | Deduction, missing or contradictory information | Retention policy not configured in the org | **Not written in the TAD.** It becomes a finding of the model (kind `question`), reported at the end and in the Improvement Axes; the section states only what is proven |

## The org state wins

The ground-truth brief (`tadforce/understanding/brief.md`, `brief` of each write group) states what the org is and is not, from the metadata and the org facts. Code that *could* do something is not evidence that the org *does* it: a Schedulable class with no scheduled job does not run on a schedule; a Permission Set Group, a site or a Named Credential the brief lists as absent does not exist; a Developer Edition is not a production org. When the code and the brief disagree, the brief wins and the gap becomes a finding.

## Kinds of statements

Keep them apart in your head and in the text:

- **Documented requirement** — written in a specification.
- **Technical observation** — visible in the metadata or the code.
- **Deduction** — logical but not proven: leave it out of the TAD; record it as a finding.
- **Unavailable information** — absent from the snapshot: never fill the gap; a finding says what is missing.
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

Human questions are asked **before** the build, by `doctor`, in batches (`questions.md`): the name of a system, the use of a component that looks dead, a decommissioned feature, an environment or a release step. During the build loop nobody is asked: a sentence that would rely on a guess is not written, and the doubt becomes a finding (`understand.md`) that reaches the final report and the Improvement Axes.

## Evidence in the understanding model

- Every step of a process, every transition of a lifecycle carries `evidence`: the component(s) whose code or metadata shows it. No evidence, no step.
- A component card describes what the code does; when the parser's edges and the code disagree, the code wins (say it in `notes`).
- The model validator rejects any component, object, app, actor or system id that does not exist: a rejected name is a hallucination, not a typo to force through.
