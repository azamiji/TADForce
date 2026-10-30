---
name: tadforce-review
description: Process the review comments that readers left in a TADForce HTML document (Comment / Capture an area, then Save) — apply each correction to the sources and to the knowledge files so it survives regenerations, mark it resolved with an answer, rebuild. Use when the user says the document was reviewed or commented, shares a saved HTML file with comments, or runs /tadforce-review.
---

# TADForce review loop

Readers comment directly in the HTML (💬 Comment, ＋ Capture an area, 💾 Save). Comments are stored inside the file, with the quoted passage, the section and an optional screenshot. Your job: turn every comment into a lasting correction, and answer it.

The document has **one file across versions**: `tadforce/out/TAD_<CODE>.html`. The human opens it with `npx tadforce review`: Save in the page writes into that same file, so no comment is lost in a copy.

## 1. Collect

```bash
npx tadforce review --json                  # open comments of tadforce/out/TAD_<CODE>.html
npx tadforce review <path/to/other.html> --json
```

If the human sent a copy from elsewhere (e-mail, downloads folder), use that path and add it to `commentsFrom` (step 3). Images are attached in the file: open the HTML in a browser if you need to see a capture.

## 2. Classify each open comment

| Kind | Example | Where the fix goes |
|---|---|---|
| Terminology | « Say API Gateway, not passerelle, everywhere » | `knowledge/glossary.yml › terms` (`use` / `avoid`) **and** the text |
| System name | « This is not the legacy core banking, it is the Data Platform » | `glossary.yml › systems` (name, match) **and** the text and figures |
| Decommissioned | « This search was decommissioned, do not mention it » | `knowledge/exclusions.yml › features` (components, keywords) **and** remove from the text |
| Out of scope component | « This LWC is a POC » | `exclusions.yml › exclude` |
| Factual correction | « The batch runs every hour, not daily » | The text; check the metadata first and say if it contradicts the comment |
| Process change | « The flow is simpler now: … » | Rewrite the section from the new description; move open questions to the Improvement Axes |
| Layout / readability | « Table headers are not readable » | Report it to the human (template issue) or adjust the content (split a table) |

When the comment contradicts the metadata, do not silently obey: answer with the evidence and ask.

## 3. Apply

1. Edit `tadforce/src/<doc>/*.md` (never the built HTML).
2. Edit the knowledge files; then `npx tadforce facts` if exclusions or systems changed.
3. In `tadforce/tadforce.config.json`, under `review.<doc>`:
   - comments of `out/TAD_<CODE>.html` itself are carried over automatically; only a copy saved elsewhere goes to `commentsFrom` (path relative to `tadforce/`);
   - add one entry per handled comment to `resolutions`: `"<comment id>": "<what you changed, one or two sentences, with section numbers>"`;
   - add ids to `dropImages` when a capture is no longer useful (keeps the file small).
4. `npx tadforce build --pdf --docx` — handled comments appear as **resolved**, with your answer, in the panel of the same HTML file. When the readers also edited text in the page, the build keeps a copy (`…_comments_<date>.html`): report those edits into the sources.

A comment a reader reopened after its resolution stays open at the next build (warning `comment-reopened`): read the new remark and answer it again with a new resolution.

## 4. Report

One line per comment: id, section, what changed (or why not). Then the validation score. Ask the human to reopen the new HTML and check the resolved comments.

## Rules

- A correction lands in the knowledge files whenever it is a rule (term, system, exclusion), so the next regeneration keeps it.
- Never delete a comment; resolve it with an answer.
- Apply a terminology fix everywhere (text, tables, figure labels, sequence participants), then run `npx tadforce validate` — forbidden terms are checked automatically.
