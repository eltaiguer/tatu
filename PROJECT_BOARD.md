# Tatu — Project Board

## Completed

- **Foundation**: CSV parsers for 3 Santander Uruguay formats (Credit Card, USD, UYU), auto-detection, deduplication
- **Categorization**: Pattern-based merchant matching, confidence scores, manual overrides, custom rules — all persisted in Supabase
- **State & persistence**: Zustand store (in-memory), full Supabase backend (auth, transactions, preferences, overrides), Firebase Hosting deploy
- **Dashboard & charts**: Recharts donut, area chart, KPI tiles, top merchants, income vs expenses
- **Transactions**: Unified filter bar (search, category, account, type, currency, date range, amount range), paginated table, bulk actions, edit modal with apply-scope
- **Multicurrency**: `homeCurrency` + editable `fxRate`, combined totals in Resumen (charts live in `Dashboard.tsx`, not a separate Análisis view) + Insights, native amounts in transaction rows
- **Redesign**: Sidebar navigation (overview / transactions / insights / categories / settings), warm token palette, Spectral + Hanken Grotesk + JetBrains Mono typography
- **Refactor**: Hooks extracted from App.tsx (`useAuthSession`, `useUserPreferences`, `useTransactionHandlers`, `useTransactionSync`, `useTransactionFiltering`), Transactions.tsx split into sub-components
- **Export**: CSV + PDF from filtered transaction view
- **AI Insights (Phase 1)**: new Insights sidebar view — Claude-generated (Opus 4.8) spending insights per month, cached in Supabase (`ai_insights` table), deterministic math only (category totals, deltas, recurring-charge detection all computed client-side, model only ranks/narrates). See ADR-0001 (`docs/decisions/0001-ai-spending-insights.md`).

## Next

**AI Insights (Phase 2)** — trend narratives across 3+ months and anomaly/spike detection, per ADR-0001.

**AI-powered categorization** — improve accuracy and confidence scores using an LLM or smarter heuristics.

## Icebox

- Exchange rate API integration (live FX rates)
- Budget tracking (set category budgets, alerts)
- Mobile / PWA
