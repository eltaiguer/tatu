# Tatu - Expense Tracker

Tatu is a personal spending-analysis web app for Santander Uruguay bank statements and credit card transactions. Import the CSV exports, let Tatu categorize every movement, and answer two questions: **where has my money gone?** and **how can I spend less?**

Built with React + TypeScript + Vite, backed by Supabase, hosted on Firebase Hosting, and developed with strict red-green TDD.

> Working on the code (human or agent)? The project rules — commands, structure, conventions, testing, definition of done and commit conventions — live in [AGENTS.md](AGENTS.md).

## Features

- CSV import for the 3 Santander Uruguay exports (Credit Card, USD account, UYU account), with automatic format detection and duplicate protection
- Automatic categorization by Uruguayan merchant patterns, learning from your corrections; opt-in AI categorization with your own Claude API key
- Multi-currency (USD + UYU): totals combined into a home currency with an editable exchange rate
- **Resumen**: account cards, month summary, category breakdown, KPIs, charts and top merchants
- **Transacciones**: filtering (search, category, account, type, currency, date, amount), bulk edits, splits, CSV + PDF export
- **Insights**: AI-generated spending insights over your whole history (requires a Claude API key)
- **Categorías**: custom categories, colors and auto-categorization rules
- **Configuración**: theme, home currency, FX rate, AI settings, data management

## Tech stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 + Radix UI
- **State**: Zustand (in-memory; all data lives in Supabase)
- **Charts**: Recharts
- **CSV parsing**: PapaParse
- **Backend**: Supabase (auth + PostgreSQL) — **required**
- **Hosting**: Firebase Hosting
- **Testing**: Vitest + React Testing Library

## Getting started

### Prerequisites

- Node.js 20 (pinned in `.nvmrc` — run `nvm use`) and npm
- A Supabase project. Tatu has no offline or local-only mode: without Supabase you can't sign in and no data is stored.

### 1. Install

```bash
npm install
```

### 2. Set up Supabase

1. Create a Supabase project.
2. In its SQL Editor, run the whole of `supabase/schema.sql` (tables + row-level security). The schema is never applied automatically — see [supabase/README.md](supabase/README.md), and re-run it whenever the file changes.
3. Copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (Project Settings → API; the publishable or legacy anon key)
   - `VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL` — the URL password-reset emails send users back to (e.g. `http://localhost:5173` locally, or your hosted app URL)

Sign-in is email + password (sign up and password reset included).

### Or: local Supabase (Docker)

To run against a throwaway local backend instead of a real project (Docker must be running):

```bash
npm run dev:backend   # starts Supabase in Docker, applies schema, seeds samples/
npm run dev           # log in as dev@tatu.local / tatu-dev-password
npx supabase stop     # when done
```

`dev:backend` writes `.env.local` (which overrides `.env`); delete it to point the app back at your remote project.

### 3. Run

```bash
npm run dev
```

Open the printed URL, create an account and import a CSV (the `samples/` folder has example files).

### Firebase (hosting and analytics only)

The `VITE_FIREBASE_*` variables in `.env.example` are only needed for analytics and deploys; the app runs locally without them and only initializes Firebase when they're set. Hosting config lives in `.firebaserc` and `firebase.json`.

```bash
npm run deploy:firebase   # build + deploy to Firebase Hosting
```

## Common commands

```bash
npm run dev           # dev server
npm run test          # Vitest in watch mode
npm run test:run      # single test run
npm run tdd:verify    # Prettier check + docs path check + tests + lint
npm run ci:check      # tdd:verify + production build (what CI runs)
npm run build         # type-check + production build
npm run preview       # serve the production build
```

The full list, the project structure and the development workflow are in [AGENTS.md](AGENTS.md).

## Contributing

Development follows strict red-green TDD: write a failing test first, make it pass, then refactor; bug fixes start from a failing regression test. Run `npm run tdd:verify` before committing. Commit message format, the definition of done and the rest of the rules are in [AGENTS.md](AGENTS.md).

## CSV file formats

### Credit card transactions

- Metadata: client info, card details, balances
- Columns: Fecha, Número de tarjeta, Número de autorización, Descripción, Importe original, Pesos, Dólares

### Bank accounts (USD/UYU)

- Metadata: account info
- Columns: Fecha, Referencia, Concepto, Descripción, Débito, Crédito, Saldos

## License

Private project for personal use.
