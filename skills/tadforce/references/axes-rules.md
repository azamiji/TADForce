# The Improvement Axes document (internal to the integrator)

Purpose: give the integrator an honest, prioritised view of the debt and the opportunities, separate from the client TAD. It may be shared with the client after review — write it so that it can be.

## Inputs

- `facts.signals` — measured signals (pillar, priority, value, evidence); tables are generated per pillar.
- `understanding/model.json › findings` — what the developers, the analyst and the architect saw while understanding the org: `debt` and `risk` findings become axes candidates; `question` findings (what the metadata could not settle) are listed in a « Points to confirm with the client » subsection of the findings chapter. The write group of the Axes carries them in its model slice.
- `understanding/review.json › remaining` — what the reviewer could not prove or fix.
- `knowledge/inputs/code-analyzer-results.json` — Code Analyzer violations (via the `dx-code-analyzer-run` skill).
- The `platform-architecture-analyze` skill output (Well-Architected reading).
- What the writers noted while writing the TAD (`understanding/questions.md`), merged by the CLI and deduplicated per section in the Axes write group (`inputs.questions`).
- The ground-truth brief (`brief`): an axis never relies on something the org does not have.

## Rules

- A signal is not a finding. For each signal and each model finding, decide: real issue, acceptable by design (say why), or false positive (drop it).
- The Axes are the only place where the doubts of the TAD are written: every open question has a home here, none is left in the TAD.
- Each retained finding becomes an axis `AX-nn` with: finding (fact), impact (for the business or the run), recommendation (concrete, Salesforce-native), priority, effort (S / M / L).
- Priorities: **P1** security, data integrity or continuity at risk; **P2** plan in the next releases (maintainability, limits, retired features such as Workflow Rules and Process Builder); **P3** improve when touching the area.
- Pillars follow Salesforce Well-Architected: Trusted, Easy, Adaptable.
- Name components; never people or teams.
- No duplicates with the TAD: the TAD describes, the Axes document improves. The TAD's outlook chapter may point to this document without quoting it.

## Register table

| ID | Axis | Finding | Impact | Recommendation | Priority | Effort |
|---|---|---|---|---|---|---|
| AX-01 | Sharing | 3 classes declared `without sharing` serve UI controllers | Users may read records beyond their access | Switch to `with sharing` + `WITH USER_MODE`; keep `without sharing` in a dedicated system class | <span class="b p1">P1</span> | M |

## Roadmap

Group the axes by horizon (next release, next quarter, next year) or by theme; a Mermaid `gantt` is welcome.
