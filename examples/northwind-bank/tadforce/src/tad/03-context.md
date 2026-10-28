# Context and vision {#ch-context}

## Business drivers {#context-drivers}

- Give every advisor a complete and current view of the customer, without leaving the CRM.
- Turn every contact — branch, contact center, mobile app — into a qualified lead handled by the right branch.
- Shorten the time from loan request to decision, with a score computed the same way everywhere.
- Keep customers informed at each step of their loan application.
- Steer the loan pipeline by status and by branch.

## Actors and user populations {#context-actors}

| Population | Application | Main activities |
|---|---|---|
| Branch advisors | « Branch Console » | Customer 360, leads of the branch, loan applications, contact attempts |
| Branch managers | « Branch Console » | Same as advisors, plus branch management and review of submitted loan applications |
| Contact center agents | « Contact Center » | Lead qualification from the contact center queue, contact attempts |
| Mobile app customers | Mobile banking app | Request a call back or a loan: a lead is created through the API |

## Functional scope {#context-scope}

| Domain | Covered by |
|---|---|
| Leads and qualification | {{ref:fn-leads}} |
| Loan applications | {{ref:fn-loans}} |
| Customer 360 | {{ref:fn-customer-360}} |
| Notifications | {{ref:fn-notifications}} |
| Contact center | {{ref:fn-contact-center}} |

## Key figures {#context-figures}

@@ANNEX:key-figures@@
