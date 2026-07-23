# CLAUDE.md - Tatu Expense Tracker

## What is this project?

Tatu is a personal finance web app for managing Santander Uruguay bank statements and credit card transactions. It parses CSV exports, auto-categorizes transactions by Uruguayan merchant patterns, and provides dashboards, charts, filtering, and export features. Multi-currency (USD + UYU) with home-currency conversion.

**Core purpose:** Tatu is a "forensic" spending analysis tool, not just a bookkeeping tracker. Every feature — categorization, dashboards, charts, trends — exists to help the user answer the two questions that matter: **Where has my money gone?** and **How can I spend less money?** When designing or evaluating a feature, favor choices that surface insight and actionable patterns over ones that just display data.

The app is fully online — authentication and data persistence require Supabase. There is no offline/localStorage fallback. Deployed on Firebase Hosting.

## Tech stack

- **Frontend**: React 18 + TypeScript (strict mode) + Vite
- **Styling**: Tailwind CSS 4 + Radix UI primitives + CSS variables for theming
- **State**: Zustand (in-memory, no persist middleware — all persistence is Supabase)
- **Charts**: Recharts
- **Backend**: Supabase (auth + PostgreSQL, required — app won't function without it)
- **Hosting**: Firebase Hosting
- **Testing**: Vitest + React Testing Library (796 tests, 76 test files)

## Commands

```bash
npm run dev              # Start dev server
npm run build            # TypeScript check + Vite build
npm run test             # Vitest in watch mode
npm run test:run         # Single test run
npm run tdd:watch        # Alias for vitest watch (TDD loop)
npm run tdd:verify       # Tests + lint
npm run ci:check         # Tests + lint + build (full CI)
npm run lint             # ESLint (zero warnings enforced)
npm run format           # Prettier
npm run deploy:firebase  # Build + deploy to Firebase
```

## Project structure

```
src/
  components/              # React UI components
    ui/                    # Radix UI primitives (shadcn/ui style)
    AppSidebar.tsx         # Fixed 252px sidebar, navigation, user footer
    Dashboard.tsx          # Resumen view — account cards, month summary, top categories, KPI tiles, donut, area chart, merchants (charts live here, not a separate view)
    Transactions.tsx       # Transactions view — unified filter bar, table, pagination
    Insights.tsx           # Insights view — AI-generated spending insights (period selector, generate/regenerate, grouped cards)
    Categories.tsx         # Categorías view — category grid + auto-categorization rules
    Settings.tsx           # Configuración view — theme, currency, account, data management
    ImportCSV.tsx          # CSV import flow (wrapped in Radix Dialog, not a view)
    AccountCard.tsx        # Account summary card with balance + footer
    CategoryBreakdownList.tsx  # Ranked category list with progress bars
    FxChip.tsx             # Editable FX rate chip (click to edit inline)
    TransactionFilters.tsx # Unified filter bar (search, category, account, type, currency, date, amount)
    TransactionTable.tsx   # Transaction rows, selection, confidence meter, row actions
    EditTransactionDialog.tsx  # Edit modal: description, category, apply-scope
    BulkEditDialog.tsx     # Bulk categorization modal
    CategoryBadge.tsx      # Category badge with color dot
    ConfidenceBadge.tsx    # 3-bar confidence meter
    DateRangePicker.tsx    # Date range input pair
    AuthCard.tsx           # Login / signup / password-reset form
    TatuLogo.tsx           # Armadillo-shell SVG brand mark
  hooks/                   # Custom React hooks (extracted from App.tsx)
    useAuthSession.ts      # Supabase auth session management
    useUserPreferences.ts  # Theme, homeCurrency, fxRate — synced to Supabase
    useTransactionHandlers.ts  # All transaction mutation handlers
    useTransactionSync.ts  # Loads transactions from Supabase on login
    useTransactionFiltering.ts # Filter + sort + paginate transactions
  services/
    parsers/               # CSV parsing (credit-card, bank-account, auto-detection)
    categorizer/           # Merchant pattern matching + auto-categorization
    aggregator/            # Data grouping + summaries
    filters/               # Transaction filtering + search
    export/                # CSV/PDF export
    charts/                # Chart data transformations
    currency/              # convert(amount, from, to, rate) + Currency type
    descriptions/          # Description override management
    transfers/             # Internal transfer detection
    ai/                    # Client-side Claude integration (BYO API key): transaction categorization/enrichment
    insights/              # AI spending insights: deterministic InsightInput builder, prompt, generator, cache (ADR-0001)
    supabase/              # Auth, transactions, preferences, overrides, custom patterns, ai_insights
    firebase.ts            # Firebase config
  models/                  # TypeScript interfaces + Category enum
  stores/                  # Zustand store (transaction-store, in-memory only)
  styles/
    fonts.css              # Google Fonts: Spectral, Hanken Grotesk, JetBrains Mono
    theme.css              # CSS custom properties — light + dark tokens
    category-colors.css    # Per-category color variables
    index.css              # Import order: fonts → tailwind → theme (single source)
  utils/                   # Helpers (date-utils, formatting, category-display, memo)
  test/                    # Vitest setup
supabase/
  schema.sql               # PostgreSQL schema (tables, RLS policies)
samples/                   # Example Santander CSV files for testing
```

## Navigation & views

The app uses a fixed 252px sidebar (`AppSidebar.tsx`). The `View` type lives in `AppSidebar`:

```ts
type View = 'overview' | 'transactions' | 'insights' | 'categories' | 'settings'
```

- **General**: Resumen (`overview`), Transacciones (`transactions`), Insights (`insights`)
- **Gestión**: Categorías (`categories`), Configuración (`settings`)
- Import is a Radix `Dialog` overlay triggered from the sidebar and from Settings — not a view.
- There is no separate "Análisis" view or `Charts.tsx` — chart/KPI rendering (donut, area chart, top merchants) lives directly inside `Dashboard.tsx` (Resumen).

## Multicurrency model

Users earn in USD and spend in both USD and UYU. The app converts and combines both into a **home currency** for dashboard and insight totals:

- `homeCurrency` (`'USD' | 'UYU'`) + `fxRate` (number, default `40.5`) — managed in `useUserPreferences`, persisted in Supabase `user_preferences`
- `convert(amount, from, to, rate)` lives in `services/currency/convert.ts`
- Resumen + Insights: all totals convert + combine into `homeCurrency` (Insights' `InsightInput` is built entirely from already-converted, pre-computed numbers — see ADR-0001)
- Transaction rows: native amount is primary; faint `≈ converted` shown when tx currency ≠ home
- **Currency is a filter** in Transacciones (show USD or UYU rows) — not a view splitter
- `FxChip` lets users edit the rate inline on the dashboard; Settings exposes a numeric input

## Persistence model

- **Transactions, categories, overrides, custom patterns, preferences**: all in Supabase (PostgreSQL)
- **Auth session token**: cached in `localStorage` by the Supabase client (standard Supabase auth behavior, not app data)
- **Zustand store**: holds in-memory state only — no persist middleware. Populated from Supabase on login via `useTransactionSync`
- No offline fallback. Unauthenticated users see the `AuthCard` login screen.

## Testing approach

Behavior testing — tests verify what the system does, not how it does it.

- Test user-visible outcomes, not internal state
- Write tests alongside implementation (not strictly test-first)
- For bug fixes: a regression test covering the fixed behavior is expected
- Run `npm run tdd:verify` (tests + lint) before considering work done

## Commit conventions

- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for refactors
- `test:` for test-only commits
- Each commit should have passing tests

## Code conventions

- **Formatting**: Prettier — no semicolons, single quotes, 2-space indent, trailing commas (es5), 80 char width
- **Linting**: ESLint with `@typescript-eslint` — zero warnings allowed
- **File naming**: kebab-case for files, PascalCase for components
- **Types**: PascalCase, defined in `src/models/`, exported through `src/models/index.ts`
- **Constants**: UPPER_SNAKE_CASE (e.g., `CATEGORY_LABELS`, `CATEGORY_ICONS`)
- **Tests**: Colocated with source files as `.test.ts` / `.test.tsx`
- **State**: Zustand with `createStore` (vanilla, SSR-ready), no persist middleware
- **Categories**: 17-value `Category` enum with Spanish labels, emoji icons, and hex colors
- **Typography**: Spectral (display/greeting only), Hanken Grotesk (all UI), JetBrains Mono (all amounts). Defined once in `src/styles/fonts.css` + `theme.css` — do not add other font sources.
- **Amounts/numbers**: always use `.amt` CSS class or `font-mono` Tailwind class + `tabular-nums`

## Key domain concepts

- **Transaction sources**: Credit Card, USD Bank Account, UYU Bank Account (3 distinct CSV formats from Santander Uruguay)
- **Categorization**: Pattern-based merchant matching (`merchant-patterns.ts`) with confidence scores (0–1). System learns from user overrides stored in Supabase.
- **Deduplication**: Hash-based transaction IDs prevent duplicate imports
- **Internal transfers**: Auto-detected between accounts on same date/amount
- **apply-scope**: When editing a transaction's category — `single` / `matching_past_and_future` / `future_matching_only` — handled by `handleUpdateTransaction` in `useTransactionHandlers`

## Environment

Requires `.env` with Supabase vars (see `.env.example`):
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — required for auth + all data
- `VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL` — for password reset emails
- `VITE_FIREBASE_*` — Firebase Hosting + analytics (optional for local dev)

## Current status

Redesign complete: sidebar navigation, 5 views, multicurrency with FxChip. Architectural refactor complete: hooks extracted from App.tsx, store simplified, large components split. Deployed to Firebase Hosting. 796 tests passing.

AI Insights Phase 1 shipped (ADR-0001, `docs/decisions/0001-ai-spending-insights.md`): new Insights view generates Claude-powered spending insights per month, cached in Supabase (`ai_insights` table — requires a manual `schema.sql` apply, see `supabase/README.md`). Client-side, BYO API key, same pattern as `services/ai/`.

**Next initiative**: AI Insights Phase 2 (trend/anomaly narratives across 3+ months, per ADR-0001), and AI-powered categorization — improve transaction categorization accuracy and confidence scores using an LLM or smarter heuristics.
