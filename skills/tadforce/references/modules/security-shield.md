# Shield and compliance

**Detected by** platform encryption settings, transaction security policies, event monitoring subscriptions, field history retention policies, data masking configuration (sandboxes).

## Document

| Chapter | What |
|---|---|
| 10 Security | `security.shield`: encrypted fields and the encryption scheme (probabilistic, deterministic), key management (tenant secrets, BYOK — never the keys), transaction security policies and their actions, event monitoring usage (login forensics, API usage), field audit trail retention |
| 12 Operations | Who monitors what, retention and export of event logs |

## Read

`settings/PlatformEncryption*`, `transactionSecurityPolicies`, `settings/EventSettings*`, objects with `historyRetentionPolicy`, encrypted field metadata (`encryptionScheme`).

## Watch out

Never reproduce keys, secrets or certificates. Encryption affects search, formulas and filters: state the constraints observed, put the risks in the Improvement Axes.
