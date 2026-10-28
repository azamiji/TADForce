# Data Cloud

**Detected by** data stream definitions, data model objects (`__dlm`), data lake objects (`__dll`), Data Cloud metadata folders.

## Document

| Chapter | What |
|---|---|
| 6 Data | Data streams (sources: CRM, ingestion API, cloud storage, Marketing Cloud), data lake and data model objects, mappings, identity resolution rulesets, calculated insights, segments |
| 9 Integrations | Ingestion connectors and activation targets (Marketing, advertising, CRM), data actions and data graphs used by the CRM (related lists, Agentforce grounding) |
| 10 Security | Data spaces, permission sets for Data Cloud, consent |

## Read

`dataStreamDefinitions`, `dataSourceObjects`, `__dlm` / `__dll` objects, `mktCalcInsightObjectDefs`, data graphs, `dataSpaces`; the `data360-schema-get` skill helps.

## Draw

Flowchart sources → data streams → DLO → DMO → identity resolution → segments / insights → activations.

## Watch out

Data Cloud configuration is partly outside the metadata API: say what you could not see. Never quote profile data.
