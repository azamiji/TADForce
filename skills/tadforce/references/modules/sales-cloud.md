# Sales Cloud

**Detected by** customised `Lead`, `Opportunity`, `Quote`, `OpportunityLineItem`, forecasting types, territory models, Sales Engagement cadences.

## Document

| Chapter | What |
|---|---|
| 5 Functional | Lead lifecycle (sources, qualification, assignment, conversion, recycling); opportunity pipeline (stages, sales processes per record type, products and price books, quotes); forecasting; territories; activities and cadences |
| 6 Data | `Lead` → `Account`/`Contact`/`Opportunity` conversion mapping (custom field mapping), opportunity record types and sales processes, path guidance |
| 7 Application | Assignment rules, lead / opportunity triggers and flows, duplicate and matching rules |
| 8 UI | Path (`pathAssistants`), Kanban, record pages, Sales console, mobile |
| 10 Security | Opportunity and Lead OWD, territory-based sharing, opportunity teams, account teams |
| 11 Reporting | Pipeline and forecast dashboards |

## Read

`objects/Lead`, `objects/Opportunity` (stage picklist, `businessProcesses`, `recordTypes`), `assignmentRules`, `duplicateRules`, `matchingRules`, `pathAssistants`, `forecastingTypes`, `territory2Models`, `quickActions`, lead conversion settings (`settings/Lead.settings-meta.xml`).

## Draw

State diagram of lead statuses and opportunity stages; sequence for web-to-lead or API lead creation → assignment.

## Watch out

Converted leads are read-only (validation rules often enforce it); lead conversion field mapping is in settings, not in fields; forecast categories derive from stages.
