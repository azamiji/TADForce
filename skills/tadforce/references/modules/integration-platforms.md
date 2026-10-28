# Integration platforms and connected services (MuleSoft, Heroku, Slack, external services, Salesforce Connect)

**Detected by** named credentials and hosts (`*.cloudhub.io`, `*.anypoint.mulesoft.com`, `*.herokuapp.com`, `*.slack.com`), `externalServiceRegistrations`, external objects (`__x`) and `dataSources`, Slack metadata or namespaces.

## Document

| Chapter | What |
|---|---|
| 9 Integrations | The middleware as a system of its own (named in the glossary: « API Gateway », « MuleSoft »), the APIs consumed through it, External Services (OpenAPI-based actions used by flows and agents), Salesforce Connect external objects (data virtualization), Slack integrations (notifications, Slack apps) |
| 4 General | Position of the middleware in the context view |
| 10 Security | Credentials (named / external credentials, principals, per-user vs named principal), integration users, mutual TLS certificates (names only) |

## Read

`namedCredentials`, `externalCredentials`, `externalServiceRegistrations`, `dataSources`, external objects, Apex classes with `callout:`, Integration Procedures with HTTP actions.

## Watch out

What happens behind the middleware is out of scope unless documented: say « exposed by the API Gateway » rather than guessing the system behind it.
