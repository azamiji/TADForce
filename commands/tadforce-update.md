---
description: Bring an existing Technical Architecture Document up to date with what changed in the org since its last version
argument-hint: "[org alias]"
---

Use the `tadforce-update` skill. Run `npx tadforce update --json`, rewrite only the sections it lists from the new facts and the changed metadata, rebuild with `npx tadforce build --pdf --docx`, and report what changed in the document.
