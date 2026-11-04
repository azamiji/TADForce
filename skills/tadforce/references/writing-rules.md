# Writing rules — a document the client keeps

The reader is an architect, an application owner, an operations or security engineer of the client, or a developer joining the project. They read it on screen, print it, and come back to it months later.

Write from the understanding model (`tadforce/understanding/model.json`: domains, processes, lifecycles, component cards) and the facts; the patterns of each chapter are in `style-guide.md`.

## Ground truth first (mandatory)

Every write group carries a `brief` (also `tadforce/understanding/brief.md`): `facts` (what the org is), `absent` (what it does not have), `doNotClaim` (what never to write). Read it before writing. It wins over the code, the specifications and your expectations:

- a Schedulable class with no scheduled job is « can be scheduled », never « runs every hour »; a frequency comes only from the scheduled jobs of the org or a scheduled flow's start;
- no Permission Set Groups, no site, no portal, no Named Credential when the brief lists them as absent;
- the environment is the one the brief states (a Developer Edition or a sandbox is never « Production »);
- the products are those the brief lists as in use; an open question of the model is never answered in the text.

## Figure ownership

Each figure of the model — a process (`@@SEQ:…@@`), a lifecycle (`@@STATE:…@@`), a domain ERD (`@@ERD-DOMAIN:…@@`) — belongs to exactly one section (`figures.own` of its group, `understanding/figures.json`). That section draws it under a heading with the given anchor (`{#fn-<processId>}`, `{#lc-<lifecycleId>}`, `{#data-<domainId>}`). Every other section links with the `ref` of `figures.link` (« see {{ref:fn-loan-decision}} ») and never repeats the directive.

## No repetition between chapters

- Chapter 5 is the **business view** of a process: who starts it, what the platform does, what comes out. Chapter 7 is the **technical view**: layers, handlers, order of execution, thresholds, asynchronous boundaries. The same paragraph, table or figure never appears in both; chapter 7 links to chapter 5 for the narrative.
- The `context` of a group lists the chapters already written (headings and first sentences): do not restate them, link to them.

## Voice

- Present tense, as implemented: « The platform assigns… », not « will assign » or « should ».
- Factual and positive. Describe what exists and why it was designed this way. No blame, no defect list, no « unfortunately ».
- Precise and short: one idea per sentence; paragraphs of 2 to 5 sentences.
- The integrator's design choices are highlighted in `> [!INTEGRATOR]` callouts: one per major mechanism, never more than one per section.
- Only what is proven. No « to be confirmed », no « to be completed », no empty section: a doubt is a finding of the model (final report, Improvement Axes), not a sentence of the TAD.
- No marketing words (« revolutionary », « seamless », « best-in-class »).

## Structure

- Keep the skeleton: chapters, sections and anchors are the same for every org; that is what makes TADForce documents comparable.
- Start each chapter with a lead paragraph, and each section with the sentence a reader needs if they read nothing else.
- Describe processes end to end: who starts them, the chain of components, what comes out — one paragraph, one figure (`@@SEQ:<processId>@@` or `@@STATE:<lifecycleId>@@`), one « Step | Mechanism » table.
- Never write about a module, product or component the org does not have.
- Prefer a table when you compare three or more items on the same attributes.
- Lists: parallel grammar, no full stop for fragments, full stop for sentences.
- Cross-reference with `{{ref:id}}` instead of repeating content (« see {{ref:annex-automation}} »).
- Full inventories belong in the appendices (generated). Chapters keep the 5 to 10 items that matter.

## Names

- Technical names in code font: `LoanApplication__c`, `LeadTriggerHandler`, `customer360`. They must exist in the inventory.
- Business labels in quotes: « Loan application » (FR: « Demande de prêt »).
- Salesforce terms in English in every language: Lead, Opportunity, Case, Queue, Record Type, Permission Set Group, Named Credential, Flow, OmniScript, Integration Procedure.
- External systems with the name from `glossary.yml`, nothing else.
- Apply `glossary.yml › terms` (`use` / `avoid`) everywhere, including figures.

## Numbers

- Every count comes from a placeholder: `{{n:apex.classes}}`, `{{n:flows.active}}`, `{{n:security.permissionSetGroups}}`. The list of keys is in `facts.json › counts`.
- Thresholds read in code (batch size, number of retries) are written as numbers with the class that defines them.
- Never write a volume, a number of users, a schedule or a performance figure that is not in the facts, the brief or the inputs.

## Language

- Write in the document language. French: guillemets « », « vous » never used — impersonal style. The non-breaking spaces of French typography (before « : ; ! ? », inside « ») are added by the renderer: type a normal space, never a special character.
- Never write control characters, zero-width characters or escape sequences in the sources: plain UTF-8 text only.
- Save the file after each section: an interrupted run resumes from the markers left.
- Do not translate API names, picklist values or labels shown in the UI; quote them.

## Length (indicative, a medium org)

Summary 1 page · chapters 2 to 4: 1 to 2 pages each · chapter 5: 1 page per domain · chapters 6 to 10: 2 to 5 pages each · chapters 11 to 15: half a page to 2 pages. Appendices: generated.

## What never goes into the TAD

Debt, risks, code smells, scores, recommendations, the findings of the model, team or vendor names other than the client and the integrator, personal data, credentials, record IDs, org IDs, URLs with tokens, decommissioned features, excluded components, « to be confirmed » placeholders.
