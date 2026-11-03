---
description: Apply the review comments saved in a TADForce HTML document and rebuild it with the comments resolved
argument-hint: "[path to the saved HTML]"
---

Use the `tadforce-review` skill. Comments file: $ARGUMENTS (default: `tadforce/out/TAD_<CODE>.html`, the single file the readers comment through `npx tadforce review`).

List the open comments with `npx tadforce review --json`, classify them, apply each correction to the sources and to the knowledge files, record the resolutions in `tadforce/tadforce.config.json`, rebuild with `npx tadforce build --render-only --pdf --docx` (or the full loop, `npx tadforce build --json`, when a comment changes a process or a system), and report one line per comment.
