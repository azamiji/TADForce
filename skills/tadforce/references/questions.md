# Questions — what only a human can answer

Ask in **blocks**, each in one message, with your proposed answer for every item so the human only confirms or corrects. Write the question in the human's language.

## Block A — startup (before or right after authorization)

`npx tadforce doctor --json` returns these questions with a `recommended` answer each (from the org when connected). Ask them all in one message:

1. Document language — recommended: the org default language. English and French are built in; any other language works (the headings and labels are translated once, see `workflow.md › Other languages`).
2. Client name and short code (file names) — recommended: `Organization.Name` / `<CODE>`.
3. Integrator — **optional**. Blank: the document names the client only (no empty « Integrator » line, no badge).
4. Author — **optional**. Blank: no author is shown anywhere. Never put your own name or the agent's.
5. Document title — recommended: « Salesforce CRM Platform » (or the client's name for the solution).
6. Scope — **optional**: name patterns of the components the project owns (`NWB_*,Loan*`), when the org is shared with other teams. Blank: the whole org.
7. Client logo — **optional**: a file or a URL. Blank: TADForce searches the org (static resources, content assets, site assets), then falls back to an initials badge. The document colours follow the org's Lightning theme, else the logo. If none is found and the client has a public website, you may *offer* to look for the logo there — fetch it only after the human says yes.
8. Functional specifications — **optional**: paths to PDF / DOCX / MD files (copied into `knowledge/inputs/specs/`).
9. Metadata — `org` (recommended: retrieve everything from the org), `local` (the sources of this project), or `both`.

Answer with `npx tadforce doctor --json --confirm --lang fr --client "…" --short ABC --integrator none --author "…" --title "…" [--scope "…"] [--logo …] [--specs … | --no-specs] [--source org]`.

FR example:

> Pour démarrer, je propose : langue **français** (langue par défaut de l'org : fr_FR) · client **« Banque Exemple »** (code `BEX`) · intégrateur : **aucun** · auteur : **aucun** · titre **« Plateforme CRM Salesforce »** · périmètre : **toute l'org** · logo : **cherché dans l'org** · spécifications fonctionnelles : **aucune** · métadonnées : **depuis l'org**. Je confirme ? Indiquez seulement ce qui change.

## Block B — external systems (from `facts/questions.json › systems`)

One line per endpoint group: « `api.example.com` (named credential `X_API`, used by `ClassA`, `ClassB`) — which system is it, and how does the client call it? »

Rules: never propose a product name you inferred from a field or class name; you may propose the host's organisation when it is explicit (`*.salesforce.com`, `*.twilio.com`, `*.docusign.net`).

Write:

```yaml
systems:
  - id: core
    name: "Core banking"
    description: "System of record for accounts and contracts"
    match: ["X_API", "api.example.com"]
```

## Block C — candidates for exclusion (from `facts/questions.json › exclusions.groups`)

Present each group with its count and up to 10 names; ask for a decision per group, with exceptions:

> 14 components look unused (not placed on any page, app, tab or action): `lwcA`, `lwcB`, … Exclude them from the document? (yes / no / all except …)

Write only the confirmed ones in `exclusions.yml › exclude` with the reason given by the human.

## Block D — knowledge only people have

1. Features that were **decommissioned** but whose components are still deployed? (names, components, keywords to ban)
2. Terms the client imposes (« API Gateway » rather than « middleware »…)?
3. Documents to use as inputs (specifications, previous architecture document, release procedure)? → `knowledge/inputs/`
4. Environments (sandboxes and their purpose) and the release process, if not visible in the project.
5. User populations (names the client uses) → `glossary.yml › actors`.

## During writing

Ask only when a section cannot be written without it, and batch these questions every few sections. Otherwise write the fact you have and mark the rest « to be confirmed » (FR « à confirmer »).
