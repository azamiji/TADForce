# Field Service

**Detected by** namespace `FSL`, or customised `WorkOrder`, `ServiceAppointment`, `ServiceTerritory`, `ServiceResource`, `MaintenancePlan`.

## Document

| Chapter | What |
|---|---|
| 5 Functional | Work order lifecycle (creation from case or asset, work types, line items), scheduling and dispatch (policies, optimisation), mobile execution (Field Service mobile app, flows, data capture), completion and billing triggers; preventive maintenance plans |
| 6 Data | Work order / appointment / assigned resource model, territories and operating hours, skills, products consumed and required, assets |
| 7 Application | Scheduling policies and work rules (`FSL` objects are data, not metadata: ask), automation on appointment status changes |
| 8 UI | Dispatcher console, Gantt, mobile app configuration (offline priming) |
| 10 Security | Field service permission sets, territory-based sharing, mobile user licences |

## Read

`objects/WorkOrder`, `objects/ServiceAppointment`, `objects/ServiceTerritory`, `objects/ServiceResource`, `workTypes`, `FSL__*` references, mobile app extensions (`lwc` with `lightning__GlobalAction` targets), flows launched from the mobile app.

## Draw

State diagram of appointment statuses; sequence case → work order → appointment → dispatch → mobile completion.

## Watch out

Scheduling policies, work rules and service objectives are records in `FSL` objects: they are not in the metadata; ask for them or describe them as configuration to confirm.
