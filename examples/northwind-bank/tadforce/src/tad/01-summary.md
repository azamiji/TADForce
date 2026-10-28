# Executive summary {#ch-summary}

The **Northwind Bank CRM platform** is the bank's system of engagement for retail and business customers. Designed and built by Acme Integrators on Salesforce, it supports two populations, each in a dedicated console application:

- the **branch network** (advisors and branch managers) in the « Branch Console », to manage customers, leads and loan applications;
- the **contact center** (agents and their manager) in the « Contact Center » console, to qualify leads and record contact attempts.

Customers interact indirectly through the **mobile banking app**, which creates leads through an inbound API.

The solution relies on four Salesforce foundations, complemented by specific developments:

- **Sales Cloud** carries the lead and opportunity lifecycle, from the first contact to the loan;
- **Financial Services Cloud** provides the financial account model that loan applications refer to;
- **OmniStudio** guides the loan intake journey;
- **Platform Events** decouple the loan decision from its follow-up actions.

@@KPIS@@

## Business capabilities covered {#summary-capabilities}

| Domain | Main capabilities |
|---|---|
| Customer knowledge | Customer record with live positions from the core banking system (Customer 360), segment kept in sync every night |
| Leads | Leads from the mobile app, the branches and the contact center; default branch assignment; scoring at creation |
| Loan applications | Intake guided by an OmniScript, automatic scoring from configurable rules, decision, document archiving |
| Customer notifications | SMS reminders for missing documents, follow-up tasks when a status changes |
| Contact center | Lead queue, contact attempts and their outcome |
| Steering | Loan reports by status and by branch, loan pipeline dashboard |
| Security | Single sign-on for employees, persona-based permission set groups, role hierarchy following the network |

## Key achievements {#summary-achievements}

<div class="cards">
<div class="card"><h4>Configurable loan scoring</h4><p>The score of each loan application is computed by <code>LoanScoringService</code> from rules stored as <code>ScoringRule__mdt</code> records. A new criterion or a new weight is a configuration change: no code, no deployment window.</p></div>
<div class="card"><h4>Live Customer 360</h4><p>Accounts, cards and loans are read in real time from the core banking system through a named credential (<code>NWB_CoreBanking</code>). No position is copied into Salesforce, so advisors always see the figures of the system of record.</p></div>
<div class="card"><h4>Event-driven loan follow-up</h4><p>Every status change of a loan application publishes a <code>LoanStatusChange__e</code> event. Follow-up tasks, notifications and archiving subscribe to it, so new reactions are added without touching the trigger.</p></div>
<div class="card"><h4>Secure by design integrations</h4><p>All calls go through named and external credentials; the inbound lead API runs in user mode; employees log in once through the corporate identity provider, with users created by a registration handler.</p></div>
</div>

## Architecture principles applied {#summary-principles}

1. **Standard first**: Sales Cloud objects, Financial Services Cloud accounts, OmniStudio journeys, queues and platform events are used before any specific development.
2. **The core banking system stays the master** of customers and positions: Salesforce reads them live and keeps only what the relationship needs.
3. **Configuration in Custom Metadata**: scoring rules and integration timeouts are records, changed without code.
4. **One trigger per object**, delegating to a handler class; services and selectors separate business logic from data access.
5. **Asynchronous for anything slow**: archiving, SMS and nightly synchronisation run outside the user transaction.
6. **Credentials outside the code**: every endpoint is a named credential; authentication is held by external credentials.
