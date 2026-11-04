# Understand — what the org does, before a line is written

A document with correct tables but no understanding is an inventory. Before writing, the build loop makes the agents *understand* the org: who uses it, its business domains, the end-to-end processes, the life of its records. The result is `tadforce/understanding/model.json`; every chapter is written from it.

`npx tadforce build --json` returns `phase: "understand"` until the model is complete and valid. It never asks a human: what the analysis cannot settle becomes a **finding** (kind `question`), reported at the end and in the Improvement Axes — never an empty or « to be completed » section.

## The inputs, built by the CLI

- `tadforce/facts/facts.json` — the inventory (component ids), counts, modules, systems. Excluded and out-of-scope components are already gone: **they never appear in the model**.
- `tadforce/facts/graph.json` — the call graph, deterministic. Nodes are components (`apex:Name`, `trigger:`, `flow:`, `lwc:`, `aura:`, `vf:`, `omniscript:`, `ip:`, `datamapper:`, `namedCredential:`, `object:`, `platformEvent:`, `cmdt:`, `queue:`, `flexipage:`, `tab:`, `quickAction:`, `messageChannel:`). Edges:

| Edge | Meaning |
|---|---|
| `triggers-on` | trigger or record-triggered flow → object (`events`) |
| `delegates` | trigger → handler class |
| `calls` | Apex → Apex (`methods`, `async`: `batch` / `queueable` / `future` / `schedule`), Flow → Apex invocable or subflow, LWC → Apex (`modes`: `wire` / `imperative`), LWC → child LWC, Aura/VF → controller, OmniScript → Integration Procedure / LWC, IP → Data Mapper / Apex remote action / named credential, Apex → named credential (`via: callout`) |
| `extends` | class → parent class or interface of the org |
| `reads` / `writes` | SOQL `FROM`, relationship paths (`Parent__r.Name` reads the parent object) and child subqueries (`FROM Children__r` reads the child), `via: soql-relationship`; custom metadata `getAll`; DML (`ops`: insert, update, upsert, delete, undelete, merge — on a typed variable, a variable assigned from a query, `new X`, or an inline `[SELECT …]`, `Database.*` too); flow record elements; a before-save flow assigning `$Record` fields writes its triggering record (`via: before-save`, no new save: it fires no trigger); Data Mapper objects |
| `publishes` / `subscribes` | platform events (`EventBus.publish`, event-triggered flows and triggers), Lightning message channels |
| `places` | Lightning page, tab or quick action → component |
| `serves` / `references` | queue → object; code or flow → queue named in it |

Flags on the nodes:

- `kinds` of an Apex class are corrected from the code: `auraEnabled` (a controller) only when a **method** carries `@AuraEnabled`; a class whose `@AuraEnabled` are only on properties (an inner wrapper) is `auraEnabledFields` — a data shape, not a controller.
- `invocableUncalled: true` — an invocable action that no flow of the snapshot calls (the `calls` edge is absent). It may still be used by an agent, a REST call or a component outside the snapshot: say so in the card, and raise a finding (kind `question`) when nothing calls it. The architect gets the list as `inputs.invocablesUncalled`.

Limits of the parser — read the code when they matter: dynamic dispatch (`Type.forName`, a class named in custom metadata), dynamic SOQL built piece by piece, field assignments on `Trigger.new` (not counted as writes), flow decisions and formulas. Objects used by the code but not retrieved are nodes with `retrieved: false`.

**Component ids in the model are the names of the inventory** (`LoanScoringService`, `customer360`), not the graph ids; `apex:LoanScoringService` is accepted and mapped.

## The three roles

Each task of the payload is a self-contained work package: run it as given (see `agents.md`). Each writes **one part file** — `output.file` — with the `task` and `fingerprint` fields of `output.format` copied as they are (they tell the CLI the part is up to date).

### Developer — one card per component

Task `dev-nn`: a slice of components (connected through calls, or around the same objects), with their files and the edges the parser saw.

1. Open each file. Read the trigger *and* its handler, the controller *and* the service, the flow XML *and* the Apex action it calls.
2. Write the card: describe the **behaviour**, not the file.

```json
{ "task": "dev-01", "fingerprint": "…", "cards": {
  "LoanApplicationTriggerHandler": {
    "role": "Scores each loan application before save and, when its status changes, publishes LoanStatusChange__e and archives the documents of decided applications.",
    "triggeredBy": "LoanApplicationTrigger (before insert, before update, after update)",
    "reads": ["LoanApplication__c"],
    "writes": ["LoanStatusChange__e"],
    "calls": ["LoanScoringService", "DocumentArchiveQueueable"],
    "notes": "Archiving is asynchronous (System.enqueueJob) and only for the statuses Approved and Rejected."
  } } }
```

- `role`: one sentence a business reader understands. Not « Apex class with a run method ».
- Thresholds, switches, statuses tested, batch sizes, retry counts: in `notes`, with the value read in the code.
- When the code contradicts an edge of the graph, trust the code and say it in `notes`.
- A component you cannot understand still gets a card: say what is visible, add a finding (kind `question`).
- Debt seen on the way (SOQL in loops, hard-coded ids, `without sharing` on a UI controller) → `findings` of the part, kind `debt` or `risk`, with the component as evidence.

### Functional analyst — actors, domains, lifecycles

Task `analyst`: objects (record types, relations, who uses them), status candidates (picklists named like a status, path assistants, their values), apps, queues, permission set groups, profiles, users per profile when org facts exist, active flows, confirmed systems, the functional specifications (`knowledge/inputs/specs/`), the glossary.

- **Actors** — populations that use the platform, from apps, persona permission set groups, profiles, queues, Experience sites, inbound integrations (`kind: system`). Name them with the client's words (glossary terms, specifications); `evidence` lists the components that prove them; `apps` the app API names they use.
- **Domains** — 5 to 10 business areas (« Lending », « Customer onboarding », « Service requests »), each with its objects, its main components, its actors and a one-sentence summary. Every object of the solution belongs to one domain; a domain without objects nor components does not exist.
- **Lifecycles** — one per status field that drives a process: states from the picklist values (labels as in the org), `initial`, `final`, and transitions **only** when a component, a validation rule, a path or a specification shows them (`evidence`). A picklist with values but no observed transition is a lifecycle with states and no transitions — not invented arrows.
- Ids are kebab-case (`lending`, `loan-status`).

### Architect — the end-to-end processes

Task `architect`, after the others: the part files of the developers and the analyst, `graph.json`, and `chains` — for each entry point (REST resource, trigger, record-triggered or scheduled flow, schedulable class, page, tab, quick action, OmniScript), the observed edges that follow it, through the writes that fire other triggers (`fires`) and the events that reach their subscribers (`delivers`).

- Assemble the **key processes** (4 to 12): what a business person would name (« Lead intake », « Loan decision », « Nightly customer synchronisation »). Each one: `domain`, `summary` (2–3 sentences), `trigger` (what starts it), `participants`, `steps`.
- Steps are **observed** edges only — from the chains, the cards, the graph. A step you cannot evidence is not drawn: write a finding instead.
- Participants: `actor` (an actor id), `component` (a component id, or a local id with `ref`), `object`, `external` (a system of `knowledge/glossary.yml › systems` — **never** a name inferred from a class, a field or a host). 4 to 9 participants, 6 to 15 steps.
- `async: true` across an asynchronous boundary (queueable, future, batch, platform event); `reply: true` for a response; `group` for an `alt` / `opt` / `loop` / `par` block, with its condition as `label`.
- `evidence` of each step: the component(s) whose code shows it.
- You may complete the domains (`domains` with the same id: components added to the analyst's).
- `findings`: debt, risks, and the questions the metadata cannot answer (who calls the inbound API, what the external system does with the data…).

```json
{ "task": "architect", "fingerprint": "…", "processes": [{
  "id": "loan-decision", "name": "Loan decision", "domain": "lending",
  "summary": "The advisor records the application; the platform scores it, then informs and archives once decided.",
  "trigger": "An advisor saves a loan application",
  "participants": [
    { "id": "advisor", "label": "Branch advisor", "kind": "actor" },
    { "id": "trg", "label": "LoanApplicationTrigger", "kind": "component", "ref": "LoanApplicationTrigger" },
    { "id": "LoanScoringService", "label": "Scoring service", "kind": "component" },
    { "id": "LoanStatusChange__e", "label": "Status change event", "kind": "object" }
  ],
  "steps": [
    { "from": "advisor", "to": "trg", "label": "save the application", "async": false, "reply": false, "group": null, "evidence": ["LoanApplicationTrigger"] },
    { "from": "trg", "to": "LoanScoringService", "label": "score before save", "async": false, "reply": false, "group": null, "evidence": ["LoanApplicationTriggerHandler"] },
    { "from": "trg", "to": "LoanStatusChange__e", "label": "publish the new status", "async": true, "reply": false, "group": { "kind": "opt", "label": "status changed" }, "evidence": ["LoanApplicationTriggerHandler"] }
  ] }], "findings": [] }
```

## Merge and validation

When every part is written, the next `build --json` merges them into `model.json` (or `npx tadforce build --merge-understanding`) and validates it. Unknown component, object, app, actor or system ids are **errors**: the model is not written and the payload returns `stage: "fix"` with one task per part file to correct. Warnings (a step without evidence, a component without card, a domain without objects) are kept in `understanding/validation.json`: fix them when they are real holes.

## The model (contract)

```text
{ version: 1, generatedAt,
  actors:     [{ id, name, kind: internal|external|system, apps: [appApiName], evidence: [componentId] }],
  domains:    [{ id, name, summary, objects: [objectApiName], components: [componentId], actors: [actorId] }],
  processes:  [{ id, name, domain, summary, trigger,
                 participants: [{ id, label, kind: actor|component|object|external, ref? }],
                 steps: [{ from, to, label, async, reply, group: { kind: alt|opt|loop|par, label } | null, evidence: [componentId] }] }],
  lifecycles: [{ id, object, field, states: [{ id, label }], initial, final: [stateId], transitions: [{ from, to, label, evidence }] }],
  componentCards: { <componentId>: { role, triggeredBy, reads, writes, calls, notes } },
  findings:   [{ id, kind: debt|risk|question, text, evidence }],
  factsFingerprint, parts, stats }      — written by the CLI
```

The renderer draws from it: `@@SEQ:<processId>@@` (sequence diagram, numbered steps), `@@STATE:<lifecycleId>@@` (state diagram), `@@ERD-DOMAIN:<domainId>@@` (ER diagram of a domain's objects).

**Findings never reach the TAD.** They feed the Improvement Axes (`debt`, `risk`) and the final report (`question`).

## Freshness

Each task has a fingerprint of its **input data**, never of TADForce's own code:

- developer slice — its components and the contents of their files;
- analyst — the facts it reads (objects, record types, relations, apps, queues, profiles, Permission Set Groups, users per profile, active flows, systems, namespaces), the metadata files its candidates come from (value sets, path assistants, object fields), the specifications and the glossary;
- architect — the fingerprints of the developer and analyst parts, and the confirmed systems.

What the CLI derives (graph edges, chains, lifecycle candidates, products) is not part of the fingerprint: upgrading TADForce does not redo the understanding. Only a bump of a task schema version (`TASK_SCHEMA`, when a part format changes) forces a redo. After `tadforce update`, only the slices whose code changed are redone; the architect is redone when any part changed. A part with an old fingerprint is `stale`: rewrite it from scratch, it may describe code that no longer exists.
