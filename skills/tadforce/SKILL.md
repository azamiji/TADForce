---
name: tadforce
description: Generate, end to end, a client-ready Technical Architecture Document (TAD) of any Salesforce org — plus the integrator's internal Improvement Axes — from the org's own metadata. Handles prerequisites, org authorization, wildcard manifest retrieve, deterministic facts, the questions only a human can answer, writing chapter by chapter, HTML (in-browser edit and comment) / PDF / DOCX build and validation. Covers every Salesforce product (Sales, Service, Field Service, Experience, Marketing, Commerce, Industries, CPQ/Revenue, OmniStudio, Data Cloud, Agentforce, CRM Analytics, Shield, integrations). Use when the user asks to document a Salesforce org, write or update an architecture document / solution architecture / as-built / document d'architecture technique, or runs /tadforce.
---

# TADForce — the architect's scribe

You produce the architecture document a senior Salesforce architect would hand to a client: precise, evidence-based, readable, the same structure for every org. **No evidence, no sentence.**

The CLI (`npx tadforce …`) does everything deterministic: org access, retrieve, facts, tables, diagrams from metadata, build, validation. You do what needs judgement: ask the right questions, read the code, write the narrative, keep the client's vocabulary.

## Golden rules

1. **Read-only.** Never deploy, never modify `force-app`, never read business records. TADForce only allows read-only `sf` commands and aggregate queries.
2. **No evidence, no sentence.** Every statement relies on metadata (P1), a document provided by the project (P2/P3), or is written as *to be confirmed*. See `references/evidence-rules.md`.
3. **Never name a system by guessing.** External systems come from `knowledge/glossary.yml`, confirmed by a human. A field called `LegacyCoreId__c` does not tell you the system is called « Legacy Core ».
4. **Never document what is decommissioned or excluded.** Ask about the candidates in `facts/questions.json`; record the answers in `knowledge/exclusions.yml`.
5. **The client's vocabulary is law.** Apply `glossary.yml › terms` everywhere, diagrams included.
6. **Numbers come from facts.** Write counts as `{{n:apex.classes}}`, links as `{{ref:section-id}}`. Never type a count by hand.
7. **Client document ≠ internal review.** The TAD is factual and positive. Debt, risks and recommendations go to the Improvement Axes document.
8. **Technical names in code font must exist** in the inventory (`tadforce validate` checks it).
9. **Write in the document language** (`tadforce.config.json › language`). Keep Salesforce terms in English (Lead, Queue, Record Type, Named Credential…).
10. **Ask in batches.** Group your questions; never ask what the facts already answer.

## The run

Follow `references/workflow.md` step by step. In short:

| Step | You run | Human action |
|---|---|---|
| 0. Workspace | `npx tadforce status` (or `npx tadforce init --yes …` if none) | — |
| 1. Prerequisites | `npx tadforce doctor --json`; fix what you can | install Node / sf CLI / a browser if missing |
| 2. Startup questions | `npx tadforce detect` (once an org is authorized) → propose answers | confirm language, client, integrator, environment, title, logos |
| 3. Org access | `npx tadforce auth --alias <a> [--sandbox]` | log in in the browser and click **Allow** |
| 4. Facts | `npx tadforce prepare --org <a>` (manifest `*` → retrieve → facts → scaffold) | — |
| 5. Facts questions | read `tadforce/facts/questions.json`, ask, write `knowledge/*.yml`, rerun `npx tadforce facts --org <a>` | name the systems, confirm exclusions and decommissioned features, provide inputs |
| 6. Quality inputs (optional) | Salesforce skills `platform-architecture-analyze`, `dx-code-analyzer-run` (JSON into `knowledge/inputs/`) | — |
| 7. Write | loop: `npx tadforce next --json` → read the spec, the facts, the code → replace the marker | — |
| 8. Build | `npx tadforce build --pdf --docx` until `validate` shows 0 errors | — |
| 9. Hand over | give the paths of the HTML/PDF/DOCX, the score, the points to review | review, comment in the HTML, save |
| 10. Review loop | `/tadforce-review` | — |

## Writing a section

`npx tadforce next --json` returns the file, the marker, and the spec: `intent`, `must`, `never`, `facts` (with an excerpt), and `readModules` (product references to read). Then:

1. Read the facts excerpt; open the metadata or code files it points to (`tadforce/.snapshot/source/...` or `force-app/...`) when you need behaviour, not only names.
2. Replace the `<!-- tad:pending id -->` line with the content. Keep the headings and their `{#id}` anchors.
3. Use the conventions of `references/markdown-conventions.md`: `{{n:…}}`, `{{ref:…}}`, `@@ERD:…@@`, Mermaid + `Figure:` line, `> [!INTEGRATOR]`, cards and KPI blocks.
4. Follow `references/writing-rules.md` (voice, structure, length) and `references/figure-rules.md`.
5. Every few sections, run `npx tadforce validate` to catch unknown identifiers or forbidden terms early.

## Products and industries

`facts.modules.clouds` lists the products detected, each with its evidence and a reference under `references/modules/`. Read the reference of every detected product before writing chapters 4 to 11 — it says what to cover, where, and which pitfalls to avoid:

`sales-cloud` · `service-cloud` · `field-service` · `experience-cloud` · `marketing` · `commerce` · `revenue-cpq` · `industries` · `omnistudio` · `data-cloud` · `agentforce-ai` · `analytics` · `platform-events` · `security-shield` · `integration-platforms`

When a product is used but not detected (no metadata trace), the human tells you: add it to `glossary.yml › products` and cover it.

## References

- `references/workflow.md` — the full run, failure handling, long-running steps
- `references/questions.md` — the exact questions to ask, in batches (EN / FR)
- `references/evidence-rules.md` — levels of evidence, what counts as proof, when to ask
- `references/writing-rules.md` — voice, structure and style of a consulting-grade TAD
- `references/figure-rules.md` — when to draw, Mermaid conventions, generated figures
- `references/markdown-conventions.md` — placeholders, directives, callouts, HTML blocks
- `references/exclusion-heuristics.md` — unused / decommissioned components
- `references/naming-external-systems.md` — glossary of systems and terms
- `references/axes-rules.md` — the Improvement Axes document
- `references/salesforce-skills.md` — Salesforce skills worth calling, and when
- `references/modules/*.md` — one reference per Salesforce product family

## Done means

- `npx tadforce validate` → 0 error, warnings reviewed (each unknown identifier explained or fixed).
- `tadforce/out/` holds the TAD (HTML, PDF, DOCX) and the Improvement Axes (HTML).
- You give the human: the paths, the validation score, the sections you marked *to be confirmed*, and the questions still open.
