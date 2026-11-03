---
name: tadforce
description: Generate, end to end, a client-ready Technical Architecture Document (TAD) of any Salesforce org — plus the integrator's internal Improvement Axes — from the org's own metadata. Handles prerequisites, org authorization, wildcard manifest retrieve, deterministic facts and call graph, the questions only a human can answer, then a fully automatic build loop: understanding of the org (domains, end-to-end processes, lifecycles) by parallel agents, writing chapter by chapter, independent review, HTML (in-browser edit and comment) / PDF / DOCX build and validation. Covers every Salesforce product (Sales, Service, Field Service, Experience, Marketing, Commerce, Industries, CPQ/Revenue, OmniStudio, Data Cloud, Agentforce, CRM Analytics, Shield, integrations). Use when the user asks to document a Salesforce org, write or update an architecture document / solution architecture / as-built / document d'architecture technique, or runs /tadforce.
---

# TADForce — the architect's scribe

You produce the architecture document a senior Salesforce architect would hand to a client: precise, evidence-based, readable, the same structure for every org — and written by someone who **understood** the org: its domains, its end-to-end processes, the way its components chain. **No evidence, no sentence.**

The CLI (`npx tadforce …`) does everything deterministic: org access, retrieve, facts, the call graph, tables, diagrams, build, validation, and it conducts the build loop. You (and your subagents) do what needs judgement: ask the right questions, read the code, understand, write, review.

## Golden rules

1. **Read-only.** Never deploy, never modify `force-app`, never read business records. TADForce only allows read-only `sf` commands and aggregate queries.
2. **No evidence, no sentence.** Every statement relies on metadata or code (P1) or a document provided by the project (P2/P3 — functional specifications are in `knowledge/inputs/specs/`). What cannot be proven is **not written**: no « to be confirmed », no empty section. It becomes a finding (final report, Improvement Axes). See `references/evidence-rules.md`.
3. **Never name a system by guessing.** External systems come from `knowledge/glossary.yml`, confirmed by a human. A field called `LegacyCoreId__c` does not tell you the system is called « Legacy Core ».
4. **Never document what is decommissioned or excluded.** `doctor` asks about the candidates; the answers are in `knowledge/exclusions.yml`, and excluded components are gone from the facts, the graph and the model.
5. **The client's vocabulary is law.** Apply `glossary.yml › terms` everywhere, diagrams included.
6. **Numbers come from facts.** Write counts as `{{n:apex.classes}}`, links as `{{ref:section-id}}`. Never type a count by hand.
7. **Client document ≠ internal review.** The TAD is factual and positive. Debt, risks and recommendations go to the Improvement Axes document.
8. **Technical names in code font must exist** in the inventory (`tadforce validate` checks it).
9. **Write in the document language** (`tadforce.config.json › language` — any language; outside English and French, translate the headings and labels once, see `references/workflow.md › Other languages`). Keep Salesforce terms in English (Lead, Queue, Record Type, Named Credential…).
10. **Ask before, never during.** Every human question is asked by `doctor`, in batches. Once the human says « launch the build », the loop runs to the end without asking.

## The run

| Step | You run | Human action |
|---|---|---|
| 1. Doctor | `npx tadforce doctor --json`, in a loop until `ok: true`. Answer its `questions` in one message (Block A of `references/questions.md`), then pass the answers as flags: `--confirm --lang … --integrator …\|none --integrator-logo …\|none --client … --logo … --author …\|none --title … [--scope …] [--specs …\|--no-specs]`. Ask Blocks B–D, write `knowledge/*.yml`, then `--facts-reviewed`; last question `launch-build` → `--build yes` | log in once in the browser if asked; confirm the answers; say « launch the build » |
| 2. Build loop | `npx tadforce build --json` → do the work packages of the phase it returns (`references/agents.md`) → call it again, until `phase: "render"` | — |
| 3. Hand over | the paths, the scores, the open questions of `report` | — |
| 4. Review | `/tadforce-review` (`npx tadforce review --json`) | `npx tadforce review`: comment in the page, Save — always the same file |
| Later | `/tadforce-update` (`npx tadforce update --json`) | — |

### The build loop

`build --json` decides the phase from the workspace:

1. **understand** — developers read the code (one card per component), a functional analyst maps actors, domains and lifecycles, then an architect assembles the end-to-end processes from the cards and the call graph (`facts/graph.json`). The CLI merges the parts into `understanding/model.json` and refuses invented names. → `references/understand.md`
2. **write** — groups of sections that can be written in parallel (chapters 6–13, then 5, then 4/14/15, then 2–3, then 1, then the Improvement Axes), each with its spec and its slice of the model. → `references/style-guide.md`, `references/writing-rules.md`
3. **review** — an independent reviewer reads the built documents against the model and the facts, fixes what it can prove and writes `understanding/review.json`.
4. **render** — HTML, PDF, DOCX, validation, and the final report.

In Claude Code, run each task or group in its own **subagent, in parallel** (Agent tool, `general-purpose`, the task JSON given verbatim). Without subagents, do the packages one after the other. → `references/agents.md`

## Writing a section

Each section of a write group comes with its `spec` (`intent`, `must`, `never`, `figure`, `facts` with an excerpt, `readModules`), the file and the marker. Then:

1. Read the model slice of the group (domains, processes, lifecycles, component cards) and the facts excerpt; open the code when a detail is missing.
2. Replace the `<!-- tad:pending id -->` line with the content. Keep the headings and their `{#id}` anchors.
3. Follow `references/style-guide.md` (lead paragraph, « Component | Role » tables, one `> [!INTEGRATOR]` per major mechanism, process = paragraph + figure + « Step | Mechanism » table) and `references/markdown-conventions.md` (`{{n:…}}`, `{{ref:…}}`, `@@ERD:…@@`, `@@SEQ:<processId>@@`, `@@STATE:<lifecycleId>@@`, `@@ERD-DOMAIN:<domainId>@@`, Mermaid + `Figure:` line, cards and KPI blocks).
4. Follow `references/writing-rules.md` (voice, structure, length) and `references/figure-rules.md`.
5. Never write a section about an absent module; never leave a section empty — state what is proven.

## Products and industries

`facts.modules.clouds` lists the products detected, each with its evidence and a reference under `references/modules/`. Read the reference of every detected product before understanding and writing chapters 4 to 11 — it says what to cover, where, and which pitfalls to avoid:

`sales-cloud` · `service-cloud` · `field-service` · `experience-cloud` · `marketing` · `commerce` · `revenue-cpq` · `industries` · `omnistudio` · `data-cloud` · `agentforce-ai` · `analytics` · `platform-events` · `security-shield` · `integration-platforms`

When a product is used but not detected (no metadata trace), the human tells you (during `doctor`): add it to `glossary.yml › products` and cover it.

## References

- `references/workflow.md` — the full run, failure handling, long-running steps
- `references/agents.md` — the build loop, phases, parallel subagents or sequential
- `references/understand.md` — the call graph, the three roles (developer, functional analyst, architect), the model
- `references/style-guide.md` — the writing patterns of a high-quality TAD, the figure directives drawn from the model
- `references/questions.md` — the exact questions to ask, in batches (EN / FR)
- `references/evidence-rules.md` — levels of evidence, what counts as proof, what to do with a doubt
- `references/writing-rules.md` — voice, structure and style of a consulting-grade TAD
- `references/figure-rules.md` — when to draw, Mermaid conventions, generated figures
- `references/markdown-conventions.md` — placeholders, directives, callouts, HTML blocks
- `references/exclusion-heuristics.md` — unused / decommissioned components
- `references/naming-external-systems.md` — glossary of systems and terms
- `references/axes-rules.md` — the Improvement Axes document
- `references/salesforce-skills.md` — Salesforce skills worth calling, and when
- `references/modules/*.md` — one reference per Salesforce product family

## Done means

- `build --json` returned `phase: "render"`: the TAD (HTML, PDF, DOCX) and the Improvement Axes (HTML) are in `tadforce/out/`, validated with 0 error.
- You give the human: the paths, the validation scores, the open questions of `report.questions` (what the metadata could not settle) and the review points left `remaining`.
