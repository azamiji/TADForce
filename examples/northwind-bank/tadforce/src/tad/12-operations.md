# Environments, delivery and operations {#ch-operations}

## Environments {#ops-environments}

The environments (sandboxes and their purpose) are to be confirmed with the bank. This document describes the production organization.

## Release management {#ops-release}

The project is a Salesforce DX project (source format, API version 62.0). Metadata is deployed first, OmniStudio components second, then the active versions are checked. The pipeline and its approval gates are to be confirmed.

## Scheduled processing {#ops-scheduled}

<!-- tad:if org.scheduledJobs -->
@@ANNEX:scheduled-jobs@@
<!-- tad:endif -->

| Processing | Frequency | What to monitor |
|---|---|---|
| `CustomerSyncBatch` | Nightly (to be confirmed) | Failed batches and records not updated (partial success) |
| `Loan_Document_Reminder` | Daily | Flow errors, SMS gateway errors |

## Logging and monitoring {#ops-logging}

Errors of asynchronous jobs are visible in the Apex jobs monitor and flow errors in the flow error e-mails. No specific logging framework is present in the metadata.

## Test strategy {#ops-tests}

{{n:apex.tests}} test classes cover scoring, the trigger handler, the nightly batch and the inbound API. Callouts are isolated behind `CoreBankingClient`, which makes them mockable. Code coverage is to be read in the organization.
