# AGENTS.md - Tatu Expense Tracker

The canonical, tool-agnostic rules for any coding agent (or human) working in this repo. Tool-specific notes live elsewhere (`CLAUDE.md` imports this file and adds Claude Code specifics); they must not restate or contradict what is here.

## What is this project?

Tatu is a personal finance web app for managing Santander Uruguay bank statements and credit card transactions. It parses CSV exports, auto-categorizes transactions by Uruguayan merchant patterns, and provides dashboards, charts, filtering, and export features. Multi-currency (USD + UYU) with home-currency conversion.

**Core purpose:** Tatu is a "forensic" spending analysis tool, not just a bookkeeping tracker. Every feature — categorization, dashboards, charts, trends — exists to help the user answer the two questions that matter: **Where has my money gone?** and **How can I spend less money?** When designing or evaluating a feature, favor choices that surface insight and actionable patterns over ones that just display data.

The app is fully online — authentication and data persistence require Supabase. There is no offline/localStorage fallback. Deployed on Firebase Hosting.

**Read next:** [`docs/CONTEXT.md`](docs/CONTEXT.md) (glossary Spanish UI ↔ English code, UI copy/voseo guide) · [`docs/architecture.md`](docs/architecture.md) (import/sync flow, categorizer precedence, money conversion, persistence) · [`docs/decisions/`](docs/decisions/README.md) (ADR index + template).

Historical design material (e.g. the 2026-06 redesign handoff, deleted in #129) survives only in git history and is not a source of truth — the code and the docs above are.

## Tech stack

- **Frontend**: React 18 + TypeScript (strict mode) + Vite
- **Styling**: Tailwind CSS 4 + Radix UI primitives + CSS variables for theming
- **State**: Zustand (in-memory, no persist middleware — all persistence is Supabase)
- **Charts**: Recharts
- **Backend**: Supabase (auth + PostgreSQL, required — app won't function without it)
- **Hosting**: Firebase Hosting
- **Testing**: Vitest + React Testing Library (tests colocated with source)

## Commands

```bash
npm run dev              # Start dev server
npm run build            # tsc + vite build
npm run preview          # Serve the production build
npm run test             # Vitest in watch mode
npm run test:run         # Single test run
npm run test:ui          # Vitest UI
npm run test:coverage    # Vitest with v8 coverage
npm run tdd:watch        # Alias for vitest watch (TDD loop)
npm run tdd:verify       # format:check + check:docs + test:run + lint
npm run ci:check         # tdd:verify + build (full CI)
npm run check:docs       # Fail if agent-facing docs name repo paths that don't exist
npm run lint             # ESLint (zero warnings enforced)
npm run format           # Prettier --write over the whole repo
npm run format:check     # Prettier --check over the whole repo (Markdown too)
npm run deploy:firebase  # Build + deploy to Firebase
npm run dev:backend      # Local Supabase in Docker: schema + seeded dev user, writes .env.local
npx vitest run <path>    # Run one test file (or a directory)
```

Node 20 (`.nvmrc`). CI runs `tdd:verify` then `build`; `build`'s `tsc` type-checks test files too, so a type error in a test fails CI.

## Project structure

```
src/
  components/              # React UI components
    ui/                    # Radix primitives (shadcn/ui style) + app ones: page-header, segmented-toggle, icon-tile, native-select
    AppSidebar.tsx         # Fixed 252px sidebar, navigation, user footer
    Dashboard.tsx          # Resumen view — account cards, month summary, top categories, KPI tiles, donut, area chart, merchants (charts live here, not a separate view)
    Transactions.tsx       # Transactions view — unified filter bar, table, pagination
    Insights.tsx           # Insights view — AI-generated spending insights over the user's entire history (generate/regenerate, grouped cards)
    Categories.tsx         # Categorías view — category grid + auto-categorization rules
    categories/            # Categorías sub-components: CategoryForm, CategoryCard, PatternRulesCard (rules form + list, owns its state)
    Settings.tsx           # Configuración view — theme, currency, account, data management
    ImportCSV.tsx          # CSV import flow (wrapped in Radix Dialog, not a view)
    CategoryBreakdownList.tsx  # Ranked category list with progress bars
    FxChip.tsx             # Editable FX rate chip (click to edit inline)
    CurrencyToggle.tsx     # Home-currency switch
    TransactionFilters.tsx # Unified filter bar (search, category, account, type, currency, date, amount)
    TransactionTable.tsx   # Transaction rows, selection, confidence meter, row actions
    EditTransactionDialog.tsx  # Edit modal: owns the draft (description, category, tags, apply-scope) + validation; emits it via one onSave
    BulkEditDialog.tsx     # Bulk categorization modal
    SplitTransactionDialog.tsx # Split one transaction into parts (see is_split_parent / split_parent_id)
    ConfirmDialog.tsx      # Shared confirmation modal
    CategoryBadge.tsx      # Category badge with color dot
    ConfidenceBadge.tsx    # 3-bar confidence meter
    Onboarding.tsx         # First-run empty state (no transactions yet)
    EmptyState.tsx         # Generic empty state
    StateSkeletons.tsx     # Loading skeletons for dashboard + transaction table
    ConnectionLostState.tsx    # Supabase unreachable — retry affordance
    AuthCard.tsx           # Login / signup / password-reset form
    TatuLogo.tsx           # Armadillo-shell SVG brand mark
    CategoryChangesCard.tsx    # Resumen "what changed": category spend vs prior months
    ViewErrorBoundary.tsx  # Catches a failed view (e.g. lazy chunk) — reload affordance
    dev/                   # Developer tooling rendered inside Settings:
                           #   CoverageAnalysis, AiCategorizationPreview, AiPatternAnalysis
  hooks/                   # Custom React hooks (extracted from App.tsx)
    useAuthSession.ts      # Supabase auth session management
    useUserWorkspace.ts    # Binds the workspace store: hydrates on sign-in, exposes prefs + setters + load status
    useTransactionHandlers.ts  # The transaction mutations bound to the signed-in user's repository (thin; one contract without one)
    useTransactionFiltering.ts # Filter + sort + paginate transactions
    useClickOutside.ts     # Dismiss popovers/menus on outside click
  services/
    parsers/               # CSV parsing (credit-card, bank-account, auto-detection)
    categorizer/           # Merchant pattern matching + auto-categorization; import-categorization.ts categorizes parsed rows (parsers are pure)
    dedup/                 # import-dedup.ts: content fingerprint + multiset import classification (#57)
    repository/            # The persistence port (#119): repository.ts (Repository, TransactionPatch: absent = untouched, null = clear), supabase-repository.ts (prod), in-memory-repository.ts (tests: fault injection, hold), batching.ts (≤100-id .in() chunks settled independently, sequential 500-row import inserts)
    mutations/             # transaction-mutations.ts: every transaction write, once — import, apply-scope + override pair, delete/undo, split/unsplit, bulk edits; screen mirrors database (PartialWriteError + retry of the failed remainder)
    categories/            # Category registry + user custom categories (source of isCategoryIgnored); category-counts.ts: rows per category
    filters/               # url-filters.ts: Transacciones filters <-> URL query (the filtering itself is useTransactionFiltering)
    export/                # CSV/PDF export: writes exactly the rows it is given + a cuenta_en_totales column
    spending/              # spending-rules.ts: THE rule for which rows count (countsAsRow, countsTowardTotals, isCountedExpense) — never re-derive it
    merchants/             # merchant-key.ts: THE merchant key + label (Mayores comercios, its drill-through, Insights, recurring) — never group by description
    charts/                # Home-currency aggregation (chart-data.ts: totals, categories, merchants); category-changes.ts feeds CategoryChangesCard
    currency/              # convert(amount, from, to, rate) + Currency type
    suggestions/           # suggestions.ts: category/tag suggestion lists + search filters shared by the edit dialogs
    descriptions/          # Description override management
    transfers/             # Internal transfer detection
    ai/                    # Client-side Claude (BYO API key): categorization/enrichment; models.ts is the only place model IDs live
    preferences/           # DEFAULT_PREFERENCES (what a user without a prefs row gets)
    insights/              # AI spending insights: deterministic InsightInput builder, prompt, generator, cache (ADR-0001)
    supabase/              # Auth, transactions, preferences, overrides, custom patterns, ai_insights, import-runs, reset (wipe user data); single-request primitives the Supabase adapter composes. No ambient session: callers pass a session or a repository
    firebase.ts            # Firebase config
  App.tsx / main.tsx       # Shell (auth, sync, view switch) / BrowserRouter mount
  routes.ts                # View <-> URL path + document title
  lazy-views.tsx           # The five views as lazy chunks (retryable, preloadViews)
  router-future.ts         # React Router v7 future flags (app + test routers)
  models/                  # TypeScript interfaces + Category enum
  stores/                  # Zustand stores, in-memory only: transaction-store; workspace-store = the ONE owner of per-user state (hydrateWorkspace / teardownWorkspace / setPreference), loaded through the repository port; workspace-state = whose workspace is loaded (isWorkspaceOwner, checked by every write after an await)
  index.css                # CSS entry (imported by main.tsx): fonts → tailwind → theme
  styles/
    fonts.css              # Google Fonts: Spectral, Hanken Grotesk, JetBrains Mono
    tailwind.css           # Tailwind 4 import + sources
    theme.css              # CSS custom properties — light + dark tokens
                           # (+ theme.test.ts / typography.test.ts) — category colours live in the category registry
  utils/                   # date-utils, formatting, category-display, memo, transaction-display, user-display, user-error, auth-errors
  test/                    # Vitest setup + console guard (unexpected console.error/warn fails a test); csv-download.ts captures an exported CSV
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
- Charts/KPIs (donut, area chart, top merchants) live inside `Dashboard.tsx` (Resumen); there is no separate charts view.
- Views load lazily (`lazy-views.tsx`) inside `ViewErrorBoundary` + `Suspense` in `App.tsx`.

### Routing

`react-router-dom`; the URL is the source of truth for the view. `src/routes.ts` maps `View` ↔ path (`pathForView`, `viewFromPath`, `titleForView`):

- `/` Resumen · `/transacciones` · `/insights` · `/categorias` · `/configuracion`
- Unknown paths render Resumen without redirecting (a redirect could drop a password-recovery hash). Matching ignores case and trailing slashes.
- Transacciones filters live in the query string (`services/filters/url-filters.ts`, e.g. `?categoria=restaurants&periodo=2026-03`), written with `replace`. Drill-throughs from Resumen call `onNavigateToTransactions(filter)` → `filterToSearch`.
- Adding a view: extend `View` + the sidebar nav in `AppSidebar.tsx`, both records in `routes.ts`, a loader in `lazy-views.tsx`, and the render branch in `App.tsx`.

## Multicurrency model

Users earn in USD and spend in both USD and UYU. The app converts and combines both into a **home currency** for dashboard and insight totals:

- `homeCurrency` (`'USD' | 'UYU'`) + `fxRate` (number, default `40.5`) — owned by `stores/workspace-store.ts` (exposed via `useUserWorkspace`), persisted in Supabase `user_preferences`
- `convert(amount, from, to, rate)` lives in `services/currency/convert.ts`
- Resumen + Insights: all totals convert + combine into `homeCurrency` (Insights' `InsightInput` is built entirely from already-converted, pre-computed numbers — see ADR-0001)
- Transaction rows: native amount is primary; faint `≈ converted` shown when tx currency ≠ home
- **Currency is a filter** in Transacciones (show USD or UYU rows) — not a view splitter
- `FxChip` lets users edit the rate inline on the dashboard; Settings exposes a numeric input

## Persistence model

- **Transactions, categories, overrides, custom patterns, preferences**: all in Supabase (PostgreSQL)
- **Auth session token**: cached in `localStorage` by the Supabase client (standard Supabase auth behavior, not app data)
- **Zustand store**: holds in-memory state only — no persist middleware. Populated from Supabase on login by `hydrateWorkspace` (`stores/workspace-store.ts`)
- No offline fallback. Unauthenticated users see the `AuthCard` login screen.
- **Per-user lifecycle** (#117): `stores/workspace-store.ts` is the only place that fills (`hydrateWorkspace`) or empties (`teardownWorkspace`) a user's in-memory state — transactions, overrides, custom patterns/categories, preferences, AI config. Every path that ends a session calls `teardownWorkspace`; new per-user state must be added there. Preferences are saved only by `setPreference`, only for the user whose workspace is loaded and ready.
- **Writes** (#119): every transaction write is a function in `services/mutations/transaction-mutations.ts` that takes the signed-in user's `Repository` (`services/repository/`) — never an ambient session. Each change is one `TransactionPatch` per row applied to the repository and then, for exactly the rows the server confirmed, to the store ("screen mirrors database"); a partial write throws `PartialWriteError` (toast "Se actualizaron N de M — reintentar", retry = only the failed remainder). After every await a write checks `isWorkspaceOwner` and drops its local changes if another user signed in. Rule stores (custom patterns, custom categories) take the repository explicitly too. Test writes against `createInMemoryRepository` and assert on the store and the repository, not on request payloads.

## Testing approach: strict red-green TDD

Every behavior change is driven by a test, written first:

1. **Red** — write a test for the behavior you're about to add or change. Run it and watch it fail **for the right reason** (the assertion about the missing behavior fails — not an import error, typo or broken fixture).
2. **Green** — write the minimal code that makes it pass.
3. **Refactor** — clean up with the tests green.

- **Bug fixes start from a failing regression test** that reproduces the bug, before touching the fix.
- Behavior testing — tests verify what the system does, not how it does it. Test user-visible outcomes, not internal state or implementation details.
- Any `console.error` / `console.warn` during a test fails it (`src/test/setup.ts`). When a test expects a log, spy on it and assert it: `vi.spyOn(console, 'error').mockImplementation(() => {})` + `expect(spy).toHaveBeenCalledWith(...)`. Test routers use `future={ROUTER_FUTURE}` (`src/router-future.ts`), same as the app
- `App.test.tsx` and `App.supabase.test.tsx` are the slow integration suites (full-app render, several seconds per test); run single files while iterating (`npm run tdd:watch` or `npx vitest run <path>`). `testTimeout` is 20s on purpose (#78) — don't add retries.
- Docs-only and tooling-only changes with no behavior to test are the exception; they still have to pass `npm run tdd:verify`.

## Definition of done

A task is done only when:

- The new/changed behavior is covered by tests that were seen failing first (red-green above); bug fixes include their regression test.
- Existing behavior remains covered — no deleted or skipped tests without an explanation.
- `npm run tdd:verify` (Prettier check + `check:docs` + tests + lint) was run and passes. `npm run build` also passes when TypeScript changed (`tsc` type-checks test files too, and CI runs it).
- Docs that describe the changed code (this file, `docs/architecture.md`, `docs/CONTEXT.md`, ADRs) are updated in the same change.

## Commit conventions

- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for refactors
- `test:` for test-only commits
- `docs:` / `chore:` for docs and tooling
- Each commit should have passing tests
- Keep changes small and logically scoped — one concern per PR
- PR bodies follow `.github/pull_request_template.md` (RED/GREEN evidence, `tdd:verify`, schema change, linked issue); new issues use the forms in `.github/ISSUE_TEMPLATE/`, which apply `needs-triage`
- **Schema changes**: a PR that changes `supabase/schema.sql` must say so in its body (the SQL is applied by hand — see `supabase/README.md`; CI labels it `schema-change`). Never merge it unattended — tag it `needs-human-review` and leave the merge to a human.

## Code conventions

- **Formatting**: Prettier — no semicolons, single quotes, 2-space indent, trailing commas (es5), 80 char width
- **Linting**: ESLint with `@typescript-eslint` — zero warnings allowed
- **File naming**: kebab-case for files, PascalCase for components
- **Types**: PascalCase, defined in `src/models/`, exported through `src/models/index.ts`
- **Constants**: UPPER_SNAKE_CASE (e.g., `CATEGORY_LABELS`, `CATEGORY_ICONS`)
- **Tests**: Colocated with source files as `.test.ts` / `.test.tsx`
- **State**: Zustand with `createStore` (vanilla, SSR-ready), no persist middleware
- **Language**: UI copy is Spanish (rioplatense); code, comments and identifiers are English. User-facing errors go through `utils/user-error.ts` (`UserFacingError`, `userErrorMessage`) so raw Supabase/English text never reaches a toast.
- **Categories**: `Category` enum with Spanish labels, emoji icons, and hex colors
- **Typography**: Spectral (display/greeting only), Hanken Grotesk (all UI), JetBrains Mono (all amounts). Defined once in `src/styles/fonts.css` + `theme.css` — do not add other font sources.
- **Amounts/numbers**: always use `.amt` CSS class or `font-mono` Tailwind class + `tabular-nums`

## Key domain concepts

- **Transaction sources**: Credit Card, USD Bank Account, UYU Bank Account (3 distinct CSV formats from Santander Uruguay)
- **Categorization**: Pattern-based merchant matching (`merchant-patterns.ts`) with confidence scores (0–1). System learns from user overrides stored in Supabase. Optional AI enrichment on import (see Current status).
- **Deduplication**: by content, not ID — imports match rows by fingerprint (source, raw date, raw description, signed amount, currency) as a multiset, deleted rows included; a taken ID gets a salted `_cN` suffix (`services/dedup/import-dedup.ts`, #57). IDs (hash incl. row position) are unchanged
- **Internal transfers**: inferred in the store (`inferInternalTransfers`) by keyword + scored debit/credit pairing within ±2 days, recomputed on load — see `docs/architecture.md`
- **apply-scope**: When editing a transaction's category — `single` / `matching_past_and_future` / `future_matching_only` — handled by `editTransaction` in `services/mutations/transaction-mutations.ts`

## Environment

Requires `.env` with Supabase vars (see `.env.example`):

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — required for auth + all data
- `VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL` — for password reset emails
- `VITE_FIREBASE_*` — Firebase Hosting + analytics (optional for local dev)

**Running the app locally** (no production data): `npm run dev:backend` (needs Docker) then `npm run dev`, log in as `dev@tatu.local` / `tatu-dev-password`. `dev:backend` writes `.env.local`, which overrides `.env`; delete it to point the app back at the remote project. `npx supabase stop` tears the stack down.

## Current status

Redesign complete: sidebar navigation, 5 routed views, multicurrency with FxChip. Hooks extracted from App.tsx; store simplified. Deployed to Firebase Hosting. Test counts and line counts are deliberately not recorded here — they go stale within a PR.

**Known shape of the code:** `Transactions.tsx` and `Dashboard.tsx` are very large — the refactor extracted hooks, not view components, so both define their sub-components inline at the top of the file. #140 moves them out one view per PR into `src/components/<view>/`; Categorías is done (`components/categories/`).

**AI categorization (shipped):** with AI enabled and a BYO Claude key in Configuración, `importTransactions` (`services/mutations/transaction-mutations.ts`) sends new transactions without a user override through `enrichTransactionsWithAi` (`services/ai/transaction-ai.ts`), with the user's past corrections as context (`correction-context.ts`). Best-effort: a failure keeps the pattern-based result. Model = the `aiModel` preference (Haiku/Sonnet, `services/ai/models.ts`). Dev panels in Settings preview it.

**AI Insights (shipped**, ADR-0001 + ADR-0002, `docs/decisions/000{1,2}-*.md`): Claude-generated spending insights over the user's **entire transaction history** (no period navigation — ADR-0002), using the stronger `INSIGHTS_MODEL`, cached in Supabase (`ai_insights`, one row per user — requires a manual `schema.sql` apply, see `supabase/README.md`).

**Next initiative**: per-category cross-period comparisons for Insights — `InsightInput.categoryTotals` is still all-time only, so add a `categoryTotals × month` breakdown and let `bleeding_money` insights detect spend that's _growing_, not just spend that _dominates_ (ADR-0002 trade-offs; Resumen's `CategoryChangesCard` already does a month-vs-median view). Anomaly/spike detection fits the same breakdown. Then better AI categorization accuracy and confidence scores on top of what ships today.

**Icebox** (not planned; GitHub issues are the source of truth for work): live FX rates from an exchange-rate API, category budgets with alerts, mobile / PWA.
