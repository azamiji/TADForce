---
description: Generate the Technical Architecture Document (and the Improvement Axes) of the current Salesforce org, end to end
argument-hint: "[org alias] [fr|en]"
---

Use the `tadforce` skill to produce the Technical Architecture Document of this Salesforce project, end to end: `doctor` (tools, org connection, metadata, every question only a human can answer), then the build loop — understand the org (call graph, component cards, domains, end-to-end processes, lifecycles), write every section, independent review, render (HTML with editing and comments, PDF, DOCX) and validation, the Improvement Axes included.

Arguments (optional): $ARGUMENTS — an org alias and/or the document language.

Start with `npx tadforce doctor --json` and loop on it until `ok: true`, following `skills/tadforce/references/workflow.md`. Ask the framing questions in one batch, each with its recommended answer. Then loop on `npx tadforce build --json` without asking anything more: do the work packages of each phase — in parallel subagents when you can (`references/agents.md`) — and call it again until it returns `phase: "render"`. Hand over the paths, the scores and the open questions of its `report`.
