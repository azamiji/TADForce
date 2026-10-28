# Unused and decommissioned components

An org accumulates proofs of concept, test scaffolding, samples and features switched off but still deployed. Documenting them misleads the reader; deleting them is not your job. TADForce **proposes** candidates; the human **decides**; the decision lives in `knowledge/exclusions.yml`.

## Candidates computed by `tadforce facts`

| Reason | Meaning | Typical decision |
|---|---|---|
| name suggests test / demo / POC / sample / old / legacy / draft… | Words in the API name | Exclude after a quick look |
| not placed on any page, app, tab, action, flow or OmniStudio component | LWC or Aura never used in the snapshot | Exclude unless used by a site or a utility bar outside the snapshot |
| flow status is Draft / Inactive / Obsolete | No active version | Exclude |
| inactive version (OmniStudio) | No active OmniScript / IP / Data Mapper version | Exclude |
| referenced only by test classes | Apex reached by nothing but its tests | Ask: often dead code, sometimes started by anonymous Apex or a scheduler |
| not referenced by any other component | Apex not reached at all (entry points such as REST, schedulable, invocable, global, SSO handlers are never flagged) | Ask |
| not assigned to any app, object override or tab | FlexiPage not assigned in the snapshot | Ask: assignments by profile may live outside the snapshot |
| object with no record in the org | From org facts | Ask: new feature not live yet, or abandoned |

## Exclusions file

```yaml
exclude:
  - name: "*Demo*"               # wildcard on the API name
    reason: "Demonstration components"
  - name: legacyScoring
    type: lwc                    # optional: apex, trigger, lwc, aura, flow, flexipage, app, object, permissionSet, omniScript, integrationProcedure, dataMapper, report, emailTemplate, staticResource…
    reason: "Replaced by the scoring engine"
features:
  - name: "Search by national ID"
    note: "UI removed; backend kept until further notice"
    components: [idSearch, IdSearchController, IdSearch_Procedure]
    keywords: ["national ID search", "ID card search"]   # forbidden in the text
```

- Excluded components disappear from every count, table and figure after `tadforce facts`.
- `features.keywords` are forbidden in the text: `tadforce validate` fails if one appears.
- The method section of the TAD lists the exclusions applied (generated), so the client knows what was left out and why.

## In the Improvement Axes

Candidates that the human did not exclude but did not confirm either are listed in the appendix of the Improvement Axes: cleaning them is an improvement axis, never a TAD statement.
