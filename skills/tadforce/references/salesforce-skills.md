# Salesforce skills worth calling

Salesforce publishes official agent skills (`forcedotcom/sf-skills`). Install only those you need, for the agents you use:

```bash
npx skills add forcedotcom/sf-skills --skill platform-architecture-analyze --skill dx-code-analyzer-run --skill platform-metadata-retrieve --skill platform-soql-query --skill platform-docs-get --skill external-diagram-mermaid-generate
```

Never install all of them for every agent: dozens of folders, hundreds of copies, slower agents.

| Skill | Use in TADForce | When |
|---|---|---|
| `platform-architecture-analyze` | Well-Architected reading of code and metadata | Chapter 13 and the Improvement Axes |
| `dx-code-analyzer-run` | Code Analyzer (PMD, ESLint, Flow, ApexGuru…) | Save JSON as `knowledge/inputs/code-analyzer-results.json` |
| `dx-org-analyze` | Org inventory: licenses, limits, packages | Cross-check `facts/org.json` |
| `platform-metadata-retrieve` | Retrieve help, partial retrieves | When a type failed in `tadforce retrieve` |
| `platform-manifest-generate` | Manifest edge cases | Custom manifests |
| `platform-soql-query` | Aggregated queries (never record data in the document) | Volumes or usage not in org facts |
| `platform-docs-get` | Official Salesforce documentation | References chapter, product behaviour |
| `platform-data-and-tooling-api-context-get` | Standard object and field reference | Understanding standard / industry objects |
| `external-diagram-mermaid-generate` | Mermaid diagrams for Salesforce | Complex sequences |
| `omnistudio-dependencies-analyze` | OmniScript / IP / Data Mapper dependencies | OmniStudio detected |
| `agentforce-architecture-analyze` | Agent topics, actions, prompts | Agentforce detected |
| `data360-schema-get` | Data Cloud schema | Data Cloud detected |
| `crm-analytics-wave-generate` (read-only use) | CRM Analytics assets | CRM Analytics detected |

Rules: use them **read-only**. Skills that deploy, generate metadata or change the org are out of scope for documentation.
