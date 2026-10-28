# Example — Northwind Bank (fictional)

A complete TADForce workspace on the synthetic metadata of `test/fixtures/northwind/force-app`: what an agent produces after `/tadforce`.

- `tadforce/tadforce.config.json` — language, client, integrator, document, outputs (written to `docs/demo/`)
- `tadforce/knowledge/glossary.yml` — systems, actors, terms confirmed by the (fictional) team
- `tadforce/knowledge/exclusions.yml` — components confirmed as out of scope
- `tadforce/facts/facts.json` — deterministic facts
- `tadforce/src/tad/*.md`, `tadforce/src/axes/*.md` — the written sources

Rebuild from the repository root:

```bash
npm run example            # HTML + PDF + DOCX into docs/demo (needs Chrome or Edge)
npm run example:validate   # validation only, no browser
```
