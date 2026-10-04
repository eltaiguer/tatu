# Architecture decision records

Each file records one significant decision: the context, what was decided, and
what it costs. ADRs are kept even after they are superseded, so the history
stays readable. For how the system works today, see
[`../architecture.md`](../architecture.md).

## Index

| ADR                                    | Title                                                    | Status                                                                   | Date       |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| [0001](0001-ai-spending-insights.md)   | AI-powered spending insights                             | Accepted. Partially superseded by [0002](0002-insights-integral-view.md) | 2026-07-22 |
| [0002](0002-insights-integral-view.md) | Insights: integral (all-time) view instead of per-period | Accepted                                                                 | 2026-07-24 |

ADR-0002 replaced 0001's per-period navigation, per-period cache key and
`deltaVsPriorPeriod`. ADR-0001's client-side BYO-key pattern, its model choice
and its rule that the model narrates numbers but never computes them still
stand.

## Adding an ADR

1. Copy [`template.md`](template.md) to `<NNNN>-<short-kebab-title>.md`, using the
   next free number with four digits (the next one is `0003`).
2. Fill in every section. Start with status `Proposed` and change it to
   `Accepted` when the change merges.
3. Add a row to the index above in the same PR.
4. Don't rewrite an accepted ADR to reflect a new decision. Write a new ADR,
   then mark the old one `Superseded by NNNN` (or `Partially superseded by
NNNN`, saying which parts) in both its Status section and this index.
   Correcting a factual error in an ADR is fine; note the correction in its
   Status section, as ADR-0001 does.

Statuses: `Proposed`, `Accepted`, `Rejected`, `Deprecated`,
`Superseded by NNNN`, `Partially superseded by NNNN`.
