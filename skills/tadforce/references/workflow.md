# Workflow — from an empty folder to a validated document

Four commands: **doctor → build → review → update**. `doctor` asks every human question; `build` then runs to the end without asking. Run them from the root of the Salesforce DX project (the folder that holds, or will hold, `sfdx-project.json`). As an agent, always use `--json` and decide from the output.

## 1. `doctor` — everything before the writing

```bash
npx tadforce doctor --json
```

`doctor` is a loop: run it, act on its answer, run it again until `ok: true`. Each answer holds `checks[]` (each with `level`, `fix`, `human`), `questions[]` (each with a `recommended` answer) and `next`.

| `next` says | You do |
|---|---|
| install the missing tools | `sf-cli` missing: you may run `npm install --global @salesforce/cli` after asking. Node or a browser missing: human action (or `npx @puppeteer/browsers install chrome-headless-shell@stable` + `TADFORCE_CHROME`) |
| question `project` | Confirm with the human that this Salesforce project is the one to document → `--project yes`. Not in a project: `doctor` creates nothing; it proposes the projects found nearby → `--project <path>` (then always pass `--cwd <path>`), or `--project create` only if the human asks for a new project here |
| framing questions | Block A of `questions.md`, in this order: language, integrator (the company writing the document) and its logo, final client and its logo, author, specifications, scope. One message, the recommended answer for each, « accept all » allowed → `--confirm --lang … --integrator …|none --integrator-logo <file|url>|none --client "…" --logo <file|url> --author …|none [--specs …|--no-specs] [--scope …]` |
| question `org` | Show the org (alias, user, URL) and ask whether the TAD is about it → `--org <alias>`. Another org, or none connected: the human logs in (`sf org login web --alias <a> [--instance-url https://test.salesforce.com]`, it opens the browser), then ask again and pass `--org <a>`. No org at all: `--source local` |
| question `source` | org (retrieve everything, read-only, several minutes), local, or self (the human retrieves first). The answer **is the go**: ask before passing `--source org` — the retrieve starts right away. `self`: wait until the human says the retrieve is done, then `--source local` |
| question `branding` | Show the logo and colours found → `--branding keep`, or `--logo <file|url>` |
| systems / exclusions / features | Blocks B, C and D of `questions.md`, recommended answers shown → write `knowledge/*.yml`, then `--facts-reviewed` (it recomputes the facts with your answers) |
| question `launch-build` | Everything is green: ask « Launch the build now? » → `--build yes` (then run the build loop, section 2) or `--build no` (stop; the human runs `npx tadforce build` later) |

Run by a person in a terminal, a green `doctor` starts the AI agent found on the machine on `/tadforce` (`--agent claude|codex|gemini|cursor`, `--no-launch` to stop there). Run by you (`--json`, or inside an agent session), it never starts another agent: carry on with the build loop.

What `doctor` does by itself, read-only:

- creates the SFDX project and the `tadforce/` workspace if missing, installs the skills for the agents found;
- reuses the project's `target-org` (`sf config get target-org`) — no separate login step when the project already has one;
- metadata, as chosen (`source`): **org** (recommended — the org is the truth) retrieves every useful type with a `*` manifest into `tadforce/.snapshot` (`force-app` is never touched; a large org takes 10 to 20 minutes — tell the human before, and follow the progress printed on stderr); **local** reads the package directories; **both** combines them. Then `facts/facts.json`, `facts/org.json` (aggregates), `facts/questions.json`, the chapter skeletons in `tadforce/src/`;
- branding from evidence: the client logo searched in the snapshot (static resources, content assets, site assets named *logo*), the colours from the org's Lightning theme (`BrandingSet`), else from the logo. Never fetch a logo from the web without the human's go-ahead; when they agree, pass its URL with `--logo`.

### Other languages

English and French are built in. Any other language (`--lang es`, `de`, `it`, `pt`, `nl`, `ar`, `ja`…) works too: the skeletons are scaffolded in English and `tadforce/i18n/<lang>.json` is created from the English labels. Once, before writing:

1. Translate the headings **and the body text** of every `tadforce/src/*/*.md` file (chapter 2 and the axes method hold ready-made paragraphs). Keep the `{#anchors}`, the `{-}` markers, the `<!-- tad:… -->` lines and the `@@…@@` directives as they are — except the caption after `|` in a directive (`@@ERD:A,B|caption@@`), which you translate.
2. Translate every value of `tadforce/i18n/<lang>.json` (cover, tables, figures, buttons of the HTML). Keep the keys and the `{placeholders}`; set `meta.htmlLang`. Delete the `_translate` line.
3. Translate `document.title`, `status`, `classification` and `environment` in `tadforce/tadforce.config.json` (their defaults are English).
4. Write the sections in that language; Salesforce terms and metadata values stay as they are. Dates and numbers follow the language by themselves.

Batch it: one script or one file write per kind (headings map, labels file), not one edit per heading. `doctor` shows a reminder while the labels file or chapters with English headings remain. To ship the language for everyone, contribute it (issue template « New language »).

### Optional inputs

- **Functional specifications** (`--specs`): copied into `knowledge/inputs/specs/`. The functional analyst reads them during the understanding, the writers before chapters 3 and 5; they are evidence level P2/P3 (`evidence-rules.md`). They explain the *why*; the metadata still decides the *what*.
- **Scope** (`--scope`): name patterns of the components the project owns. Out-of-scope components disappear from facts, counts and tables; standard objects and org-wide components (profiles, roles, queues, reports) stay. Package directories: `--package-dirs force-app,core`.
- **Quality inputs** (recommended): `platform-architecture-analyze` (Salesforce skill) for chapter 13 and the Improvement Axes; `dx-code-analyzer-run` → `tadforce/knowledge/inputs/code-analyzer-results.json`. See `salesforce-skills.md`.

## 2. `build` — understand, write, review, render

```bash
npx tadforce build --json
```

One command, called in a loop: it looks at the workspace and returns the **next phase** with self-contained work packages. Do them (in parallel subagents when you can, see `agents.md`), then call it again, until `phase: "render"`. Nothing is asked to the human during the loop.

| `phase` | What happens | Reference |
|---|---|---|
| `understand` | The CLI builds the call graph (`facts/graph.json`). `stage: cards`: developer tasks (one card per component, by slices of connected components) and the functional-analyst task (actors, domains, lifecycles). `stage: processes`: the architect assembles the end-to-end processes. The parts in `understanding/parts/` are merged into `understanding/model.json` and validated; `stage: fix` lists what to correct (an unknown name is an error) | `understand.md` |
| `write` | Groups of sections to write in parallel, stage by stage: chapters 6–13 · 5 · 4, 14, 15 · 2, 3 · 1 · the Improvement Axes. Each group: its files, the spec of each section, the slice of the model it is written from, the figure directives available | `style-guide.md`, `writing-rules.md` |
| `review` | An independent reviewer reads the dry-built HTML and the sources against the model and the facts, fixes what it can prove, writes `understanding/review.json` | `agents.md` |
| `render` | HTML always, PDF and Word as configured (`outputs.pdf`, `outputs.docx`, or `--pdf --docx`), validation, and `report`: open questions and review points left | — |

The model is up to date as long as the code it was read from is: after `tadforce update`, only the slices whose files changed are read again. A change of the written sources asks for a new review.

Do not edit the generated tables: change the facts or the knowledge files instead. Fix every validation error (unknown placeholders, excluded components, forbidden terms, broken anchors, Mermaid errors, possible secrets), then `npx tadforce build --render-only --json`. Review warnings: an unknown identifier is either a typo, a package component (fine, say so) or a hallucination (remove it).

The HTML keeps **one name across versions** (`out/TAD_<CODE>.html`): comments saved in it are carried into every rebuild. PDF and DOCX carry the version (`TAD_<CODE>_v1.0.pdf`) — they are archives.

Hand over, briefly: where the files are, the scores, the questions the metadata could not settle (`report.questions`), the review points left, and how to review.

Run by a person in a terminal, `npx tadforce build` hands over to the installed agent while understanding, writing or review remain (`--agent <id>`, `--no-launch` to only print the phase and a preview). `--render-only` renders what is written, as in 0.4 (experts, CI). `--no-review` skips the review phase.

## 3. `review` — comments become fixes

The human runs `npx tadforce review`: the document opens from a local server and **Save writes into the same file** — no copies, no lost comments. (Opened by double-click, the page asks to pick the file: pick that same file.)

Then `/tadforce-review` (skill `tadforce-review`): `npx tadforce review --json` lists the open comments; each one becomes a fix in the sources and, when it is a rule, in the knowledge files.

## 4. `update` — months later

```bash
npx tadforce update --json
```

Archives the previous facts in `facts/history/<date>/`, reads the org again (fresh snapshot), compares content fingerprints, bumps the version (`1.0 → 1.1`) with a line in the history, and returns the sections to review with the reasons (`changes`, `counts`, `sections[]` with file and anchor). Rewrite only those sections (skill `tadforce-update`), then run the build loop (`npx tadforce build --json`): it reads again only the code that changed. Counts, tables, ERDs and appendices update by themselves.

## Advanced commands (CI, experts)

`npx tadforce help --all`: `init`, `auth`, `detect`, `manifest [--mode full]`, `retrieve [--batch-size 5]`, `facts [--source <dir>]`, `prepare`, `scaffold`, `next`, `spec`, `validate`, `comments`, `status`, `install-skills`.

## Failure handling

| Symptom | Action |
|---|---|
| `sf` asks to log in again | The human runs `npx tadforce doctor` (it opens the browser) |
| Retrieve batch fails | It retries type by type; read `.snapshot/retrieve-report.json`; rerun later or `npx tadforce retrieve --batch-size 5` |
| Mermaid error in a figure | Simplify the diagram (labels in quotes, no parentheses in node ids), rebuild |
| `unknown-component` warnings on package objects | Normal when the object belongs to a package: write it with its namespace |
| The human says a fact is wrong | Correct the knowledge file (exclusion, glossary) rather than the text, rerun facts, rebuild |
| Colours or logo wrong | Edit `tadforce.config.json › brand` / `client.logo`, or `doctor --json --logo <file>` |
