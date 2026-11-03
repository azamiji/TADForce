# Platform Events and Change Data Capture

**Detected by** objects ending with `__e`, `platformEventChannels`, `platformEventChannelMembers` (CDC entities), event-triggered flows and triggers.

## Understand

`facts/graph.json` links publishers (`EventBus.publish`, flow record creates) and subscribers (event-triggered flows and triggers) with `publishes` / `subscribes` edges; the architect's chains cross the event with a `delivers` step. A process across an event is asynchronous: mark the step `async: true`.

## Document

| Chapter | What |
|---|---|
| 6 Data | `data.events`: each event (purpose, fields in one line), CDC entities selected |
| 7 Application | Publishers (Apex `EventBus.publish`, flows, processes) and subscribers (triggers on `__e`, platform-event-triggered flows, external subscribers via Pub/Sub API or CometD) |
| 9 Integrations | External subscribers and publishers, replay and retention, ordering assumptions |

## Draw

Sequence publisher → event bus → subscribers (internal and external).

## Watch out

Publish behaviour (`Publish Immediately` vs `Publish After Commit`) matters for consistency: read the event definition. High-volume events have allocations: mention them as facts.
