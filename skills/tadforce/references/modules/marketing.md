# Marketing (Marketing Cloud Connect, Account Engagement, Marketing Cloud on the core platform)

**Detected by** namespaces `et4ae5` (Marketing Cloud Connect) or `pi` (Account Engagement / Pardot); Marketing Cloud Growth/Advanced on core shows standard marketing objects and Data Cloud.

## Document

| Chapter | What |
|---|---|
| 5 Functional | Campaign process: audiences, journeys or engagement programs, sends, tracking back to the CRM, lead scoring and grading, hand-over to sales |
| 6 Data | `Campaign`, `CampaignMember`, consent objects (`Individual`, `ContactPointTypeConsent`, communication subscriptions), tracking objects of the connector |
| 9 Integrations | Connector configuration (synchronised objects, triggered sends, business units), direction and frequency, connector user |
| 10 Security | Connector user and permission sets, consent and unsubscribe handling |

## Read

`et4ae5__*` / `pi__*` references, `objects/Campaign`, `objects/CampaignMember`, consent objects, connector permission sets, triggered-send configurations.

## Draw

Sequence CRM → marketing platform → tracking back; flowchart of the lead hand-over.

## Watch out

The internal configuration of Marketing Cloud (journeys, content, data extensions) is out of the org: put it out of scope unless documents are provided. Never reproduce audiences or personal data.
