# Data architecture {#ch-data}

## Modeling principles {#data-principles}

- Standard objects carry the relationship: `Account` for customers (retail and business record types), `Lead`, `Opportunity`.
- Financial accounts follow the Financial Services Cloud model; loan applications refer to them.
- Specific objects exist only for what the standard does not cover: branches, loan applications and their documents, contact attempts.
- Every record fed by or sent to another system carries an external ID used as matching key.
- Relationships are lookups, except the documents of a loan application (master-detail: they live and die with it).
- Business parameters are Custom Metadata records.

## Overview {#data-overview}

@@ERD:auto|Main objects and their relationships@@

The customer (`Account`) is the centre of the model: its branch, its loan applications, its leads and its contact attempts hang off it. The branch (`Branch__c`) owns customers and leads by default. A loan application gathers its documents and may be linked to an opportunity and to a financial account.

## Objects by domain {#data-domains}

### Customers and branches {#data-customers}

@@ERD-DOMAIN:customers@@

| Object | Role | Key fields |
|---|---|---|
| `Account` | Customer (retail or business) | `NWB_CustomerNumber__c` (core banking key), `Segment__c`, `Branch__c`, `Advisor__c` |
| `Branch__c` | Branch of the network | `BranchCode__c`, `Region__c`, `Manager__c` |
| `Lead` | Prospect or customer request | `Channel__c`, `Score__c`, `ExistingCustomer__c`, `Branch__c` |
| `ContactAttempt__c` | Call or contact by an advisor or an agent | `Customer__c`, `Lead__c`, `Outcome__c` |

### Loans {#data-loans}

@@ERD-DOMAIN:loans@@

| Object | Role | Key fields |
|---|---|---|
| `LoanApplication__c` | Loan request from intake to decision | `Customer__c`, `Status__c`, `Amount__c`, `Score__c`, `CoreBankingId__c`, `FinancialAccount__c` |
| `LoanDocument__c` | Document of an application | `LoanApplication__c` (master), `DocumentType__c`, `ArchiveId__c` |
| `Opportunity` | Commercial opportunity of the loan | `LoanApplication__c` |

<!-- tad:if modules.industryCloud -->
## Industry cloud objects {#data-industry}

| Object | Use |
|---|---|
| `FinServ__FinancialAccount__c` | Financial account (loan, current account) to which a loan application can be attached through `FinancialAccount__c` |

The rest of the Financial Services Cloud model is not referenced by the specific metadata.
<!-- tad:endif -->

## External IDs and integration keys {#data-external-ids}

@@ANNEX:external-ids@@

- `NWB_CustomerNumber__c` and `CoreBankingId__c` are the keys of the core banking system, used by the nightly synchronisation and by the Customer 360 calls.
- `BranchCode__c` identifies a branch in the bank's referential.
- `ArchiveId__c` is the identifier returned by the document store.

## Record types and business processes {#data-record-types}

@@ANNEX:record-types@@

Customer record types separate retail and business customers (different page layouts and segments). Loan record types separate consumer loans and mortgages, which follow different scoring rules and documents.

<!-- tad:if counts.cmdt.types -->
## Configuration in Custom Metadata {#data-cmdt}

@@ANNEX:cmdt@@

| Type | What it configures |
|---|---|
| `ScoringRule__mdt` | Criteria and weights of the loan score (`Criterion__c`, `Weight__c`) |
| `IntegrationSetting__mdt` | Timeouts of the outbound integrations (`TimeoutMs__c`) |
<!-- tad:endif -->

<!-- tad:if modules.events -->
## Platform events and change data capture {#data-events}

@@ANNEX:platform-events@@

`LoanStatusChange__e` carries the loan application identifier and its new status. It is published by `LoanApplicationTriggerHandler` and consumed by the flow `Loan_Status_Notification`. No change data capture entity is selected.
<!-- tad:endif -->

<!-- tad:if modules.dataCloud -->
## Data Cloud {#data-cloud}

<!-- tad:pending data.dataCloud -->
<!-- tad:endif -->

## Files and documents {#data-files}

The documents of a loan application are described by `LoanDocument__c` records; their content is archived in the document store once the application is decided, and the archive identifier is kept on the record.

<!-- tad:if org.volumes -->
## Data volumes {#data-volumes}

@@ANNEX:volumes@@

<!-- tad:pending data.volumes -->
<!-- tad:endif -->

## Data lifecycle {#data-lifecycle}

Field history tracking is enabled on the specific objects. No archiving or purge policy is configured in Salesforce for loan applications and contact attempts: the retention rules are to be confirmed with the bank.
