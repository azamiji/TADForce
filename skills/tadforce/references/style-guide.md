# Style guide — what a high-quality TAD reads like

A good Technical Architecture Document shows that someone **understood** the org: its domains, its processes, the way the components chain. Tables are the evidence; the narrative is the understanding. These patterns come from documents architects actually hand over. Examples are neutral: never mention a real client, integrator or project.

## Every chapter

- **Lead paragraph.** Two to four sentences under the chapter title: what the chapter covers for this org and the one idea to remember (« The application layer is organised in four layers; every object has one trigger that delegates to a handler, and the business rules live in services »).
- **« Component | Role » tables.** When several components serve one purpose, a table with the component in code font and its role in one line beats a paragraph. Roles come from the component cards of the model.
- **One `> [!INTEGRATOR]` callout per major mechanism**, not per chapter: the design choice, why it was made, what it brings (configurable without deployment, bulk-safe, secure by design). Never more than one per section.
- **Every statement evidenced**, every count a placeholder (`{{n:apex.classes}}`), every figure numbered with a caption.
- **No empty section.** A section whose subject the org does not have is not written at all (its `when:` condition removes it); a section the analysis cannot fully settle states what is proven, nothing more. Doubts go to the final report and the Improvement Axes.

## Executive summary (chapter 1)

- KPI tiles (`@@KPIS@@`) carry the numbers; the text carries none.
- **Achievements cards**: 4 to 6 `<div class="card">`, each a mechanism the integrator built, its key component, why it matters.
- Principles as a numbered list: **bold principle** + one sentence of evidence.

## Functional chapter (chapter 5)

- **One domain map**: the domains of the model with their actors and connected systems (flowchart), then a table « Domain | Objects | Main components | Section ».
- **One subsection per key process** of `model.processes`, in this order:
  1. one paragraph: who starts it, what the platform does, what comes out (the end-to-end chain in plain words: « the gateway creates a Lead → the record-triggered flow assigns it to a Queue → Omni-Channel routes it to an agent → the agent runs an OmniScript → an Integration Procedure sends the file to the onboarding system → the returned id is stored on the Lead → a REST service converts the Lead when the account is opened »);
  2. the figure: `@@SEQ:<processId>@@@@` for a multi-component flow (numbered steps), `@@STATE:<lifecycleId>@@@@` for a record lifecycle;
  3. a table « Step | Mechanism »: the step number of the figure, the component (code font) and what it does.
- A `> [!INTEGRATOR]` callout when the process holds a notable design choice.

## Data (chapter 6)

- Per domain: `@@ERD-DOMAIN:<domainId>@@@@`, then « Object | Role | Key fields ».
- **Volumetry table** « Object | Records | Growth driver » from the org facts (`{{n:…}}` or the generated volumes table), when org facts exist.
- Lifecycles with their state diagram when this chapter owns them (`figures.own`); a lifecycle owned by chapter 5 is linked with `{{ref:lc-<lifecycleId>}}`, never redrawn.

## Application (chapter 7)

- **Layered architecture with real class names per layer and counts**: « Layer | Convention | Examples | Count » (presentation, controllers, services, selectors, integration, async).
- **Triggers**: « Object | Trigger | Handler | Events », then an **order-of-execution table** for every object with several automations: « Order | Mechanism | Component | Effect » (before-save flows, before triggers, validation rules, after triggers, after-save flows, async).
- **Async and scheduled jobs**: « Job | Type | Started by | Schedule | Purpose » — the schedule from the brief (scheduled jobs of the org, scheduled flows), « can be scheduled » for a Schedulable class with no job.
- **Technical view only**: the processes are told in chapter 5; here, link to them (`{{ref:fn-<processId>}}`) and give what chapter 5 does not (transaction boundaries, handlers, thresholds, error handling).

## Integrations (chapter 9)

- **Flows table with ids**: « ID | Flow | Direction | System | Salesforce component | Pattern », ids `FLX-01`, `FLX-02`…; the pattern is one of **Request-Reply**, **Fire-and-Forget**, **Batch Data Synchronization**, **Remote Call-In**, **UI Update Based on Data Changes**, **Data Virtualization**.
- One subsection per system (glossary names only) with its main exchange: a link to the chapter 5 figure (`{{ref:fn-<processId>}}`) when the model has the process, a hand-drawn sequence only otherwise.

## Security (chapter 10)

- **Personas table** « Persona | Permission set group | Users | Main rights », users from the org aggregates (`org.psgAssignments`, `org.usersByProfile`) — never typed.
- Sharing model derived from the metadata: OWD, role hierarchy, sharing rules, queues, with what each opens and to whom.

## Decisions, NFR (chapters 13, 14)

- **Decisions table** « ID | Domain | Decision | Justification | Consequences », ids `DA-01`, `DA-02`…, only decisions visible in the metadata or provided by the client.
- **Well-Architected table** « Pillar | Practice | Evidence in the org » (Trusted, Easy, Adaptable) and **NFR table** « Requirement | Measures in place ».

## Figure directives drawn from the model

| Directive | Draws |
|---|---|
| `@@SEQ:<processId>@@` | sequence diagram of a process of `model.processes`: participants, numbered steps, async arrows, alt/opt/loop/par blocks |
| `@@STATE:<lifecycleId>@@` | state diagram of a lifecycle of `model.lifecycles` |
| `@@ERD-DOMAIN:<domainId>@@` | ER diagram of the objects of a domain of `model.domains` |

A caption may follow the id after `|`, as for `@@ERD:…|@@SEQ:<processId>@@`. The ids are those of `tadforce/understanding/model.json`. Other figures: `references/figure-rules.md`.

**Each figure is drawn once.** The CLI gives every figure of the model one owner section (`understanding/figures.json`; the write group's `figures.own`), by default:

| Figure | Owner | Anchor of its heading |
|---|---|---|
| `@@SEQ:<processId>@@` | chapter 5, `functional.processes` | `{#fn-<processId>}` |
| `@@STATE:<lifecycleId>@@` | chapter 5 when a process of the model covers its object's domain, else chapter 6 `data.domains` | `{#lc-<lifecycleId>}` |
| `@@ERD-DOMAIN:<domainId>@@` | chapter 6, `data.domains` | `{#data-<domainId>}` |

Every other section links with the `ref` of `figures.link` (« the decision chain is shown in {{ref:fn-loan-decision}} ») and adds only what is its own (the technical detail in chapter 7, the system side in chapter 9).

## Words

Present tense, as built. Short sentences. Business words first, then the component: « the platform scores the application (`LoanScoringService`) », not « `LoanScoringService` is an Apex class that… ». No marketing adjectives, no « to be confirmed », no « unfortunately ».
