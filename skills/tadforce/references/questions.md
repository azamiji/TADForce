# Questions — what only a human can answer

Ask in **blocks**, each in one message, with your proposed answer for every item so the human only confirms or corrects. Write the question in the human's language.

## Block A — startup (before or right after authorization)

`npx tadforce doctor --json` asks, in this order and one step at a time: the **project** (is this the Salesforce project to document?), the **org** (is this the org?), then these framing questions — six, each with a `recommended` answer. Ask them all in one message and let the human accept them all at once:

1. Document language — recommended: the org default language. English and French are built in; any other language works (the headings and labels are translated once, see `workflow.md › Other languages`).
2. Client name, as it must appear in the document — recommended: `Organization.Name`. The short code (file names) and the reference are derived from it.
3. Integrator — **optional**. Blank: the document names the client only (no empty « Integrator » line, no badge). The Improvement Axes then carry the client's brand.
4. Author — **optional**. Blank: no author is shown anywhere. Never put your own name or the agent's.
5. Functional specifications — **optional**: paths to PDF / DOCX / MD files (copied into `knowledge/inputs/specs/`).
6. Scope — **optional**: name patterns of the components the project owns (`NWB_*,Loan*`), when the org is shared with other teams. Blank: the whole org.

Answer with `npx tadforce doctor --json --confirm --lang fr --client "…" --integrator none --author none [--specs … | --no-specs] [--scope "…"]`. The title stays « Salesforce CRM Platform » unless the human gives one (`--title`).

Then come the metadata choice (`source`, which is also the go for the retrieve), the **branding** (logo and colours found in the org — never fetch a logo from the web without the human's go-ahead), and Blocks B to D.

FR example:

> Pour démarrer, je propose : langue **français** (langue par défaut de l'org : fr_FR) · client **« Banque Exemple »** · intégrateur : **aucun** · auteur : **aucun** · spécifications fonctionnelles : **aucune** · périmètre : **toute l'org**. Je valide tout ? Indiquez seulement ce qui change.

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
