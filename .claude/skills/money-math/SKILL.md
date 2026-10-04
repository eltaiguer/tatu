---
name: money-math
description: Checklist for any Tatu code that adds, converts, rounds or compares money. Use when touching totals, currency conversion, the FX rate, home currency, transfer detection, splits, or the numbers in Resumen, Transacciones or Insights.
---

# Touch money math

A wrong total is the worst bug Tatu can ship: the app exists to say where the
money went. Read "Money conversion" in `docs/architecture.md` first — its
table lists every place that converts.

## The rules the numbers follow

- **Native and positive at rest.** `Transaction.amount` is always positive;
  `type` (`debit` / `credit`) carries the sign. Stored amounts are never
  converted, and nothing converted is persisted.
- **One converter.** `convert(amount, from, to, rate)` in
  `src/services/currency/convert.ts`, with `rate` = UYU per 1 USD (default
  40.5). It throws on a non-positive or non-finite rate. Convert at
  aggregation or render time into `homeCurrency`, then sum — never sum mixed
  currencies.
- **Same exclusions everywhere.** Totals leave out ignored categories
  (`isCategoryIgnored`, which includes the transfer categories) and split
  parents (`isSplitParentTx`); `isExcludedFromTotals` in
  `src/services/charts/chart-data.ts` combines both. A new total uses it, or
  explains why it differs.
- **Round at the edge.** Keep full precision while summing.
  `insight-data.ts` rounds to cents (`round2`) only because the model's
  amounts are matched against the input by `===`.
- **Display.** `formatCurrency` / `formatCurrencyShort` from
  `src/utils/formatting.ts`, in an `.amt` or `font-mono tabular-nums` element.
  A converted amount is shown as `≈`, next to the native one.

## Steps

1. **Red.** Write the failing test with numbers you computed by hand: a
   USD + UYU mix, a credit, an ignored-category row, a split parent with its
   parts, and the opposite home currency. Assert exact values.
2. **Green.** Minimal change, through `convert` and `isExcludedFromTotals`.
3. **Cross-check.** The same figure shown in two places (Resumen card vs.
   Transacciones filtered total vs. Insights input) must agree — add a test if
   your change could make them drift.
4. **Doubt it.** Get a fresh-context adversarial review of the diff (the
   `doubt-driven-development` skill, if available; otherwise a subagent asked
   only for what is wrong) before calling it done, even when it looks
   obviously right.
5. **Docs.** A new caller of `convert` goes in the table in
   `docs/architecture.md`.
