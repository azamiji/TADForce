# Architecture decisions {#ch-decisions}

| ID | Decision | Rationale | Consequence |
|---|---|---|---|
| ADR-01 | Read customer positions live from the core banking system | Single source of truth, no duplication of financial data | Customer 360 depends on the availability of the API |
| ADR-02 | Store the scoring rules in Custom Metadata | Business changes without releases | Rules are deployable and auditable like metadata |
| ADR-03 | Publish an event on each loan status change | Add reactions without changing the trigger | Subscribers run asynchronously |
| ADR-04 | Expose an Apex REST service for the mobile app | Control of validation and defaults on the Salesforce side | The service is versioned in its URL (`/leads/v1/*`) |
