---
name: tadforce-update
description: Bring an existing TADForce Technical Architecture Document up to date after the org evolved (new or changed Apex, flows, objects, integrations, permissions, products) — reads the org again, compares with the facts the previous version was written from, rewrites only the impacted sections, bumps the version. Use when the user says the document is outdated, asks to refresh or update the TAD, mentions a new release or several months of changes, or runs /tadforce-update.
---

# TADForce update — the document follows the org

The document already exists. Do not rewrite it: find what changed, and rewrite only what it touches. The rules of the `tadforce` skill still apply (no evidence, no sentence; numbers from facts; the client's vocabulary is law).

## 1. Compare

```bash
npx tadforce update --json
```

It archives the previous facts (`tadforce/facts/history/<date>/`), retrieves a fresh snapshot (`source.mode`), recomputes the facts, compares content fingerprints and returns:

- `changes.added | changed | removed` — components, by metadata folder (`classes:InvoiceService`, `flows:Case_Routing`…);
- `counts` — every count that moved (`apex.classes: [132, 140]`);
- `sections[]` — the sections to review: `id`, `file`, `anchor` (the heading `{#id}` the section sits under) and the `reasons`;
- `from` → `to` — the version bump, already written to the document history.

Nothing changed: say so and stop.

## 2. Ask, once

New external endpoints and new unused-looking components appear in `facts/questions.json`. Ask about them in one message (Blocks B and C of the `tadforce` skill's `references/questions.md`), write the knowledge files, rerun `npx tadforce facts`.

## 3. Rewrite only what changed

For each section of `sections[]`:

1. Open `file` at `anchor`, read the current text.
2. Read the spec (`npx tadforce spec <id> --json`) and the changed metadata (`tadforce/.snapshot/source/...`). For a changed Apex class or flow, read the code: what the reader must learn is the new *behaviour*, not that a file changed.
3. Edit the section: add the new components, update the behaviour that changed, remove what was deleted. Keep the heading and its anchor; keep everything that is still true word for word — readers have already validated it.
4. Placeholders (`{{n:…}}`), generated tables, ERDs and appendices update by themselves: never edit them by hand.

A section listed only for moved counts usually needs no change: check that the text holds no number or statement that the new counts contradict.

Then, in chapter 15 (Outlook) or the Improvement Axes, record what the update revealed that the client should know (new debt goes to the Axes, never to the TAD).

## 4. Build and report

```bash
npx tadforce build --pdf --docx
```

0 errors. The HTML keeps its name: the comments readers left on the previous version are still in it. Report in a few lines: version `from → to`, the sections rewritten (with one line each on what changed), the questions still open. Ask the human to review the new version with `npx tadforce review`.
