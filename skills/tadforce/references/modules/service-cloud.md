# Service Cloud

**Detected by** customised `Case`, entitlements and milestones, Omni-Channel (service channels, routing configurations, presence), messaging and chat sessions, voice calls, knowledge articles (`*__kav`).

## Document

| Chapter | What |
|---|---|
| 5 Functional | Case lifecycle: channels in (e-mail-to-case, web-to-case, messaging, voice, portal, API), triage, assignment and escalation, SLA (entitlements, milestones), resolution, closure, surveys; knowledge usage |
| 6 Data | `Case` record types and support processes, `Entitlement`, `ServiceContract`, `CaseMilestone`, knowledge article types and data categories |
| 7 Application | Assignment, auto-response and escalation rules; case triggers and flows; macros and quick text |
| 8 UI | Service console, utility bar (softphone, omni widget, history), case record pages; telephony (Service Cloud Voice or CTI adapter via `callCenters`) and Omni-Channel (channels, queues, skills, capacity, presence statuses) |
| 9 Integrations | Telephony provider, messaging providers (WhatsApp, SMS), e-mail routing addresses |
| 10 Security | Case sharing, queue membership, support profiles and permission set groups, Experience Cloud case access |
| 11 Reporting | Service KPIs (backlog, first contact resolution, SLA attainment) |

## Read

`objects/Case`, `entitlementProcesses`, `milestoneTypes`, `assignmentRules/Case`, `autoResponseRules`, `escalationRules`, `serviceChannels`, `queueRoutingConfigs`, `presenceUserConfigs`, `servicePresenceStatuses`, `callCenters`, `queues`, `settings/Case.settings-meta.xml`, `settings/EmailToCase*`, `quickActions`, messaging channels.

## Draw

Flowchart of case channels → routing → queues → agents; state diagram of case statuses; sequence of an inbound call or message with Omni-Channel.

## Watch out

Routing may be queue-based or skills-based (attribute routing): say which. Omni-Channel capacity and presence are configuration, not code. Do not reproduce e-mail addresses or phone numbers.
