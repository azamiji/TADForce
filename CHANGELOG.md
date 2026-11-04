# Changelog

## 0.6.0 — 2026-11-05

What the first full run on a real org taught: TADForce now knows what the org really has, tells the writers, and checks every sentence against it. 0.5 users: update — the understanding parts are redone once (new fingerprints), then stay stable across TADForce versions.

- **Reliable retrieve and org facts.** The retrieve no longer comes back empty: the Salesforce CLI writes nothing into a hidden folder, so each batch goes through a visible staging folder. Standard picklist value sets (lead status, opportunity stage, case status…) are retrieved by name. Org queries that failed on real orgs are fixed (uncountable objects, `MAX(CreatedDate)` refused, a bare `COUNT()` on User). New aggregates: users per permission set. The cover environment comes from the org (Developer Edition, Sandbox).
- **Strong evidence only.** A product is in use only with strong evidence (an active site, a channel the project built, objects it customised); weak evidence goes to `modules.weak` and to the Improvement Axes as points to confirm. Sections about features the org does not really use are no longer written.
- **Salesforce's own components set aside.** Developer Edition samples and defaults (sample role hierarchy, sample email templates, `ApexDevNet`, demo package, default rules and call centers, `sfdc_*` items, Enablement workspaces, Sites and Experience generated pages and controllers, unused console utility bars) are recognised and left out, with the reason.
- **Better facts for the writers.** Apex classes are sorted into layers (`{{n:apex.layers.services}}`…); a controller is a class with an `@AuraEnabled` method; personas fall back to permission sets; themes and more families join the inventory. The call graph follows relationship reads, child subqueries, deletes, before-save flow writes, and flags invocable actions no flow calls.
- **Ground truth for every writer.** Each write package carries a brief computed from the facts (`understanding/brief.md`): edition and environment, products in use and absent, what is 0, scheduled jobs and unscheduled schedulable classes, users, systems — and what must not be claimed. Packages also carry figure ownership (each process, lifecycle and domain model is drawn in one section only, linked elsewhere), the summary of the chapters already written, parts to save section by section and a resume hint after a usage limit. Open questions of the writers reach the Improvement Axes and the final report.
- **Claims check.** Every build checks the text against the org: features the org does not have, frequencies no scheduled job proves, an environment that contradicts the org, risk wording in the client TAD, control characters, untranslated headers, a figure drawn twice. Its results go to the independent reviewer and to the quality gate.
- **Typography and figures.** French typography is normalised at render time. Figures that would be unreadable are simplified before the gate decides: dense data models split into readable parts, sequences with many participants merge lanes and shorten labels, a second render checks the result. Sequence actors leave room for two-line names; Gantt charts use the page width; state diagrams never break on « : ».
- **Doctor** repeats the command you actually ran (`npx github:…`, a clone, a global install) in every hint, and the agent prompt uses it too.

## 0.5.0 — 2026-11-03

From an inventory to an architecture document: TADForce now understands the org before writing it. 0.4 users: update — `build` now runs the whole writing loop, sections about absent features disappear, and a document with gaps is marked DRAFT.

- `build` runs four phases on its own, without asking: **understand → write → review → render**. `doctor` still asks every human question first (language, integrator and its logo, client and its logo, org, retrieve, systems, exclusions) and ends with « Launch the build now? » (`--build yes|no`). A person running `build` in a terminal is handed over to the AI agent; `build --json` returns the work of the current phase; `--render-only` keeps the old behaviour for CI.
- **Understanding.** A call graph is computed from the metadata (`facts/graph.json`): triggers, handlers, services, flows and their Apex actions, LWC and their controllers, OmniScripts, Integration Procedures, Data Mappers, Named Credentials, batches, queueables, schedules, platform events, queues. Agents in parallel (developers reading the code, a functional analyst, an architect) produce `understanding/model.json`: actors, domains, end-to-end processes, lifecycles, one behaviour card per component, and the findings for the Improvement Axes. The model is validated: no unknown component, no unconfirmed system, no excluded component.
- **Parallel writing.** Sections are written by groups in parallel (data, application, UI, integrations, security… then functional, then general, then the summary), from the model, the cards, the facts and a new style guide. An independent reviewer agent then reads the whole document. Agents that cannot start sub-agents do the same work one task after the other.
- **Dynamic outline.** Sections carry a `when:` condition on the facts: a section about a feature absent from the org (OmniStudio, sites, Omni-Channel, telephony, Marketing Cloud…) is not scaffolded, not asked, not numbered. No empty section, no « to be completed ».
- **Reliable facts.** Each metadata folder records whether it was collected: a count that was not collected reads « not collected », never 0, and doctor warns about types a retrieve returned empty. Org aggregates: users per permission set group, role and profile; record volumes per project object. Fixed: Apex REST URL mappings, readable scheduled job types, Salesforce-internal jobs set aside.
- **Clean scope.** Unlocked packages without namespace (logging libraries, frameworks), LWCs generated by OmniStudio, DevOps tooling, demo and test components are detected and proposed for exclusion; the sharing table lists only the project objects and the standard objects it uses. The annexes keep what a reader needs; the full inventory goes to `out/<doc>_inventory.xlsx`.
- **Figures.** New directives: `@@ERD-DOMAIN:<domain>@@` (one data model per domain, key fields with UK/FK, readable layout), `@@SEQ:<process>@@` (numbered sequences with alt/opt/loop/par), `@@STATE:<lifecycle>@@`, `@@CONTEXT@@` (context view), `@@LAYERS@@`, `@@ROLES@@`, `@@LEGEND@@`; one colour legend in every figure (actors, Salesforce, external systems, data). `@@ERD@@` is capped at 8 objects.
- **Quality gate and visual QA.** Every figure is photographed (`out/figures/`) and checked for overlapping or too-small labels and render errors. The build blocks « For review » on pending or empty sections, filler text, sections about absent features, hard-typed counts, key chapters without figures, unreadable figures, unknown identifiers or an incomplete cover: the document is then marked DRAFT (watermark in HTML and PDF, banner in Word).
- Cover: the integrator logo next to the client logo; an empty author or integrator line is dropped instead of « — ».

## 0.4.1 — 2026-10-31

The fixes from three rounds of field tests by agents (new user, real org, shared org with specifications, Spanish, review and update, retrieve stress). 0.4.0 users: update — it fixes an empty inventory with `--source`, the default org never proposed, and retrieves that could hang.

- Field-tested by five agents (new user, real org, shared org with specifications, Spanish, review and update); fixed:
  - `doctor --source` no longer empties the facts; an empty inventory is an error, never « green ». `facts --source` with a missing folder fails loudly.
  - The default org is proposed again (`sf config get target-org` was refused by the read-only allow-list); an unknown or unreachable default org lists the orgs already connected; network hiccups (DNS) are retried and no longer reported as an expired session; the org status is checked once per run.
  - Answers on systems and exclusions recompute the facts (`--facts-reviewed`).
  - No integrator: chapter 2 no longer prints a raw placeholder; local sources are described as such (document control included); the version history shows « — » rather than the client as author.
  - Validation: « Método », « todo » are words, not TODO placeholders. The layers figure shows « Services », not « {n} Apex classes ».
  - `update`: the facts of each version are archived once in `facts/history/v<version>/`, never overwritten; no change → `upToDate`, no bump; sections still to write are not listed; each section says whether components or only counts moved; sections whose spec names no facts are matched by chapter.
  - A comment reopened by a reader stays open at the next build; highlights are found again after a rebuild.
  - Facts on real orgs: Salesforce-shipped apps, tabs, pages, permission sets and groups (`standard__`, `force__`…) are set aside; Shield needs Platform Encryption actually switched on; Agentforce is detected from users assigned to its permission set groups; standard objects are no longer flagged as test components; CSP trusted sites follow the scope and the exclusions; ERDs never show an out-of-scope object.
  - The writing agent gets the functional specifications in `next`/`spec` (chapters 1 to 5); `next` follows the recommended order (data and application first, summary last).
  - `build --pdf` builds the PDF only (Word on request); `status` counts the sections like `next` and `validate`; `facts --json` answers in JSON; doctor's instructions carry `--cwd`; retrieve progress goes to stderr in `--json` mode.
  - Other languages: body text, directive captions and the document title, status, classification and environment are part of the one-time translation; the reminder checks the headings too. Dates follow the document language.
- Second round of field tests; fixed: the machine-wide default org is proposed but never recommended, and one org shows once; the tests of an excluded class leave with it; the Improvement Axes say « internal » everywhere; `status --json` and `facts --json` answer in JSON only; chapter 2 explains what a scope covers and the `purpose.scope` spec receives it; an identifier out of the scope is reported as such; warnings a reader must act on (reopened comment, backup) are printed first; a highlight whose words were corrected becomes a pin on its section; an `update` rerun before the rewrite keeps its list of sections until the next build; the history line drops the zero counts; default figure captions and the reminder for other languages (English config defaults included) follow the document language.
- Real-org retest; fixed: a metadata type unknown to the local Salesforce CLI is dropped at once instead of blocking the retrieve (a type is given up after 10 minutes, a batch after 30; progress shows [i/N]); the orgs of the machine are listed without pinging each one, so they are always offered; doctor no longer queries the org again once the framing is confirmed, and recomputing the facts after the answers reuses the org aggregates (seconds, not minutes); the utility bars of Salesforce apps are set aside with them; Transaction Security policies are retrieved (Shield evidence); the metadata question names its real options.
- Leaner, safer retrieve: the manifest keeps the 105 types the document uses (translations, classic home pages, test suites, certificates and other unused types removed: faster, further from the 10,000 files / 39 MB limit of a retrieve). The types the document is built on (Apex, objects, flows, components, permissions, pages, apps, Custom Metadata, OmniStudio) are retrieved first, one by one, with 60 minutes each; one that does not finish in time (huge org) is listed and retrieved by chunks of 100 components — the same components as `*`, packages excepted (`--core-wait` shortens the first try); a core type that still fails stops the retrieve with a clear message. A missing package directory is created before retrieving; StandardValueSet (never retrieved with `*`) is no longer requested.
- `doctor` is faster from one call to the next: the Salesforce CLI version is kept a day and an org seen connected stays so for 10 minutes; a retrieve stops at once when the project itself is broken (missing package directory, invalid sfdx-project.json).

## 0.4.0 — 2026-10-30

- `doctor` follows the user step by step and never acts without a yes: it confirms the Salesforce project (outside a project it creates nothing and proposes the projects found nearby), proposes the default org instead of taking it (« no » opens the Salesforce login and asks again once connected), asks which metadata to use — retrieve everything read-only, local sources, or retrieved by the user — and waits for the go before a long retrieve.
- Six framing questions, each with a recommended answer, accepted all at once in one keystroke; the same for the branding (logo and colours) and for the systems and exclusions. The short code is derived from the client name (Northwind Bank → NB).
- Every answer is saved in the project: a later `doctor` resumes where it stopped.
- `doctor` ends on the writing: once everything is green, it says so and offers to start the AI agent found on the machine (Claude Code, Codex, Gemini CLI, Cursor) on `/tadforce`. `--agent <id>` picks one (remembered), `--no-launch` stops at the prerequisites. Never from CI, `--json` or inside an agent session.

## 0.3.0 — 2026-10-30

- Any document language: English and French built in; for any other language (`es`, `de`, `it`, `pt`, `ar`, `ja`…) the skeletons start in English and the agent translates the headings and `tadforce/i18n/<lang>.json` once. Numbers follow the language's format.
- Tagline: « AI-Powered Salesforce Technical Documentation ». README community section rewritten for the whole Salesforce ecosystem.
- One README, in English (README.fr.md removed).

## 0.2.0 — 2026-10-30

Four commands for the whole run: **doctor → build → review → update**. The fine-grained commands stay (`tadforce help --all`).

- `doctor` is now the whole setup, in one loop until everything is green: tools, SFDX project and workspace, org connection (reuses the project's `target-org`, opens the browser login only when needed), metadata from the org, the local sources or both, then the framing questions (each with a recommended answer) and the questions on systems and exclusions. Agents answer with flags and `--json`.
- New framing answers: **author** (optional — nothing shown when blank), **integrator** now optional (the document then names the client only), **functional specifications** (`--specs`, copied into `knowledge/inputs/specs/`), **scope** (`--scope "NWB_*"`, `--package-dirs`) to document one project in a shared org.
- Client branding from evidence: the logo is searched in the snapshot (static resources, content assets, site assets) or given as a file or URL; the colours come from the org's Lightning theme (`BrandingSet`), else from the logo, with WCAG contrast checked.
- `review`: opens the document from a local server; **Save writes into the same file**. The HTML keeps one name across versions (`TAD_<CODE>.html`) and the comments saved in it are carried into every rebuild; PDF and DOCX keep the version in their name.
- `update`: archives the previous facts, reads the org again, compares content fingerprints, lists the sections touched by what changed, bumps the version and writes the history line. New skill and command `tadforce-update`.
- `build` asks for PDF / Word in a terminal when no flag says, warns about sections still to write, and `--open` opens the result for review.
- The Improvement Axes (a separate file, built by default next to the TAD) carry the integrator's brand only: its logo on the cover, its name in the footer; the client's brand when there is no integrator.
- README: GIFs recorded from the demo (`tools/record-demo.js`), banner showing `npx tadforce doctor`, “every kind of Salesforce project” and “what leaves your machine” sections. Release workflow (npm with provenance) and issue templates.

## 0.1.0 — 2026-10-28

First public version.

- CLI: `init`, `doctor`, `auth`, `detect`, `manifest`, `retrieve`, `facts`, `prepare`, `scaffold`, `next`, `spec`, `build`, `validate`, `comments`, `status`, `install-skills`.
- Curated wildcard manifest (130 metadata types) filtered on the org, with foldered types and standard objects expanded.
- Deterministic facts: Apex, triggers, flows, OmniStudio, objects and relationships, Custom Metadata, UI and component placement, security, integrations, packages, products detection (clouds and industries), naming conventions, review signals, unused-component candidates.
- Aggregated org facts: record counts, users per profile and permission set group, scheduled jobs, coverage, packages, limits.
- Document model: 15 chapters + appendices, 84 section specifications, English and French.
- Build: HTML with in-place editing, comments and area captures, PDF, DOCX; Mermaid figures rendered locally; generated context view, layers, ERDs, role hierarchy, integration map, KPI tiles.
- Validation gate: pending sections, placeholders, unknown or excluded identifiers, glossary terms, decommissioned features, secrets, anchors, Mermaid errors.
- Agent Skills `tadforce` and `tadforce-review`, Claude Code plugin and marketplace, 15 product references.
