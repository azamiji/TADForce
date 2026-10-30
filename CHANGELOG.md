# Changelog

## 0.2.0 — 2026-10-30

Four commands for the whole run: **doctor → build → review → update**. The fine-grained commands stay (`tadforce help --all`).

- `doctor` is now the whole setup, in one loop until everything is green: tools, SFDX project and workspace, org connection (reuses the project's `target-org`, opens the browser login only when needed), metadata from the org, the local sources or both, then the framing questions (each with a recommended answer) and the questions on systems and exclusions. Agents answer with flags and `--json`.
- New framing answers: **author** (optional — nothing shown when blank), **integrator** now optional (the document then names the client only), **functional specifications** (`--specs`, copied into `knowledge/inputs/specs/`), **scope** (`--scope "NWB_*"`, `--package-dirs`) to document one project in a shared org.
- Client branding from evidence: the logo is searched in the snapshot (static resources, content assets, site assets) or given as a file or URL; the colours come from the org's Lightning theme (`BrandingSet`), else from the logo, with WCAG contrast checked.
- `review`: opens the document from a local server; **Save writes into the same file**. The HTML keeps one name across versions (`TAD_<CODE>.html`) and the comments saved in it are carried into every rebuild; PDF and DOCX keep the version in their name.
- `update`: archives the previous facts, reads the org again, compares content fingerprints, lists the sections touched by what changed, bumps the version and writes the history line. New skill and command `tadforce-update`.
- `build` asks for PDF / Word in a terminal when no flag says, warns about sections still to write, and `--open` opens the result for review.
- The Improvement Axes (a separate file, built by default next to the TAD) carry the integrator's brand only: its logo on the cover, its name in the footer; the client's brand when there is no integrator.
- README: GIFs recorded from the demo (`tools/record-demo.js`), banner showing `npx tadforce doctor`, “every kind of Salesforce project” and “what leaves your machine” sections. Release workflow (npm with provenance) and issue templates.

## 0.1.0 — 2026-10-28

First public version.

- CLI: `init`, `doctor`, `auth`, `detect`, `manifest`, `retrieve`, `facts`, `prepare`, `scaffold`, `next`, `spec`, `build`, `validate`, `comments`, `status`, `install-skills`.
- Curated wildcard manifest (130 metadata types) filtered on the org, with foldered types and standard objects expanded.
- Deterministic facts: Apex, triggers, flows, OmniStudio, objects and relationships, Custom Metadata, UI and component placement, security, integrations, packages, products detection (clouds and industries), naming conventions, review signals, unused-component candidates.
- Aggregated org facts: record counts, users per profile and permission set group, scheduled jobs, coverage, packages, limits.
- Document model: 15 chapters + appendices, 84 section specifications, English and French.
- Build: HTML with in-place editing, comments and area captures, PDF, DOCX; Mermaid figures rendered locally; generated context view, layers, ERDs, role hierarchy, integration map, KPI tiles.
- Validation gate: pending sections, placeholders, unknown or excluded identifiers, glossary terms, decommissioned features, secrets, anchors, Mermaid errors.
- Agent Skills `tadforce` and `tadforce-review`, Claude Code plugin and marketplace, 15 product references.
