# Questions — what only a human can answer

Ask in **blocks**, each in one message, with your proposed answer for every item so the human only confirms or corrects. Write the question in the human's language.

## Block A — startup

`npx tadforce doctor --json` asks one step at a time, in this order. Each question has an `id` and a `recommended` answer.

Run TADForce **the way the human started it**: doctor records the command in `tadforce.config.json › setup.runner` (`npx -y github:owner/TADForce`, `tadforce` for a global install, `node "<clone>/bin/tadforce.js"`, else `npx tadforce`) and every `next` and hint it prints uses it. Copy the command from `next`; never shorten it to `npx tadforce` (that would silently run another version from npm).

1. **Project** (`project`) — is this the Salesforce project to document?
2. **Framing** — one message, the recommended answer for each, « accept all » allowed. In the order of the cover:
   1. `lang` — document language. Recommended: the org default language (read from the project's connected org when there is one). English and French are built in; any other language works (headings and labels translated once, see `workflow.md › Other languages`).
   2. `integrator` — the company **writing** the document. **Optional**: blank, the document names the client only (no empty « Integrator » line, no badge); the Improvement Axes then carry the client's brand.
   3. `integrator-logo` — its logo: a file or an `https://` URL. **Optional**: blank, the integrator's name only. Never fetch a logo from the web without the human's go-ahead.
   4. `client` — the **final client** name, as it must appear in the document. Recommended: `Organization.Name`. The short code (file names) and the reference are derived from it.
   5. `logo` — the client logo: a file or an `https://` URL. **Optional**: blank, TADForce searches it in the org's metadata (static resources, content assets, site assets) and asks to confirm it after the retrieve (`branding`).
   6. `author` — **optional**. Blank: no author is shown anywhere. Never put your own name or the agent's.
   7. `specs` — functional specifications, **optional**: paths to PDF / DOCX / MD files (copied into `knowledge/inputs/specs/`). Chapter 2 says the document « draws on the inputs provided by » the client (and the integrator) only when specifications were given.
   8. `scope` — **optional**: name patterns of the components the project owns (`NWB_*,Loan*`), when the org is shared with other teams. Blank: the whole org.

   Answer with `npx tadforce doctor --json --confirm --lang fr --integrator "…"|none --integrator-logo <file|url>|none --client "…" [--logo <file|url>] --author none [--specs … | --no-specs] [--scope "…"]`. The title stays « Salesforce CRM Platform » unless the human gives one (`--title`). A logo that cannot be found or read is a **warning** (`client-logo`, `integrator-logo` checks) with the path it looked for and the fix — pass another `--logo` / `--integrator-logo`, or `none`.
3. **Org** (`org`) — is an org connected? Connected: show it (alias, user, URL) and ask whether it is the right one → `--org <alias>`. None, or not the right one: the human logs in (`sf org login web --alias <a> [--instance-url https://test.salesforce.com]`, it opens the browser), then ask again. No org at all: `--source local`.
4. **Metadata** (`source`) — retrieve through TADForce (`org`, read-only, several minutes: the answer **is the go**), use the project's sources (`local`), or the human retrieves them first (`self`, then `--source local` once done). When the retrieve missed types every org has, or the local sources lack core folders, doctor warns (`retrieve-empty`, `metadata-missing`): those counts read « not collected » in the document, never 0.
5. **Branding** (`branding`) — the client logo and the colours found in the org → `--branding keep`, or `--logo <file|url>`.
6. Blocks **B to D** below → write `knowledge/*.yml`, then `--facts-reviewed` (it recomputes the facts and the outline).
7. **Launch** (`launch-build`) — when everything is green: « Launch the build of the document now? » Recommended: **yes** → `--build yes` (then write the sections: `tadforce next` loop, then `tadforce build`); `--build no` stops there. In a terminal, « yes » hands over to the AI agent found on the machine.

FR example (framing):

> Pour démarrer, je propose : langue **français** (langue par défaut de l'org : fr_FR) · intégrateur : **aucun** (logo : aucun) · client **« Banque Exemple »** (logo : recherché dans l'org) · auteur : **aucun** · spécifications fonctionnelles : **aucune** · périmètre : **toute l'org**. Je valide tout ? Indiquez seulement ce qui change.

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

What Salesforce ships and the Developer Edition samples (`ApexDevNet`, `…SAMPLE` templates, the sample role hierarchy nobody holds, platform service channels…) are already set aside (`facts.salesforceShipped`, see `exclusion-heuristics.md`): never ask about them. Products seen on weak evidence only (`facts.modules.weak`) are not asked either: they go to the Improvement Axes.

Present each group with its count, up to 10 names and its `recommended` answer; ask for a decision per group, with exceptions. Groups of components that are not the project's own work come first with `recommended: exclude` — libraries deployed without namespace (Nebula Logger, fflib…), LWC generated by OmniStudio, DevOps tooling objects, demo and test leftovers, standard objects the project does not use (see `exclusion-heuristics.md`). Mere suspicions (not placed, inactive, referenced by tests only) are `recommended: none`.

> 152 LWC are generated by OmniStudio from OmniScripts and FlexCards (`cfAccountCard`, …): I propose to exclude them. 14 components look unused (not placed on any page, app, tab or action): `lwcA`, `lwcB`, … Exclude them too? (yes / no / all except …)

`questions.json › packages` lists the packages installed without namespace whose components TADForce cannot recognise: ask for name patterns to exclude (blank: none).

Write only the confirmed ones in `exclusions.yml › exclude` with the reason given by the human. Once excluded, they vanish from facts, counts, tables and from the outline (`--facts-reviewed`).

## Block D — knowledge only people have

1. Features that were **decommissioned** but whose components are still deployed? (names, components, keywords to ban)
2. Terms the client imposes (« API Gateway » rather than « middleware »…)?
3. Documents to use as inputs (specifications, previous architecture document, release procedure)? → `knowledge/inputs/`
4. Environments (sandboxes and their purpose) and the release process, if not visible in the project.
5. User populations (names the client uses) → `glossary.yml › actors`.

## During writing

Ask only when a section cannot be written without it, and batch these questions every few sections. Otherwise write the fact you have and mark the rest « to be confirmed » (FR « à confirmer »).
