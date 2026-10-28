# OmniStudio

**Detected by** `omniScripts`, `omniIntegrationProcedures`, `omniDataTransforms`, `omniUiCard`, or namespaces `omnistudio` / `vlocity_*`.

## Document

| Chapter | What |
|---|---|
| 7 Application | Role split: OmniScripts (guided journeys), Integration Procedures (server-side orchestration, caching), Data Mappers (extract, load, transform), FlexCards (display); naming (`Type/SubType/Language`); one table per family (generated appendix lists the active versions) |
| 5 Functional | The journeys implemented as OmniScripts, step by step for the main ones |
| 9 Integrations | HTTP actions and Remote Actions (Apex) called by Integration Procedures |
| 12 Operations | Deployment of OmniStudio assets (separate step, activation of versions), runtime (standard vs managed package) |

## Read

The `type`, `subType`, `language`, `isActive` of each asset; inside the JSON: elements of type `Integration Procedure Action`, `DataRaptor …`, `Remote Action` (Apex class and method), `HTTP Action` (named credential), custom LWC elements (`lwcName`).

## Draw

Flowchart OmniScript → Integration Procedure → Data Mapper / Apex / HTTP for each main journey.

## Watch out

Only active versions are documented; several versions of the same asset are normal. Standard runtime (on-platform) vs managed package runtime changes deployment and naming: say which.
