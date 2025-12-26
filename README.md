# Tatu - Expense Tracker

Web-based expense tracker for Santander Uruguay bank statements and credit card transactions.

Built with **React + TypeScript + Vite** following strict **TDD** principles.

## Features

- Multi-currency support (USD + UYU)
- Automatic category inference from merchant names
- CSV import for 3 file types (Credit Card, USD Account, UYU Account)
- Dashboard with visualizations
- Transaction filtering and search
- Export capabilities

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Testing**: Vitest + React Testing Library
- **CSV Parsing**: PapaParse
- **State Management**: Zustand
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
# Start dev server
npm run dev

# Run tests (watch mode)
npm test

# Run tests (single run)
npm test -- --run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

### Build

```bash
npm run build
npm run preview
```

## Project Structure

```
tatu/
├── samples/                     # Sample CSV files
│   ├── CreditCardsMovementsDetail.csv
│   ├── USDmovements.csv
│   └── UYUmovements.csv
├── src/
│   ├── components/             # React components
│   ├── services/               # Business logic
│   │   ├── parsers/           # CSV parsers
│   │   ├── categorizer/       # Category inference
│   │   └── aggregator/        # Data aggregation
│   ├── models/                # TypeScript interfaces
│   ├── stores/                # State management
│   ├── test/                  # Test utilities
│   │   └── setup.ts
│   ├── App.tsx
│   └── main.tsx
├── PROJECT_BOARD.md           # Development roadmap
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Development Workflow (TDD)

This project follows strict Test-Driven Development:

1. 🔴 **RED**: Write failing test first
2. 🟢 **GREEN**: Write minimal code to pass
3. 🔵 **REFACTOR**: Clean up code
4. ♻️ **REPEAT**: Next test

### Commit Convention

- `test:` for test files
- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code improvements

All commits must have passing tests.

## Current Status

**Heat 1.1 - COMPLETED ✅**
- Project structure initialized
- Testing infrastructure configured
- All dependencies installed
- Initial tests passing

**Next**: Heat 1.2 - Create TypeScript interfaces (TDD)

See [PROJECT_BOARD.md](./PROJECT_BOARD.md) for detailed roadmap.

## CSV File Formats

### Credit Card Transactions
- Metadata: Client info, card details, balances
- Columns: Fecha, Número de tarjeta, Número de autorización, Descripción, Importe original, Pesos, Dólares

### Bank Accounts (USD/UYU)
- Metadata: Account info
- Columns: Fecha, Referencia, Concepto, Descripción, Débito, Crédito, Saldos

## License

Private project for personal use.
