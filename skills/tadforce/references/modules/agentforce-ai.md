# Agentforce and Einstein

**Detected by** `bots` / `botVersions`, `genAiPlanners`, `genAiPlannerBundles`, `genAiPlugins` (topics), `genAiFunctions` (actions), `aiAuthoringBundles` (Agent Script), `genAiPromptTemplates`, Einstein prediction definitions.

## Document

| Chapter | What |
|---|---|
| 7 Application | `application.ai` section: each agent (purpose, channel, topics, actions and what they call — Flow, Apex, prompt template, API), grounding sources (knowledge, Data Cloud, records), guardrails and escalation to humans, prompt templates and where they are used, Einstein features used (scoring, classification, Copilot features) |
| 8 UI | Where agents appear (Lightning, Experience site, messaging channel) |
| 10 Security | Agent user, permission sets, Einstein Trust Layer settings, data masking |
| 12 Operations | Testing (agent tests), monitoring (session tracing, health alerts) |

## Read

Agent metadata above; the `agentforce-architecture-analyze` skill renders the declared architecture of one agent (topics, actions, flows, Apex, prompts).

## Draw

Flowchart agent → topics → actions → Flow / Apex / prompt template → data.

## Watch out

Describe declared behaviour, never transcripts or user prompts. Legacy Einstein Bots and Agentforce agents may coexist: say which channel uses which.
