# ADR-0001: AI-Powered Spending Insights

## Status
Accepted. **Partially superseded by [ADR-0002](0002-insights-integral-view.md)**:
the per-period navigation/caching decisions below (month stepper, one
cache row per `(user_id, period_start, period_end)`, `deltaVsPriorPeriod`)
were replaced by an all-time integral view. The BYO-key client-side
pattern, the `claude-opus-4-8` model choice for insight generation, and the
deterministic-math discipline (the model narrates, never computes) are
unaffected and still stand as originally decided here.

## Date
2026-07-22

## Context

Tatu's core purpose is forensic spending analysis: helping the user answer
**"Where has my money gone?"** and **"How can I spend less money?"** —
not just track transactions. Categorization, dashboards, and charts exist to
serve those two questions. This feature is the first one that answers them
directly, in narrative form, rather than leaving the user to read the answer
out of a chart.

Concretely, insights should surface things like:

- "Where am I bleeding money?" — categories/merchants that dominate spend or
  have spiked
- "What are the easiest spends to cut?" — discretionary, recurring, or
  low-value spend that's simple to reduce
- Patterns the user hasn't noticed: recurring subscriptions, category creep
  month over month, anomalies

Tatu already has a working, shipped AI integration
(`src/services/ai/transaction-ai.ts`) for transaction categorization:

- The Anthropic client is instantiated **client-side**
  (`new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`).
- Each user brings their own API key, stored in their own row of
  `user_preferences.claude_api_key` (RLS-protected — a user can only read
  their own key).
- `user_preferences.ai_enabled` gates the feature; `user_preferences.ai_model`
  (default `claude-haiku-4-5`) selects the model for categorization calls.
- Prompts are plain text; responses are parsed as JSON manually (no
  `output_config.format` / structured outputs, no beta headers).

Because each user supplies their own key, there is no shared secret at risk
of leaking — the exposure is a user to their own credential, in their own
session. This is a deliberate, already-shipped decision, not an oversight.

There is no serverless layer in this repo (no `supabase/functions`) — all
backend logic is client + Supabase Postgres/RLS.

## Decision

**Insights generation follows the existing client-side, bring-your-own-key
pattern.** No new backend infrastructure. `src/services/insights/` is a
sibling of `src/services/ai/`, reusing the same `AiConfig` plumbing
(`getAiConfig()`, `user_preferences.claude_api_key`, `ai_enabled`).

**Insight generation uses `claude-opus-4-8` regardless of the user's
`ai_model` setting.** Categorization is a narrow per-transaction
classification task where Haiku is cost-effective at scale (hundreds of
transactions per import). Insight generation is a single call per period that
reasons over an entire period's aggregated data, ranks findings, and writes
narrative prose — a harder task where quality matters more than per-call
cost. The two calls are independent knobs; changing one must not change the
other.

**The model never computes dollar figures. It only ranks and narrates
figures that were already computed deterministically.** Every number in an
insight (amounts, percentages, deltas) is pulled from existing aggregator/
chart selectors (`src/services/aggregator/aggregation.ts`,
`src/services/charts/chart-data.ts`) *before* the prompt is built, and echoed
back into the insight's structured fields verbatim. The model's job is
narrative and prioritization: which of the pre-computed facts matter most,
why, and what plain-language story they tell. This is non-negotiable for a
tool whose entire value proposition is trustworthy financial analysis — a
hallucinated total ("you spent $450 on coffee" when it was $45) is worse
than no insight at all.

**Insights are generated on-demand and cached per period**, not
auto-generated on import and not on a cron schedule. A period (calendar
month, by default) gets one cached row; the user explicitly regenerates when
they want fresh analysis, keeping cost predictable and bounded to actual
usage.

**Insights get their own sidebar view** ("Insights"), not a section bolted
onto Análisis or Resumen — this is a distinct reading mode (narrative,
scannable cards) from the existing chart-first views.

**Scope is the broader pattern/trend engine**, not just the two literal
questions — recurring/subscription detection and month-over-month trend
narratives are included in v1 because they're cheap to compute deterministically
and directly serve "where did my money go." Phased below so the first
shippable slice stays small.

## Alternatives Considered

### Move Claude calls to a Supabase Edge Function
- Pros: centralizes API key handling, removes `dangerouslyAllowBrowser`
- Cons: introduces a new backend paradigm inconsistent with every other
  AI call in the codebase; no shared-secret risk exists to justify it (BYO
  key model); adds real scope (new deploy target, new auth path) for no
  benefit specific to this feature
- Rejected: solves a problem this app doesn't have. Revisit only if Tatu
  moves away from BYO-key entirely (would need its own ADR).

### Let the model compute the numbers directly from a transaction dump
- Pros: simpler prompt — just hand over a period's transactions and ask
  for insights
- Cons: LLM arithmetic over dozens/hundreds of rows is exactly where
  confident-but-wrong numbers happen; no way to verify a given total is
  right without recomputing it anyway
- Rejected: violates the deterministic-math discipline above. Categorization
  already follows this shape (structured fields for the classifier's
  actual job — category, confidence — free text only for the display
  name); insights should too.

### Respect the user's existing `ai_model` setting for insights
- Pros: one mental model, cheaper by default (Haiku)
- Cons: insight quality (pattern-finding, prioritization, narrative
  coherence over a whole period) benefits much more from a stronger model
  than per-transaction classification does; a user who picked Haiku for
  cheap categorization shouldn't unknowingly get shallow insights too
- Rejected: the two tasks have different cost/quality curves and should be
  tuned independently. Revisit if cost feedback says otherwise.

### Auto-generate on import / scheduled digest
- Pros: always fresh, no user action needed
- Cons: every import (which can happen multiple times) or every scheduled
  tick spends money whether or not the user ever looks; on-demand +
  cache-per-period gets freshness for free (next view after new data is
  the natural regenerate trigger) without paying for unread output
- Rejected for v1. A scheduled "monthly digest" is a reasonable v2 on top
  of the same generation code, once usage patterns are known.

## Data Model

New table `ai_insights`, RLS-scoped per user like every other table in
`schema.sql`:

```sql
create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  input_hash text not null,        -- hash of the InsightInput payload sent to the model
  model text not null,             -- model actually used, for audit/debugging
  insights jsonb not null,         -- InsightsResult, see schema below
  generated_at timestamptz not null default now(),
  unique (user_id, period_start, period_end)
);

alter table ai_insights enable row level security;
-- same per-user policy shape as transactions / user_preferences
```

`input_hash` lets the UI detect "the underlying data changed since this was
generated" (new imports, edits, re-categorization) without a triggers/
invalidation system: recompute the hash of the current period's
`InsightInput` on view load, compare to the stored hash, and show a
"data has changed — regenerate?" banner instead of silently auto-regenerating
(which would spend money the user didn't ask for).

## Service Layer (`src/services/insights/`)

| File | Responsibility |
|---|---|
| `insight-data.ts` | Pure functions. Builds `InsightInput` for a period from existing aggregator/chart selectors: category totals + prior-period deltas, top merchants, recurring-charge detection (same merchant + similar amount, monthly cadence), month-over-month trend series. No I/O — easy to unit test with fixture transactions. |
| `insight-prompt.ts` | Builds system + user prompt from `InsightInput`, mirroring `transaction-ai.ts`'s prompt-building conventions (plain text, explicit output format instructions). |
| `insight-generator.ts` | Calls Claude (`claude-opus-4-8`, hardcoded) via the same client-side `Anthropic({ apiKey, dangerouslyAllowBrowser: true })` pattern. Parses the JSON response the same defensive way `transaction-ai.ts` does (strip markdown fences, `JSON.parse`, validate/clamp fields) — no `output_config.format` dependency, matching the existing convention rather than introducing a second response-handling style in the same codebase. |
| `insight-cache.ts` | Reads/writes `ai_insights` rows via `src/services/supabase/`, computes `input_hash`, exposes `getCachedInsights(period)` / `saveInsights(period, result)`. |

### `InsightInput` (computed, not sent to the model for verification — the model only sees this)

```ts
interface InsightInput {
  periodStart: string
  periodEnd: string
  homeCurrency: 'USD' | 'UYU'
  categoryTotals: Array<{
    category: Category
    amount: number          // home-currency, already converted
    pctOfTotal: number
    deltaVsPriorPeriod: number  // signed, home-currency
  }>
  topMerchants: Array<{ merchant: string; amount: number; count: number }>
  recurringCharges: Array<{
    merchant: string
    approxAmount: number
    cadence: 'monthly' | 'weekly' | 'irregular'
    monthsSeen: number
  }>
  monthlyTrend: Array<{ month: string; income: number; expense: number }>
}
```

### `InsightsResult` (model output, one call per period)

```ts
interface Insight {
  type: 'bleeding_money' | 'easiest_cut' | 'recurring' | 'trend' | 'anomaly'
  title: string             // short, e.g. "Restaurantes creció 40% este mes"
  narrative: string         // 1-3 sentences, model-authored
  amount?: number           // copied verbatim from InsightInput — never computed by the model
  currency: 'USD' | 'UYU'
  category?: Category
  merchant?: string
  severity: 'low' | 'medium' | 'high'
}

interface InsightsResult {
  insights: Insight[]
}
```

Validation on parse: every `amount`/`category`/`merchant` field must trace
back to a value present in the `InsightInput` that was sent — reject (or drop)
any insight whose numeric field doesn't match a value in the input, the same
way `validateCategory()` in `transaction-ai.ts` clamps an invalid category to
`uncategorized` rather than trusting the model's string.

## UI

- New `View` variant: `'insights'`, added to `AppSidebar`'s `View` union
  and nav list (between Análisis and Categorías).
- `src/components/Insights.tsx`: period selector (this month / last month /
  custom range, reusing `DateRangePicker`), a "Generate" / "Regenerate"
  button, last-generated timestamp, a "data changed" banner when
  `input_hash` mismatches.
- Insight cards grouped by `type`, ordered by `severity`. Each card shows
  the narrative, the hard number (native + `≈ converted` following the
  existing convention from transaction rows), and a "View transactions"
  action that navigates to Transacciones pre-filtered by that
  category/merchant (reuses `TransactionFilters` state).
- Empty state: "Generate your first insights for this period."
- Disabled state: if `ai_enabled` is false or no `claude_api_key` is set,
  show the same prompt-to-Settings treatment already used for
  categorization's AI features (do not invent a second convention).

## Phased Delivery

**Phase 1 (this ADR's scope for a first PR):**
- `category totals` + `deltaVsPriorPeriod` → *bleeding_money* insights
- `recurringCharges` → *recurring* insights (this is what makes the scope
  "broader" than just the two literal questions, and it's cheap: pure
  arithmetic over existing transaction data, no new external calls)
- *easiest_cut* insights derived from a mix of low-essential categories
  (entertainment, shopping, restaurants) with material spend
- Insights view, generation, caching, regeneration banner

**Phase 2 (follow-up):**
- `monthlyTrend` → *trend* narratives across 3+ months
- *anomaly* detection (single-transaction or single-month spikes)
- Cross-period comparisons ("vs. your 3-month average")

## Consequences

- No new backend surface to build, deploy, or secure — consistent with the
  rest of the codebase's AI features.
- Insight-generation cost is bounded to explicit user action (on-demand +
  cache), not proportional to import frequency.
- A stronger model (Opus 4.8) for a single per-period call is materially
  more expensive per-call than Haiku categorization, but low in absolute
  frequency (once per period unless regenerated) — acceptable given BYO-key
  means the user bears their own cost directly.
- Adds one Supabase table + RLS policy, following the existing per-user
  schema shape.
- The deterministic-math discipline means `insight-data.ts` carries real
  logic (recurring-charge detection, delta computation) that needs its own
  test coverage — this is where correctness bugs would actually live, not
  in the LLM call.
