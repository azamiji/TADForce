# Unused and decommissioned components

An org accumulates proofs of concept, test scaffolding, samples and features switched off but still deployed. Documenting them misleads the reader; deleting them is not your job. TADForce **proposes** candidates; the human **decides**; the decision lives in `knowledge/exclusions.yml`.

## Not the project's own work — recommended « exclude »

These groups come first in `facts/questions.json › exclusions.groups`, each with `recommended: exclude` (each candidate carries a `category`). Propose them for exclusion in one go; the human may keep exceptions.

| Category | Detected by | Examples |
|---|---|---|
| `library` | Open-source libraries deployed **without namespace** (unlocked or unmanaged): a signature (components only the library has) or a package name (installed package without namespace, `sfdx-project.json › packageAliases`) | Nebula Logger (`Log__c`, `LogEntry__c`, `Logger*`, `logViewer`…), fflib (`fflib_*`), RFLIB, DLRS unmanaged (`dlrs_*`), Trigger Actions Framework, sfdc-trigger-framework (`TriggerHandler`) |
| `omnistudio-generated` | LWC that OmniStudio compiles from OmniScripts and FlexCards: `runtimeNamespace` in the bundle, `cf*` names, `<type><subType><language>` names, `*_<n>_<suffix>` versions | `cfAccountCard`, `onboardingNewClientEnglish` |
| `devops` | In-house DevOps tooling stored in the org | `Pipeline__c`, `PullRequest__c`, `User_Story__c`, `Sprint__c`, `Deployment__c` and their triggers |
| `demo` | Demo, sample and test leftovers (by name) | `helloWorld`, `*Test*` (non-test classes), `testTodelete*`, `Shopping_List__c`, `Store__c`, `Item__c`, `Test__c` |
| `standard-unused` | Standard objects the project does not use: no custom field, record type, validation rule, Lightning page, trigger, flow, queue, lookup from a custom field, nor reference in code, LWC, flows or OmniStudio | most of the ~300 standard objects a full retrieve brings |

Installed packages without namespace whose components cannot be recognised are asked separately (`questions.json › packages`): the human gives name patterns to exclude. Generic names (`Store__c`, `Item__c`) can be real business objects: say so when you propose them.

The sharing defaults (`facts.data.owd`) only list the project's custom objects and the standard objects it uses, whatever the answer.

## Suspicions — recommended « none », ask

| Reason | Meaning | Typical decision |
|---|---|---|
| name suggests old / legacy / deprecated / draft / copy / backup… | Words in the API name | Exclude after a quick look |
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

- Excluded components disappear from every count, table and figure after `tadforce facts`, and the sections about them leave the outline (only while still to write: written text is never removed, it is reported for review).
- `features.keywords` are forbidden in the text: `tadforce validate` fails if one appears.
- The method section of the TAD lists the exclusions applied (generated), so the client knows what was left out and why.

## In the Improvement Axes

Candidates that the human did not exclude but did not confirm either are listed in the appendix of the Improvement Axes: cleaning them is an improvement axis, never a TAD statement.
