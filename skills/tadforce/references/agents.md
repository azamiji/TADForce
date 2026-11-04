# Agents — running the build loop, in parallel when you can

`npx tadforce build --json` is the conductor. Each call looks at the workspace and returns the **next phase** with its work packages; you do them, then call it again. No human validation in between: `doctor` has asked every question before.

```text
build --json → understand (cards ∥ analyst) → understand (architect) → [fix] → write (stage 1 ∥ … ) → … → write (axes) → review → render
```

| `phase` | Payload | Who does it | Output |
|---|---|---|---|
| `understand`, `stage: cards` | `tasks[]`: `dev-nn` (developer), `analyst` | one agent per task, **in parallel** | `tasks[i].output.file` |
| `understand`, `stage: processes` | `tasks[0]`: `architect` | one agent | `parts/architect.json` |
| `understand`, `stage: fix` | `tasks[]`: errors per part file | one agent per file, in parallel | the part file, corrected |
| `write` | `groups[]`: sections of one chapter (or the whole Improvement Axes), each with `spec`, `model` slice, `files`, `brief`, `figures`, `context`, `parts`, `resume` (Axes: `inputs.questions`) | one writer per group, **in parallel** | the markdown files, markers replaced |
| `review` | `task`: the reviewer, with the dry-built HTML, the validation, `inputs.brief` and `inputs.claims` (automatic claims check) | one agent that wrote nothing | `understanding/review.json` |

### What a write group carries

| Field | What it is | What the writer does |
|---|---|---|
| `brief` | `{ facts, absent, doNotClaim }` — the **ground truth** of the org computed by the CLI (edition, environment, products used and absent, counts at 0, scheduled jobs and Schedulable classes not scheduled, users per profile and per Permission Set Group, standard objects used, glossary systems, open questions). Also `understanding/brief.md` | **Mandatory reading before writing.** A sentence that contradicts it is wrong, whatever the code or the specifications suggest |
| `figures` | `{ own: [{ directive, section, anchor, title }], link: [{ directive, title, owner, chapter, ref }] }` — figure ownership (`understanding/figures.json`) | Draw only the figures of `own`, each under a heading carrying its `{#anchor}`; for the others write the `ref` (`{{ref:fn-…}}`), never the directive |
| `context` | `[{ doc, chapter, headings, summary }]` — the chapters already written, with the first sentence of each section | Do not repeat nor contradict them: link with `{{ref:…}}` |
| `parts` | `[{ part, sections }]`; each section has its `part` | Write part 1, **save the file after each section**, then part 2… Parts of one group share a file: never in parallel |
| `resume` | `{ pending, written, hint }` | Write only `pending`; the `written` sections stay as they are |
| `render` | `outputs`, `validation`, `report` | the CLI | `out/*.html`, `.pdf`, `.docx` |

Write stages (each starts when the previous one is written): chapters 6 to 13 · chapter 5 · chapters 4, 14, 15 · chapters 2, 3 · chapter 1 (and any leftover of 0 and 99) · the Improvement Axes. The summary is written last, from everything else.

## With subagents (Claude Code and other agents that can spawn)

You are the **orchestrator**. You do not do the work packages yourself.

1. Run `npx tadforce build --json`.
2. For each task (or group) of the payload, start one subagent — in Claude Code the **Agent** tool, `subagent_type: "general-purpose"` — **all in the same message**, so that they run in parallel. Give each one:
   - its role in one line (« You are the developer of slice dev-03 of the TADForce understanding phase »);
   - the path of the skill references to read (`read` of the task: `references/understand.md`, `style-guide.md`…, under the installed `tadforce` skill folder);
   - **the task JSON, verbatim** — do not summarise it, do not drop fields (`fingerprint`, `output`); on a large org, give instead the path of its `taskFile` (`tadforce/understanding/tasks/<id>.json`, the same package written to disk) and ask the subagent to read it first;
   - the rules: read-only on the org and on `force-app`; write only the output file(s) of the task; never invent a name, a count or a system; doubts become findings.
3. When they are all done, check each output exists and parses (JSON) or has no marker left (markdown). Redo a failed one.
4. Call `npx tadforce build --json` again. Repeat until `phase: "render"`.

Large orgs give many developer slices: start them in batches (8 to 10 at a time) rather than all at once.

The reviewer must be a fresh subagent that wrote nothing: an independent reading is the point.

A group with several `parts` may be handed over part by part (one subagent for part 1, then one for part 2 once part 1 is saved) when packages are large: never two parts of a group at the same time.

### Usage limits and interruptions

- **Resume = resend the same task.** When a usage limit (or any interruption) stops subagents, wait, then call `npx tadforce build --json` again and send the tasks it returns: the outputs already written stay (part files with the current fingerprint, sections whose marker is gone); the payload lists only what is left (`resume.pending`).
- **One TADForce version for a whole run.** Do not upgrade TADForce in the middle of a build loop. Fingerprints depend on the input data only (files, facts), so an upgrade does not redo the understanding by itself, but a new version may write differently: finish the run, then upgrade.

## Without subagents (Codex, Gemini CLI, Cursor, Copilot…)

Same loop, one package after the other: do each task of the payload in order, writing its output file before the next, then call `build --json` again. Keep each package self-contained in your head: read its files, write its output, move on. For the review, re-read the documents as if someone else wrote them.

## Rules for every package

- **The brief first.** Every writer and the reviewer read the group's `brief` (`tadforce/understanding/brief.md`) before anything else: no schedule, product, site, Permission Set Group or « Production » the brief says the org does not have.
- **One figure, one place.** A process figure, a lifecycle or a domain ERD is drawn only by the section that owns it (`figures.own`); everywhere else, a `{{ref:…}}` link.
- **Writers never invent.** They write from the model slice of their group, the component cards (`understanding/model.json › componentCards`), the facts excerpt of each spec, the code when a detail is missing — and the specifications in `knowledge/inputs/specs/` for the vocabulary and the purpose.
- **What cannot be proven is not written.** No « to be confirmed », no empty section, no paragraph about a module the org does not have. The doubt is already a finding of the model; if it is new, append it to `tadforce/understanding/questions.md` as `- <section.id>: question` (one line). The CLI merges that file, deduplicated per section, into the Improvement Axes group (`inputs.questions`), the review task and the final `report.questions`.
- Use the figure directives the renderer draws from the model: `@@SEQ:<processId>@@`, `@@STATE:<lifecycleId>@@`, `@@ERD-DOMAIN:<domainId>@@` (`style-guide.md`).
- Only the files the package names are written. Two parallel writers never share a file: groups are per chapter file.
- Numbers are placeholders (`{{n:…}}`), names exist in the inventory, systems come from the glossary.

## After the render

`validation` holds the score and the first issues of each document. An error left (unknown reference, unknown identifier, Mermaid error) is fixed in the sources, then `npx tadforce build --render-only --json` renders again without asking for a new review. A larger rewrite goes through `npx tadforce build --json`: the sources changed, the loop asks for a new review.

## Hand-over

At `phase: "render"` the payload holds the output paths, the validation score of each document, and `report`: the open `questions` of the model and the review points left `remaining`. Give them to the human, briefly: where the documents are, the scores, what the metadata could not settle, how to review (`npx tadforce review`).
