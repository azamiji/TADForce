# Contributing to TADForce

Thank you for helping Tad write better architecture documents. A few rules keep the project useful for everyone.

## Ground rules

1. **Generic, always.** No client, integrator, project or person name in code, templates, tests, examples, file names or commit messages. Examples use the fictional *Northwind Bank* and *Acme Integrators*. `npm test` runs the genericity guard (`tools/check-generic.js`); add your own sensitive terms to a local, git-ignored `.forbidden-local.txt`.
2. **Read-only, always.** New `sf` calls go through `src/sf/sf.js` and its allow-list. No deploy, no delete, no record data.
3. **Deterministic facts.** Extractors are pure functions of the metadata: sorted output, no dates, no randomness. The golden test (`test/fixtures/northwind/facts.golden.json`) must stay byte-identical — when you change facts on purpose, review the diff and run `UPDATE_GOLDEN=1 npm run test:unit`.
4. **Same skeleton in every language.** English and French templates share anchors, pending markers and directives (tested).

## Development

```bash
npm install
npm test                    # unit tests (Node 22+) + genericity guard
npm run example             # rebuild the Northwind Bank example into docs/demo (needs Chrome or Edge)
npm run example:validate
node bin/tadforce.js --help
```

## Adding a product module

1. Detection: add an entry to `CLOUDS` in `src/facts/heuristics/modules.js` (namespaces, standard objects, or a test on facts).
2. Writing guide: add `skills/tadforce/references/modules/<id>.md` (detect · document per chapter · read · draw · watch out).
3. If the product needs its own section: add a conditional block (`<!-- tad:if modules.<id> -->`) in **both** `templates/tad/en` and `templates/tad/fr`, and its spec in `templates/specs/sections.yml`.
4. Extend the fixture if needed and add a test.

## Adding a language

Copy `templates/i18n/en.json`, `templates/tad/en` and `templates/axes/en` to the new language code, translate, keep every anchor, marker and directive, and add the code to `LANGUAGES` in `src/util/i18n.js`. The parity tests will tell you what is missing.

## Pull requests

- One topic per PR, with a test when behaviour changes.
- Describe what a reader of a generated document will see differently.
- Screenshots of the generated HTML are welcome — from the fictional example only.
