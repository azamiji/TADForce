# Questions — what only a human can answer

Ask in **blocks**, each in one message, with your proposed answer for every item so the human only confirms or corrects. Write the question in the human's language.

## Block A — startup (before or right after authorization)

Propose from `npx tadforce detect`:

1. Document language — proposed: `<en|fr>` (org default language: `<locale>`).
2. Client name and short code (file names) — proposed: `<Organization.Name>` / `<CODE>`.
3. Integrator (who signs the document) — proposed: `<from the user e-mail domain>`.
4. Environment documented — proposed: `<Production|Sandbox>` (from `IsSandbox`).
5. Document title — proposed: « Salesforce CRM Platform » (or the client's name for the solution).
6. Logos (client, integrator) — paths, or none (initials badges).
7. Target org alias — proposed: `<alias>`; manifest mode `curated` (recommended) or `full`.

FR example:

> Pour démarrer, je propose : langue **français** (langue par défaut de l'org : fr_FR) · client **« Banque Exemple »** (code `BEX`) · intégrateur **« Acme Conseil »** · environnement **Production** · titre **« Plateforme CRM Salesforce »** · pas de logo (pastilles avec initiales). Je confirme ? Indiquez seulement ce qui change.

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
