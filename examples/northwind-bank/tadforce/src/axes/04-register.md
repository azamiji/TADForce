# Improvement register {#ax-register}

| ID | Axis | Finding | Impact | Recommendation | Priority | Effort |
|---|---|---|---|---|---|---|
| AX-01 | Access | `NWB_Support_Admin` grants `ViewAllData` | Support users can read every customer and loan | Restrict to a just-in-time assignment, audit assignments | <span class="b p1">P1</span> | S |
| AX-02 | Integration security | `NWB_DocumentStore` is a legacy named credential without authentication | Archive calls are not authenticated by Salesforce | Secured endpoint + external credential (OAuth or mutual TLS) | <span class="b p2">P2</span> | S |
| AX-03 | Cleanliness | `LegacyRateHelper` unused, on API 45.0 | Dead code to maintain and test | Delete after confirmation | <span class="b p3">P3</span> | S |
| AX-04 | Automation | Trigger and flow on `Lead` | Order of execution unclear for newcomers | Document the split; keep one side per timing | <span class="b p3">P3</span> | S |
| AX-05 | Documentation | `LoanDocument__c` without description | Weaker self-documentation | Add descriptions to specific objects and fields | <span class="b p3">P3</span> | S |
