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
| `write` | `groups[]`: sections of one chapter (or the whole Improvement Axes), each with `spec`, `model` slice, `files` | one writer per group, **in parallel** | the markdown files, markers replaced |
| `review` | `task`: the reviewer, with the dry-built HTML and the validation | one agent that wrote nothing | `understanding/review.json` |
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

## Without subagents (Codex, Gemini CLI, Cursor, Copilot…)

Same loop, one package after the other: do each task of the payload in order, writing its output file before the next, then call `build --json` again. Keep each package self-contained in your head: read its files, write its output, move on. For the review, re-read the documents as if someone else wrote them.

## Rules for every package

- **Writers never invent.** They write from the model slice of their group, the component cards (`understanding/model.json › componentCards`), the facts excerpt of each spec, the code when a detail is missing — and the specifications in `knowledge/inputs/specs/` for the vocabulary and the purpose.
- **What cannot be proven is not written.** No « to be confirmed », no empty section, no paragraph about a module the org does not have. The doubt is already a finding of the model; if it is new, append it to `tadforce/understanding/questions.md` (one line, with the section id).
- Use the figure directives the renderer draws from the model: `@@SEQ:<processId>@@`, `@@STATE:<lifecycleId>@@`, `@@ERD-DOMAIN:<domainId>@@` (`style-guide.md`).
- Only the files the package names are written. Two parallel writers never share a file: groups are per chapter file.
- Numbers are placeholders (`{{n:…}}`), names exist in the inventory, systems come from the glossary.

## After the render

`validation` holds the score and the first issues of each document. An error left (unknown reference, unknown identifier, Mermaid error) is fixed in the sources, then `npx tadforce build --render-only --json` renders again without asking for a new review. A larger rewrite goes through `npx tadforce build --json`: the sources changed, the loop asks for a new review.

## Hand-over

At `phase: "render"` the payload holds the output paths, the validation score of each document, and `report`: the open `questions` of the model and the review points left `remaining`. Give them to the human, briefly: where the documents are, the scores, what the metadata could not settle, how to review (`npx tadforce review`).
