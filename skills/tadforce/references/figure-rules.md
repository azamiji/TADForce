# Figure rules

A figure is worth its place only when it shows a relationship, a branch, an order or a dependency that text cannot show at a glance.

## Generated figures (do not draw them by hand)

| Directive | What it draws |
|---|---|
| `@@FIGURE:context@@` | Context view: users (glossary.actors or apps), the org with its products, connected systems |
| `@@FIGURE:layers@@` | Logical layers with counts |
| `@@FIGURE:integrations\|caption@@` | Integration map from glossary systems and endpoints |
| `@@FIGURE:roles\|caption@@` | Role hierarchy (top levels on large orgs) |
| `@@ERD:Obj1,Obj2,…\|caption@@` | ER diagram, Lookup / Master-Detail fields only; `@@ERD:auto\|caption@@` picks the most connected objects |

## Hand-written Mermaid figures

Fence them as `mermaid` and put the caption on the line right after the closing fence:

    ```mermaid
    sequenceDiagram
      participant U as Advisor
      participant L as customer360
      U->>L: open the customer record
    ```
    Figure: Opening the customer 360 view

- **Sequences** (`sequenceDiagram`): only calls you saw in code or metadata. Participants are components or confirmed systems. 4 to 9 participants, 6 to 15 messages. Numbering is automatic.
- **Flowcharts** (`flowchart LR|TB`): use the shared classes `:::actor`, `:::sf`, `:::ext`, `:::data`, `:::warn` (added automatically). Node ids short and alphanumeric (`A1`), labels in double quotes: `A1["Lead (web)"]:::actor`.
- **State diagrams** (`stateDiagram-v2`) for statuses with transitions.
- **Gantt** only in the Improvement Axes roadmap.
- ERDs are never hand-written: use `@@ERD@@` so they match the metadata.

## Mermaid pitfalls (they break the build)

- Parentheses, brackets, `#`, `;` or quotes inside an unquoted label → always quote labels.
- `end` as a node id; a `-->` inside a label; `:` inside sequence messages is fine, `;` is not.
- Long labels: wrap with `<br/>` is not supported (labels are SVG text) — keep labels short instead.
- One diagram per fence; the `Figure:` line must follow the fence immediately.

## Captions

Sentence case, no final full stop, say what the figure shows: « Figure: Lead lifecycle, from the sources to conversion or archiving ».
