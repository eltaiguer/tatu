# Tatu - Expense Tracker

Web-based expense tracker for Santander Uruguay bank statements and credit card transactions.

Built with **React + TypeScript + Vite** following strict **TDD** principles.

## Features

- Multi-currency support (USD + UYU)
- Automatic category inference from merchant names
- CSV import for 3 file types (Credit Card, USD Account, UYU Account)
- Dashboard with visualizations
- Advanced filtering and debounced search with highlights
- Export capabilities (CSV + PDF)
- Custom categories, colors, and merchant rules

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Testing**: Vitest + React Testing Library
- **CSV Parsing**: PapaParse
- **State Management**: Zustand
- **Charts**: Recharts
- **Backend (optional)**: Supabase / Firebase

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Supabase (Optional)

If you want authentication + cloud persistence enabled:

1. Copy `.env.example` to `.env`
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. Set `VITE_SUPABASE_PASSWORD_RESET_REDIRECT_URL` to your hosted app URL
   (example: `https://tatu-fdba8.web.app`)
4. Run the SQL in `supabase/schema.sql` inside your Supabase project

When these variables are present, the app enables login and stores
transactions in Supabase.

Auth flow includes:
- Email/password sign in and sign up
- Password reset email request
- Automatic migration of existing local transactions after first login
- Automatic migration of local category overrides and custom categories
- Import run tracking (`import_runs`) for upload observability

### Firebase (Optional)

If you want Firebase enabled, copy `.env.example` to `.env` and fill in the
`VITE_FIREBASE_*` values. The app will only initialize Firebase when required
variables are present.

### Development

```bash
# Start dev server
npm run dev

# Run tests (watch mode)
npm test

# Run tests (single run)
npm test -- --run
# or
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# TDD verification (tests + lint)
npm run tdd:verify

# Format code
npm run format
```

### Build

```bash
npm run build
npm run preview
```

### Deploy (Firebase Hosting)

```bash
# Build production assets
npm run build

# Deploy to Firebase Hosting
npx firebase-tools deploy
```

Firebase config lives in `.firebaserc` and `firebase.json`.

## Project Structure

```
tatu/
├── samples/                     # Sample CSV files
├── src/
│   ├── components/             # React UI components (sidebar, views, dialogs)
│   ├── hooks/                  # Custom React hooks (auth, preferences, handlers)
│   ├── services/               # Business logic (parsers, categorizer, export, currency, supabase)
│   ├── models/                 # TypeScript interfaces + Category enum
│   ├── stores/                 # Zustand store (in-memory, Supabase-backed)
│   ├── styles/                 # CSS tokens, fonts, theme (light + dark)
│   ├── utils/                  # Helpers (dates, formatting, category display)
│   ├── App.tsx
│   └── main.tsx
├── supabase/
│   └── schema.sql              # PostgreSQL schema + RLS policies
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Development Workflow

Behavior testing — tests verify what the system does, not how it does it. Write tests alongside implementation; bug fixes require a regression test. Run `npm run tdd:verify` before committing.

### Commit Convention

- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code improvements
- `test:` for test-only commits

All commits must have passing tests.

## Current Status

**Fully shipped.** Sidebar navigation with 5 views (Resumen, Transacciones, Análisis, Categorías, Configuración). Multicurrency support (USD + UYU, combined into home currency via editable FX rate). Auth + cloud persistence via Supabase. Deployed to Firebase Hosting.

**Next**: AI-powered categorization.

## CSV File Formats

### Credit Card Transactions
- Metadata: Client info, card details, balances
- Columns: Fecha, Número de tarjeta, Número de autorización, Descripción, Importe original, Pesos, Dólares

### Bank Accounts (USD/UYU)
- Metadata: Account info
- Columns: Fecha, Referencia, Concepto, Descripción, Débito, Crédito, Saldos

## License

Private project for personal use.
