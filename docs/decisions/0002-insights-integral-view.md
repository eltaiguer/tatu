# ADR-0002: Insights — Integral (All-Time) View Instead of Per-Period

## Status
Accepted

## Date
2026-07-24

## Context

ADR-0001 shipped Insights as a per-month view: a prev/next month stepper,
insights computed for one calendar month vs. its immediately-prior month,
cached per `(user_id, period_start, period_end)`.

After using it, the feedback was that navigating month by month felt wrong
for a feature whose whole point is a holistic "where did my money go"
picture. This wasn't a minor UX nit — it was inconsistent with the rest of
the app: `Dashboard.tsx` (Resumen)'s own category and top-merchant
breakdowns are already computed over **all** transaction history by
default, not scoped to the current month. Per-month Insights was the odd
one out, not the norm.

## Decision

**Insights becomes a single integral view over the user's entire
transaction history** — no period argument, no navigation, no per-period
cache row.

- `buildInsightInput(allTransactions, homeCurrency, fxRate)` — no period
  parameter. Category totals, top merchants, recurring-charge detection,
  and the monthly trend series are all computed over the full,
  unbounded transaction list.
- Recurring-charge detection's lookback window is removed entirely (it was
  a trailing 6 months) — a charge qualifies purely on its own
  months-seen/amount-variance signal, regardless of how long ago it
  started.
- The `ai_insights` Supabase table drops `period_start`/`period_end` and
  moves to a single-column primary key (`user_id`) — one cached row per
  user.
- `Insights.tsx` drops the month stepper, the `referenceDate` prop, and the
  `monthOffset` state entirely.

A side effect: this also removes the whole UTC/local-timezone bug surface
(`getUtcMonthPeriod`, `subUtcMonths`) that ADR-0001 had to specifically
build to keep month boundaries correct — there is no period arithmetic
left to get wrong.

## Alternatives Considered

### Rolling trailing window (e.g. last 6 or 12 months)
- Pros: bounds recurring-charge detection so very old, long-cancelled
  subscriptions don't linger forever; keeps the payload from growing
  unbounded over years of history
- Cons: still an arbitrary boundary the user has to mentally account for;
  doesn't match "integral" as directly as all-time does
- Rejected: the user explicitly asked for entire history, not a window.
  The "old subscription lingers" risk is handled instead by the
  `monthsSinceLastSeen` field below rather than by excluding old data.

### Keep a drill-down mode (integral view + optional per-month detail)
- Pros: preserves the ability to inspect one month in isolation
- Rejected: the user explicitly asked to remove month navigation entirely,
  not just make it secondary. Dashboard already covers "this month"
  specifically; Insights doesn't need to duplicate that.

## Trade-offs Accepted

**`bleeding_money` insights can no longer detect "spiked" spend, only
"dominates" spend.** ADR-0001 defined `bleeding_money` as categories that
"dominate spend **or have spiked**." Dropping `deltaVsPriorPeriod` (there's
no discrete prior period to diff against in a single all-time view) means
the model can only point at `pctOfTotal`/`amount` — the biggest categories,
not the fastest-growing ones. Detecting growth would require a
per-category-by-month breakdown (a `categoryTotals × month` matrix), which
is exactly ADR-0001's own "Phase 2: cross-period comparisons" item — not
built now, to avoid pulling that scope in unannounced. `monthlyTrend`
(overall income/expense by month) still supports genuine `trend`-type
insights about the user's overall trajectory, just not category-specific
growth claims.

**The "data changed, regenerate?" staleness banner fires more often.** With
a frozen calendar month, the cached hash was stable once the month closed.
With all-time scope, every new imported transaction changes the hash, so
the banner will appear more frequently. This is an honest signal — the
data genuinely did change — and no materiality threshold was added to
soften it. A reasonable follow-up if it proves noisy in practice, not
built now.

## New Field: `monthsSinceLastSeen`

Without a lookback window, nothing ages a recurring charge out once
detected — a subscription cancelled years ago would still qualify forever
once it accumulated 3+ months of history. `RecurringCharge` gains
`lastSeenMonth` (the merchant's most recent transaction month) and
`monthsSinceLastSeen` (computed deterministically as a month-key diff
against the history's end month, not a wall-clock read). The prompt
instructs the model to flag a charge as possibly no longer active when
`monthsSinceLastSeen >= 2`, rather than presenting it as a current expense.

## Consequences

- `ai_insights` requires a one-time manual `drop table if exists public.ai_insights;`
  before re-applying `schema.sql`, since the primary key shape changed.
  The table is one day old and holds only regenerable AI-cache content —
  no source financial data is affected.
- `Insights.tsx` is simpler: no period state, no stepper UI, no
  `referenceDate` plumbing (and with it, no more surface for the earlier
  infinite-fetch-loop bug class).
- The per-category cross-period comparison idea from ADR-0001's Phase 2
  remains open future work, now explicitly framed as "add a
  `categoryTotals × month` breakdown" rather than "next month's view."
