# Industry clouds

**Detected by** namespaces or standard industry objects (see `facts.modules.clouds` evidence): Financial Services (`FinServ`, `FinancialAccount`, `ResidentialLoanApplication`), Insurance (`InsurancePolicy`, `Claim`), Health (`HealthCloudGA`, `CarePlan`, `ClinicalEncounter`), Life Sciences, Manufacturing (`SalesAgreement`, `AccountForecast`), Automotive (`Vehicle`), Consumer Goods (`RetailStore`, `Visit`), Communications / Media / Energy & Utilities (`vlocity_cmt`, `ServicePoint`), Public Sector (`IndividualApplication`, `BusinessLicense`), Education (`hed`, `LearnerProfile`), Nonprofit (`npsp`, `GiftTransaction`), Loyalty (`LoyaltyProgram`), Net Zero (carbon footprint objects).

## Document

| Chapter | What |
|---|---|
| 4 General | Which industry cloud, which data model version (managed package vs standard objects), which industry features are used (and which are not) |
| 5 Functional | The industry processes as implemented (examples: onboarding and financial accounts; policy and claims; care plans and referrals; sales agreements and account forecasts; retail execution visits; licensing and permits; admissions and advising; donations and programs; loyalty accrual and redemption) |
| 6 Data | The industry objects used, with their role and what is custom around them (`data.industry` section); Person Accounts and household or group models |
| 7 Application | Industry engines used: OmniStudio, Business Rules Engine (decision matrices, expression sets), Document Generation, Action Plans, Industries Interaction Summaries — each only if seen in the metadata |
| 10 Security | Compliant data sharing (`participant`-based sharing), industry permission set licences |

## Read

Objects with the namespace or industry standard names, `decisionMatrixDefinitions` and `expressionSetDefinitions` (Business Rules Engine), `actionPlanTemplates`, `documentTemplates`, OmniStudio assets, Person Account settings (`settings/Account.settings-meta.xml`).

## Watch out

Industry clouds ship hundreds of objects: document only those referenced by local metadata or customised. Data model versions differ (managed package `FinServ__` vs core standard objects): say which one the org uses.
