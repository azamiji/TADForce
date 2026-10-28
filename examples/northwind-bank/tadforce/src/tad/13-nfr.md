# Non-functional requirements {#ch-nfr}

## Measures per requirement {#nfr-measures}

| Requirement | Measures in place |
|---|---|
| Security | Single sign-on, persona permission set groups, private defaults, user-mode queries, external credentials |
| Performance | Positions read on demand with a cached wire adapter; callouts with explicit timeouts |
| Volume | Nightly synchronisation in batches of 50 records; asynchronous archiving and SMS |
| Availability | Partial success on synchronisation; Customer 360 independent from the nightly job |
| Maintainability | Layered Apex, naming conventions, configuration in Custom Metadata |
| Traceability | Field history on specific objects, status change events |

## Salesforce Well-Architected reading {#nfr-well-architected}

| Pillar | Strengths observed |
|---|---|
| Trusted | Credentials outside the code, server-side security, least-privilege personas |
| Easy | Two task-oriented consoles, guided intake, live Customer 360 |
| Adaptable | Event-driven follow-up, scoring by configuration, clear separation of layers |
