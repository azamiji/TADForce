# Writing rules — a document the client keeps

The reader is an architect, an application owner, an operations or security engineer of the client, or a developer joining the project. They read it on screen, print it, and come back to it months later.

## Voice

- Present tense, as implemented: « The platform assigns… », not « will assign » or « should ».
- Factual and positive. Describe what exists and why it was designed this way. No blame, no defect list, no « unfortunately ».
- Precise and short: one idea per sentence; paragraphs of 2 to 5 sentences.
- The integrator's design choices are highlighted in `> [!INTEGRATOR]` callouts, sparingly (one per chapter at most).
- No marketing words (« revolutionary », « seamless », « best-in-class »).

## Structure

- Keep the skeleton: chapters, sections and anchors are the same for every org; that is what makes TADForce documents comparable.
- Start each section with the sentence a reader needs if they read nothing else.
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
- Never write a volume, a number of users or a performance figure that is not in the facts or the inputs.

## Language

- Write in the document language. French: typographic conventions (espace insécable avant « : ; ! ? », guillemets « »), « vous » never used — impersonal style.
- Do not translate API names, picklist values or labels shown in the UI; quote them.

## Length (indicative, a medium org)

Summary 1 page · chapters 2 to 4: 1 to 2 pages each · chapter 5: 1 page per domain · chapters 6 to 10: 2 to 5 pages each · chapters 11 to 15: half a page to 2 pages. Appendices: generated.

## What never goes into the TAD

Debt, risks, code smells, scores, recommendations, team or vendor names other than the client and the integrator, personal data, credentials, record IDs, org IDs, URLs with tokens, decommissioned features, excluded components.
