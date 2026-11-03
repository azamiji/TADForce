# Figure rules

A figure is worth its place only when it shows a relationship, a branch, an order or a dependency that text cannot show at a glance. Each key chapter (functional, data, application, integrations, security) carries at least one figure: the quality gate fails without it.

## One colour legend in every figure

| Colour | Kind | Mermaid class |
|---|---|---|
| Violet | Actors: users, populations, channels | `:::actor` |
| Blue | Salesforce components | `:::sf` |
| Orange | External systems | `:::ext` |
| Green | Data: objects, metadata, reference data | `:::data` |
| Pink | Warning (rare) | `:::warn` |

These colours are fixed (the client's brand colours are for headings and the cover). The classes are added to every flowchart and state diagram automatically. `@@LEGEND@@` prints the legend chips; the context view draws them under the figure.

## Generated figures (do not draw them by hand)

| Directive | What it draws | Source |
|---|---|---|
| `@@CONTEXT[\|caption]@@` | Context view: actors (left) → platform blocks (apps, UI, logic, data, integration) → external systems (right), arrows labelled with the protocol, legend | facts, glossary (`actors`, `systems[].protocol`), `model.actors` |
| `@@LAYERS@@` | Layered architecture block: Presentation / Orchestration / Apex services / Data / Integration, with chips such as « 4 LWC · 2 Aura » | facts.counts |
| `@@ROLES[\|caption]@@` | Role hierarchy tree (left to right; deep or very wide trees are cut, with « +n ») | roles metadata |
| `@@ERD-DOMAIN:<domainId>[\|caption]@@` | ER diagram of one domain of the model (5 to 8 objects) | `model.domains[].objects` + facts |
| `@@ERD:Obj1,Obj2,…[\|caption]@@` | ER diagram of the named objects (8 at most: more is a warning, only the first 8 are drawn); `@@ERD:auto@@` = the 8 most connected objects | facts |
| `@@SEQ:<processId>[\|caption]@@` | Numbered sequence diagram of a process | `model.processes` |
| `@@STATE:<lifecycleId>[\|caption]@@` | State diagram of a lifecycle | `model.lifecycles` |
| `@@LEGEND@@` | The colour legend chips | — |
| `@@FIGURE:integrations\|caption@@` | Integration map (Mermaid) | glossary systems and endpoints |

`@@FIGURE:context@@`, `@@FIGURE:layers@@` and `@@FIGURE:roles@@` still work (aliases of 0.4). Without a caption, a sensible one is used (« Data model — <domain> », « Sequence — <process> », « Lifecycle of <object> (<field>) »).

### ER diagrams

- Entities are drawn by TADForce (not Mermaid) so that labels never overlap: parents above children, every relationship in its own horizontal lane, edges that skip a row in side corridors, rows wider than the page wrapped.
- Each box lists the key fields: **FK** lookups and master-details (with the target object), **UK** external IDs and unique fields, then up to 4 key fields (status, type, amount, score, code…).
- Relationships are labelled with the lookup field; crow's foot on the child (« many »), bars on the parent: two bars = mandatory (master-detail, required lookup), bar and circle = optional. Master-details are solid lines, lookups dashed.
- One diagram per domain. A global ERD of 12+ objects is never readable: split it.

### Sequences (`@@SEQ@@`)

- `autonumber` always; participants ordered as in the context view (actors, Salesforce components, data, external systems), each group in a box of its legend colour; `actor` participants are stick figures.
- `async: true` → `-)` (open arrow); `reply: true` → dashed (`-->>`, or `--)` when async).
- `group: { kind: alt|opt|loop|par, label }`: consecutive steps with the same group form one block.
- **Else rule**: consecutive `alt` (or `par`) groups whose labels share the same *subject* — the text before the first « : » or « — » — are branches of one block: « status: Approved or Rejected » then « status: any other value » → `alt … else … end` (`par … and … end`). Without a separator the whole label is the subject, so only identical labels continue a branch.
- 4 to 7 participants, 5 to 14 steps. More: split the process.

### State diagrams (`@@STATE@@`)

`initial` gets the start dot, `final` states the end dot and a heavier border; a transition from a state to itself (« To recontact ↺ ») is allowed. More than 4 states are drawn top to bottom.

## The understanding model (`tadforce/understanding/model.json`)

```
domains[{id,name,objects[],components[]}]
processes[{id,name,domain,participants[{id,label,kind:actor|component|object|external,ref?}],
           steps[{from,to,label,async,reply,group:{kind:alt|opt|loop|par,label}|null}]}]
lifecycles[{id,object,field,states[{id,label}],initial,final[],transitions[{from,to,label}]}]
actors[{id,name,kind}]
```

`id` values are short local ids used by the steps; `ref` (optional) is the inventory name of the component. A directive naming an id absent from the model is a validation error; without a model the directive draws nothing and validation warns (`no-model`).

## Hand-written Mermaid figures

Fence them as `mermaid` and put the caption on the line right after the closing fence:

    ```mermaid
    flowchart LR
      A1["Advisor"]:::actor --> L1["customer360"]:::sf
    ```
    Figure: Opening the customer 360 view

- **Flowcharts** (`flowchart LR|TB`) for asynchronous jobs, ownership propagation, decisions (`{"Score above threshold?"}` diamonds). Node ids short and alphanumeric (`A1`), labels in double quotes, legend classes.
- Prefer `@@SEQ@@` and `@@STATE@@` to hand-written sequences and state diagrams: add the process or lifecycle to the model instead.
- **Gantt** only in the Improvement Axes roadmap.
- ERDs are never hand-written: use `@@ERD-DOMAIN@@` / `@@ERD@@` so they match the metadata.

## Mermaid pitfalls (they break the build)

- Parentheses, brackets, `#`, `;` or quotes inside an unquoted label → always quote labels.
- `end` as a node id; a `-->` inside a label; `:` inside sequence messages is fine, `;` is not.
- Long labels: `<br/>` is not supported (labels are SVG text) — keep labels short instead.
- One diagram per fence; the `Figure:` line must follow the fence immediately.
- A flowchart wider than 5 nodes in a row (LR) shrinks below the readable size on A4: go TB or split.

## Captions

Every figure is numbered « Figure N — caption » and listed in the table of figures. Sentence case, no final full stop, say what the figure shows: « Lead lifecycle, from the sources to conversion or archiving ». The caption is kept on the same page as its figure in the PDF.

## The QA loop (do not skip it)

1. `tadforce build` (or `tadforce validate`) renders the document, lays it out at the A4 content width (≈ 688 px, print media) and measures every figure:
   - `overlap` — two labels of the figure overlap → **error** `figure-unreadable`;
   - `too-small` — smallest text under 7 px once the figure is scaled to the page → **error**; under 8.5 px → warning `figure-small-text`;
   - `render-error` — Mermaid could not draw it → **error**;
   - `too-wide` — wider than the page content box → warning `figure-too-wide`.
2. Every figure is photographed to `tadforce/out/figures/<doc>-fig-<n>.png`.
3. **Look at the PNGs** — all of them, not only those with an issue: a figure can pass the measures and still say nothing. Fix the source (fewer nodes, split the diagram, shorter labels, TB instead of LR, a domain per ERD), then validate again.
4. While an error remains, the document is a **draft**: DRAFT watermark on every page (HTML, PDF; a banner on every chapter in Word) and the draft status on the cover — never « For review ».
