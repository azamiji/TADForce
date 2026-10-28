# Findings {#ax-findings}

## Trusted — security, compliance, reliability {#ax-trusted}

@@ANNEX:signals-trusted@@

- **Powerful permission (AX-01).** `NWB_Support_Admin` grants `ViewAllData`. Keep it only if support needs to read every record, assign it temporarily, and log its assignments.
- **Legacy named credential (AX-02).** `NWB_DocumentStore` uses the legacy format without authentication. Move it to a secured endpoint with an external credential, like the two other integrations.
- **Sharing keywords.** `CustomerSyncBatch` runs `without sharing`, which is expected for a system job. `SsoRegistrationHandler` has no sharing keyword, which is the norm for a registration handler. No axis.
- **Test classes.** The ratio of test classes is low in number but each class covers one service; the org coverage must be read in the org before concluding.

## Easy — user experience and operations {#ax-easy}

@@ANNEX:signals-easy@@

- **Unused components (AX-03).** `LegacyRateHelper` is reached by its test only. Confirm and delete it; the draft flow already excluded from the TAD can be deleted at the same time.
- **Object description (AX-05).** `LoanDocument__c` has no description: add one, it feeds the schema builder and this document.

## Adaptable — maintainability and scalability {#ax-adaptable}

@@ANNEX:signals-adaptable@@

- **Flow and trigger on Lead (AX-04).** Both act on `Lead`. The split (before save in Apex, after save in the flow) is sound; write it down in the trigger handler and keep any new automation on the same side.
- **Old API version (AX-03).** `LegacyRateHelper` is on API 45.0; it disappears with its deletion.
