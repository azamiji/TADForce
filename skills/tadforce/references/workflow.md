# Workflow — from an empty folder to a validated document

Run the commands from the root of the Salesforce DX project (the folder that holds, or will hold, `sfdx-project.json`). Prefer `--json` outputs when you need to decide something.

## 0. Workspace

```bash
npx tadforce status
```

- *No workspace*: run `npx tadforce init --yes --lang <en|fr> --client "<Client>" --short <CODE> --integrator "<Integrator>" --title "<Title>" [--org <alias>]` once you know the answers (step 2), or plain `npx tadforce init` in an interactive terminal.
- `init` creates `tadforce/` (config, `knowledge/`), installs the skills for the agents found in the project, and creates a minimal SFDX project when none exists.

## 1. Prerequisites

```bash
npx tadforce doctor --json
```

Each check has `level` (`ok`, `warn`, `error`), a `fix` and `human: true|false`.

| Check | When it fails |
|---|---|
| `node` | Human: install Node.js 20+ |
| `sf-cli` | You may run `npm install --global @salesforce/cli` after asking |
| `browser` | Human installs Chrome or Edge, or you run `npx @puppeteer/browsers install chrome-headless-shell@stable` and set `TADFORCE_CHROME` |
| `sfdx-project` | `tadforce init` creates it |
| `org` | Step 3 |

## 2. Startup questions

As soon as an org is authorized, `npx tadforce detect` proposes: language (org default language), client (org name), environment (sandbox or production), integrator (from the user's e-mail domain). Ask the human to confirm or correct **in one message** (`references/questions.md`, block A). Write the answers with `npx tadforce init --yes …` (it keeps existing settings) or edit `tadforce/tadforce.config.json`:

```json
{ "language": "fr", "client": { "name": "…", "short": "…", "logo": "knowledge/assets/client.svg" },
  "integrator": { "name": "…", "logo": "knowledge/assets/integrator.png" },
  "document": { "title": "…", "version": "1.0", "status": "Pour revue", "classification": "Confidentiel", "environment": "Production" },
  "brand": { "primary": "#0B2545", "accent2": "#9B1FE8", "gradient": ["#1E88FF", "#9B1FE8"] } }
```

Logos are optional (a badge with initials is generated). Paths are relative to `tadforce/`.

## 3. Org access

```bash
npx tadforce auth --alias <alias>            # production / developer edition
npx tadforce auth --alias <alias> --sandbox  # sandbox
```

This opens the browser: **the human logs in and clicks Allow**. Wait for the command to end. Already-authorized orgs are listed by `doctor`; pick one with `--org`.

## 4. Facts

```bash
npx tadforce prepare --org <alias>
```

Equivalent to:

1. `npx tadforce manifest --org <alias>` — curated manifest, every useful type with `*`, filtered on what the org supports; foldered types (reports, dashboards, e-mail templates, documents) and standard objects listed explicitly. `--mode full` builds the manifest from everything in the org.
2. `npx tadforce retrieve --org <alias>` — retrieves into `tadforce/.snapshot/source`, batch by batch (`force-app` is never touched). Types that fail are skipped and listed in `.snapshot/retrieve-report.json`. Large orgs: several minutes; tell the human.
3. `npx tadforce facts --org <alias>` — `facts/facts.json` (deterministic) and `facts/org.json` (aggregates: records per object, users per profile, scheduled jobs, coverage, packages, limits).
4. `npx tadforce scaffold` — chapter skeletons into `tadforce/src/tad` and `tadforce/src/axes` in the document language.

Offline (no org): `npx tadforce facts --source force-app` documents the local project.

## 5. Facts questions

Read `tadforce/facts/questions.json`:

- `systems[]` — endpoints without a system name → ask block B, write `knowledge/glossary.yml › systems`.
- `exclusions.groups[]` — candidates grouped by reason → ask block C, write `knowledge/exclusions.yml › exclude` (only what the human confirms).
- Ask block D (decommissioned features, terminology, inputs) → `exclusions.yml › features`, `glossary.yml › terms`, files in `knowledge/inputs/`.

Then rerun `npx tadforce facts --org <alias>`: exclusions are removed from every count and table.

## 6. Quality inputs (recommended)

- `platform-architecture-analyze` (Salesforce skill) — Well-Architected reading; use it for chapter 13 and the Improvement Axes.
- `dx-code-analyzer-run` — run Code Analyzer and save the JSON as `tadforce/knowledge/inputs/code-analyzer-results.json`; `tadforce facts` turns it into signals.
- Product skills when relevant (`omnistudio-dependencies-analyze`, `agentforce-architecture-analyze`, …): see `salesforce-skills.md`.

## 7. Write

```bash
npx tadforce next --json
```

Loop until `remaining` is 0. For each section: spec → facts → code → content. Write the TAD first (chapters 1 to 15), then the Improvement Axes (`--doc axes`). Do not edit the generated tables: change the facts or the knowledge files instead.

Efficient order: 6 Data → 7 Application → 8 UI → 9 Integrations → 10 Security → 11-13 → 5 Functional → 4 General → 1-3 (the summary is written last, from what you learned).

## 8. Build and validate

```bash
npx tadforce build --pdf --docx
```

Fix every error reported by the validation (pending sections, unknown placeholders, excluded components, forbidden terms, broken anchors, Mermaid errors, possible secrets). Review warnings: an unknown identifier is either a typo, a package component (fine, say so) or a hallucination (remove it).

## 9. Hand over

Tell the human, briefly: where the files are, the score, what is *to be confirmed*, and how to review (open the HTML → Comment / Capture → Save, then `/tadforce-review`).

## Failure handling

| Symptom | Action |
|---|---|
| `sf` asks to log in again | `npx tadforce auth --alias <alias>` (human) |
| Retrieve batch fails | It retries type by type; read `retrieve-report.json`; rerun later or with `--batch-size 5` |
| Mermaid error in a figure | Simplify the diagram (labels in quotes, no parentheses in node ids), rebuild |
| `unknown-component` warnings on package objects | Normal when the object belongs to a package: write it with its namespace |
| The human says a fact is wrong | Correct the knowledge file (exclusion, glossary) rather than the text, rerun facts, rebuild |
