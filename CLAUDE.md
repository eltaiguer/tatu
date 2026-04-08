# CLAUDE.md - Tatu Expense Tracker

## What is this project?

Tatu is a personal finance web app for managing Santander Uruguay bank statements and credit card transactions. It parses CSV exports, auto-categorizes transactions by Uruguayan merchant patterns, and provides dashboards, charts, filtering, and export features. Multi-currency (USD + UYU).

## Tech stack

- **Frontend**: React 18 + TypeScript (strict mode) + Vite
- **Styling**: Tailwind CSS 4 + Radix UI primitives + CSS variables for theming
- **State**: Zustand with localStorage persistence
- **Charts**: Recharts
- **Backend (optional)**: Supabase (auth + PostgreSQL) + Firebase Hosting
- **Testing**: Vitest + React Testing Library (445 tests, 53 test files)

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
  components/          # React UI components
    ui/                # Radix UI primitives (shadcn/ui style)
  services/
    parsers/           # CSV parsing (credit-card, bank-account, auto-detection)
    categorizer/       # Merchant pattern matching + auto-categorization
    aggregator/        # Data grouping + summaries
    filters/           # Transaction filtering + search
    export/            # CSV/PDF export
    charts/            # Chart data transformations
    descriptions/      # Description override management
    transfers/         # Internal transfer detection
    supabase/          # Supabase auth + sync
    firebase.ts        # Firebase config
  models/              # TypeScript interfaces + Category enum
  stores/              # Zustand stores (transaction-store)
  styles/              # CSS variables, design tokens, category colors
  hooks/               # Custom React hooks (useTheme)
  utils/               # Helpers (date-utils, category-display)
  test/                # Vitest setup
supabase/
  schema.sql           # PostgreSQL schema (tables, RLS policies)
samples/               # Example Santander CSV files for testing
```

## Testing approach

Behavior testing — every feature and bug fix should have tests that verify observable behavior, not implementation details. Tests should describe what the system does, not how it does it.

- Test user-visible outcomes, not internal state
- Write tests alongside implementation (not strictly test-first)
- For bug fixes: a regression test covering the fixed behavior is expected
- Run `npm run tdd:verify` (tests + lint) before considering work done

## Commit conventions

- `test:` for RED phase (test files)
- `feat:` for GREEN phase (new features)
- `fix:` for bug fixes
- `refactor:` for REFACTOR phase
- Each commit should have passing tests

## Code conventions

- **Formatting**: Prettier — no semicolons, single quotes, 2-space indent, trailing commas (es5), 80 char width
- **Linting**: ESLint with `@typescript-eslint` — zero warnings allowed
- **File naming**: kebab-case for files, PascalCase for components
- **Types**: PascalCase, defined in `src/models/`, exported through `src/models/index.ts`
- **Constants**: UPPER_SNAKE_CASE (e.g., `CATEGORY_LABELS`, `CATEGORY_ICONS`)
- **Tests**: Colocated with source files as `.test.ts` / `.test.tsx`
- **State**: Zustand with `createStore` (vanilla, SSR-ready) + persist middleware
- **Categories**: 17-value `Category` enum with Spanish labels, emoji icons, and hex colors

## Key domain concepts

- **Transaction sources**: Credit Card, USD Bank Account, UYU Bank Account (3 distinct CSV formats from Santander Uruguay)
- **Categorization**: Pattern-based merchant matching (`merchant-patterns.ts`) with confidence scores (0-1). System learns from user overrides.
- **Deduplication**: Hash-based transaction IDs prevent duplicate imports
- **Internal transfers**: Auto-detected between accounts on same date/amount

## Environment

App works fully offline (localStorage only). Optional cloud features require `.env` vars — see `.env.example`:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase auth + sync
- `VITE_FIREBASE_*` — Firebase Hosting + analytics

## Current status

Heats 1-7 complete. Heat 8 (Production Readiness & Firebase Deploy) in progress — task 8.2 (Firebase deployment) is next. Heat 9 (Currency & Insights) is deferred. See `PROJECT_BOARD.md` for full roadmap.
