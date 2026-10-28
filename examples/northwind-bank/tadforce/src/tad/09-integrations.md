# Integration architecture {#ch-integration}

## Integration principles {#int-principles}

- The core banking system remains the system of record: Salesforce reads positions live and stores only the keys and the segment.
- Every outbound call uses a named credential; authentication is held by an external credential, never by code.
- Calls from triggers and user transactions are asynchronous (queueable, `@future`); interactive reads are synchronous with an explicit timeout.
- The inbound API creates records in user mode, with the permissions of the integration user.

## Integration patterns {#int-patterns}

| Pattern | Flows |
|---|---|
| Remote Process Invocation — Request and Reply | FLX-01 Customer positions |
| Remote Process Invocation — Fire and Forget | FLX-03 Document archiving, FLX-04 SMS reminders |
| Batch Data Synchronization | FLX-02 Nightly customer synchronisation |
| Remote Call-In | FLX-05 Lead creation from the mobile app |

## Flow map {#int-map}

@@FIGURE:integrations|Integration map: connected systems and Salesforce endpoints@@

| ID | Flow | Direction | System | Salesforce component | Pattern |
|---|---|---|---|---|---|
| FLX-01 | Customer positions | Outbound | Core banking | `CoreBankingClient` | Request and Reply |
| FLX-02 | Customer segment synchronisation | Outbound | Core banking | `CustomerSyncBatch` | Batch Data Synchronization |
| FLX-03 | Document archiving | Outbound | Document store | `DocumentArchiveQueueable` | Fire and Forget |
| FLX-04 | SMS reminders | Outbound | SMS gateway | `SmsNotificationService` | Fire and Forget |
| FLX-05 | Lead creation | Inbound | Mobile banking app | `LeadApiResource` | Remote Call-In |
| FLX-06 | Employee login | Inbound | Corporate identity provider | `NWB_Corporate_IdP`, `SsoRegistrationHandler` | Single sign-on |

## Connected systems {#int-systems}

<!-- tad:if facts.systems.named -->
@@ANNEX:systems@@
<!-- tad:endif -->

### Core banking {#int-core}

Read through `NWB_CoreBanking`, a secured endpoint whose authentication is held by the external credential `NWB_CoreBanking_OAuth` (OAuth, named principal). `CoreBankingClient` calls `GET /customers/{number}/positions` with a 10-second timeout, for the Customer 360 (FLX-01) and the nightly synchronisation (FLX-02).

### Document store {#int-docs}

`DocumentArchiveQueueable` posts the identifiers of decided applications to `/archive` through `NWB_DocumentStore`.

### SMS gateway {#int-sms}

`SmsNotificationService` posts messages through `NWB_SmsGateway`, authenticated by the external credential `NWB_SmsGateway_Key`.

### Maps provider {#int-maps}

Map tiles are allowed in the console by the CSP trusted site `NWB_Map_Tiles`; geocoding calls are allowed by the remote site `NWB_Maps`.

<!-- tad:if counts.integration.restResources -->
## Inbound APIs {#int-inbound}

@@ANNEX:rest@@

The mobile banking app authenticates with the connected app `NWB_Mobile_Banking` (scopes `Api` and `RefreshToken`) and calls `POST /services/apexrest/leads/v1/`. The service creates a lead with the name, the channel and, when known, the customer number; the record is inserted with the permissions of the calling user.
<!-- tad:endif -->

<!-- tad:if modules.marketingCloud|modules.accountEngagement -->
## Marketing Cloud {#int-marketing}

<!-- tad:pending integration.marketing -->
<!-- tad:endif -->

<!-- tad:if modules.commerce|modules.orderManagement -->
## Commerce {#int-commerce}

<!-- tad:pending integration.commerce -->
<!-- tad:endif -->

## Authentication and single sign-on {#int-sso}

Employees log in through the authentication provider `NWB_Corporate_IdP` (OpenID Connect). At first login, `SsoRegistrationHandler` creates the user from the identity provider claims and sets its federation identifier.

## Allowed domains {#int-domains}

@@ANNEX:allowed-domains@@

Both entries serve the maps provider: tiles in the Lightning pages (CSP) and server-side calls (remote site).
