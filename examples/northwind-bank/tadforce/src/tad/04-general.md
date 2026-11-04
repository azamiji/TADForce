# General architecture {#ch-general}

## Context view {#general-context}

@@CONTEXT@@

**Users.** Employees reach the platform through two Lightning console applications and log in with the corporate identity provider. Customers never log in to Salesforce: the mobile banking app calls an Apex REST service on their behalf.

**Salesforce.** The organization combines Sales Cloud objects, the financial account model of Financial Services Cloud, an OmniStudio journey for loan intake and platform events for the loan follow-up. Specific objects hold branches, loan applications, loan documents and contact attempts.

**Connected systems.** The core banking system is read in real time and feeds the nightly customer synchronisation; the SMS gateway sends reminders; the document store archives the documents of decided loan applications; the maps provider serves map tiles to the console.

## Salesforce foundation and products {#general-products}

@@ANNEX:products@@

| Product | Use in the solution |
|---|---|
| Sales Cloud | Leads, conversion, opportunities linked to loan applications |
| Financial Services Cloud | Financial account model referenced by loan applications (`LoanApplication__c.FinancialAccount__c`) |
| OmniStudio | Guided loan intake (OmniScript), server-side retrieval of positions (Integration Procedure), loan data extraction (Data Mapper) |
| Platform Events | Decoupling of the loan status change from its consequences |

Everything else — branches, loan applications, documents, scoring, Customer 360 — is specific and documented in chapters 6 to 9.

## Logical architecture in layers {#general-layers}

@@LAYERS@@

| Layer | Components | Responsibility |
|---|---|---|
| Presentation | Console applications, Lightning pages, LWC, OmniScript | Show information and guide the user; no heavy business rule in the browser |
| Orchestration | Flows, Integration Procedure, Data Mapper | Chain the steps of a process; declarative automation |
| Apex services | Triggers and handlers, controllers, services, selectors, asynchronous jobs | Business rules, data access, integrations, volume processing |
| Data | Standard and industry objects, specific objects, Custom Metadata | Business data and configuration |
| Integration | Named and external credentials, Apex REST, connected app | Isolate and secure the exchanges with the bank's systems |

## Design principles {#general-principles}

- **Standard first**: standard objects, queues, record types, platform events and OmniStudio before custom code.
- **Configuration over code**: business parameters in Custom Metadata (`ScoringRule__mdt`, `IntegrationSetting__mdt`).
- **Bulk-safe**: triggers process lists, the customer synchronisation (`CustomerSyncBatch`, designed to run nightly) works in batches of 50 records.
- **Secure server-side**: controllers run `with sharing` and query in user mode; the inbound API inserts records as the calling user.
- **Loose coupling**: the trigger publishes an event; subscribers react independently.

## Naming conventions {#general-naming}

@@ANNEX:naming@@

- Apex classes carry their role as a suffix: `*TriggerHandler`, `*Service`, `*Selector`, `*Controller`, `*Batch`, `*Queueable`, `*Client`, `*Resource`; test classes end with `Test`.
- Permission sets and permission set groups start with the bank code `NWB_`; persona groups with `NWB_Persona_`.
- Flows start with the object they work on (`Lead_`, `Loan_`).
- LWC names are in camel case and describe the component (`customer360`, `loanTimeline`).
