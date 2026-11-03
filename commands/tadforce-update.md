---
description: Bring an existing Technical Architecture Document up to date with what changed in the org since its last version
argument-hint: "[org alias]"
---

Use the `tadforce-update` skill. Run `npx tadforce update --json`, loop on `npx tadforce build --json` to understand again the code that changed, rewrite only the sections `update` listed, let the loop review and render, and report what changed in the document.
