---
description: Generate the Technical Architecture Document (and the Improvement Axes) of the current Salesforce org, end to end
argument-hint: "[org alias] [fr|en]"
---

Use the `tadforce` skill to produce the Technical Architecture Document of this Salesforce project, end to end: `doctor` (tools, org connection, metadata, the questions only a human can answer), writing every section, `build` (HTML with editing and comments, PDF, DOCX) and validation, then the Improvement Axes document.

Arguments (optional): $ARGUMENTS — an org alias and/or the document language.

Start with `npx tadforce doctor --json` and loop on it until `ok: true`, following `skills/tadforce/references/workflow.md`. Ask the framing questions in one batch, each with its recommended answer. Stop only when `npx tadforce validate` reports 0 errors, then hand over the paths, the score and the points to confirm.
