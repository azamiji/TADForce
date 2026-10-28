# Quote-to-cash: Salesforce CPQ, Billing, Revenue Cloud

**Detected by** namespaces `SBQQ` (CPQ), `blng` (Billing), `sbaa` (Advanced Approvals); Revenue Cloud by `ProductSellingModel`, `BillingSchedule`, `Invoice`.

## Document

| Chapter | What |
|---|---|
| 5 Functional | Quote-to-cash: configure (bundles, options, rules), price (price rules, discount schedules, contracted prices), quote and approve, contract, order, amend and renew, invoice and collect |
| 6 Data | Product and bundle model, price books, quote / quote line, contract, subscription, order, invoice |
| 7 Application | Price and product rules (records, not metadata: ask), quote calculator plugins (Apex/JS), approval chains, custom triggers on package objects |
| 9 Integrations | ERP, e-signature, payment and tax |
| 10 Security | Package licences and permission sets, approval delegations |

## Read

`SBQQ__*` / `blng__*` fields on local objects, custom fields on package objects, Apex implementing `SBQQ.QuoteCalculatorPlugin*`, approval processes, flows on orders and contracts.

## Draw

Flowchart quote → contract → order → invoice; state diagram of the quote status.

## Watch out

Most CPQ configuration lives in records (price rules, product rules, templates): ask for an export or describe it as configuration to confirm. Do not document package internals.
