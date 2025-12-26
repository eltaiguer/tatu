# Tatu - Expense Tracker Project Board

## Project Overview
Web-based expense tracker for Santander Uruguay bank statements and credit card transactions.
Built with **React + TypeScript + Vite** following strict **TDD** principles.

### Key Features
- Multi-currency support (USD + UYU)
- Automatic category inference from merchant names
- CSV import for 3 file types (Credit Card, USD Account, UYU Account)
- Dashboard with visualizations
- Transaction filtering and search
- Export capabilities

---

## 🔥 HEAT 1: Foundation & CSV Parser
**Goal**: Set up project infrastructure and build robust CSV parsers with comprehensive tests

### Tasks
- [x] **1.1** Initialize Vite + React + TypeScript project ✅
  - ✅ Configure Vitest for testing
  - ✅ Add PapaParse for CSV parsing
  - ✅ Set up Tailwind CSS
  - ✅ Configure ESLint + Prettier

- [x] **1.2** Create TypeScript interfaces (TDD) ✅
  - ✅ Write tests for Transaction interface
  - ✅ Implement Transaction model
  - ✅ Write tests for Metadata interfaces (CreditCard & BankAccount)
  - ✅ Implement Metadata models
  - ✅ Write tests for ParsedData interface
  - ✅ Implement ParsedData model
  - ✅ Create models index for exports

- [x] **1.3** Build Santander CSV Parser - Credit Card (TDD) ✅
  - ✅ Write tests for parsing utilities (number/date parsing)
  - ✅ Implement parsing utilities
  - ✅ Write tests for credit card CSV structure
  - ✅ Write tests for extracting metadata (client, card info, balances)
  - ✅ Write tests for parsing transaction rows
  - ✅ Write tests for multi-currency handling (Pesos + Dólares)
  - ✅ Implement credit card parser
  - ✅ Handle edge cases (missing data, malformed rows)
  - ✅ Integration tests with real sample file

- [x] **1.4** Build Santander CSV Parser - Bank Accounts (TDD) ✅
  - ✅ Write tests for parsing USD account CSV
  - ✅ Write tests for parsing UYU account CSV
  - ✅ Write tests for debits vs credits
  - ✅ Write tests for balance calculation
  - ✅ Implement bank account parser
  - ✅ Handle edge cases
  - ✅ Integration tests with real sample files (USD and UYU)

- [x] **1.5** CSV File Detection & Routing (TDD) ✅
  - ✅ Write tests to auto-detect file type from structure
  - ✅ Implement file type detection logic (handles encoding issues)
  - ✅ Create unified parseCSV entry point
  - ✅ Route to appropriate parser based on detection
  - ✅ Integration tests with all three sample files
  - ✅ Export parsers module index

**Acceptance Criteria**:
- All parsers have 100% test coverage
- Can parse all 3 sample CSV files correctly
- Handles malformed data gracefully
- Multi-currency transactions properly tracked

---

## 🔥 HEAT 2: Category Inference Engine
**Goal**: Build intelligent categorization system based on merchant names and transaction patterns

### Tasks
- [x] **2.1** Define Category System (TDD) ✅
  - ✅ Write tests for category enum/constants
  - ✅ Define categories: Groceries, Restaurants, Transport, Utilities, Healthcare, Shopping, Entertainment, Transfers, Income, Fees, Insurance, etc.
  - ✅ Implement category types
  - ✅ Add CATEGORY_LABELS and CATEGORY_ICONS for UI
  - ✅ Create helper functions (isExpenseCategory, isIncomeCategory)

- [x] **2.2** Build Merchant Pattern Matcher (TDD) ✅
  - ✅ Write tests for merchant name normalization
  - ✅ Write tests for pattern matching rules
  - ✅ Create pattern database for Uruguayan merchants:
    - Devoto, Supermercado → Groceries
    - Merpago, Farmashop → Shopping
    - Antel, UTE → Utilities
    - Jetbrains, Atlassian → Software/Subscriptions
    - etc.
  - ✅ Implement pattern matching algorithm
  - ✅ Handle partial matches and fuzzy matching
  - ✅ Add confidence scoring
  - ✅ Integrate into credit card and bank account parsers
  - ✅ Update UI to display categories with icons

- [x] **2.3** Transaction Categorizer (TDD) ✅
  - ✅ Write tests for auto-categorization logic
  - ✅ Write tests for income detection (credits, salary)
  - ✅ Write tests for transfer detection
  - ✅ Write tests for fee detection
  - ✅ Implement categorization service
  - ✅ Add confidence scores for categorizations

- [x] **2.4** Manual Category Override (TDD) ✅
  - ✅ Write tests for user category assignments
  - ✅ Write tests for persisting user preferences
  - ✅ Implement override functionality
  - ✅ Learning system: remember user corrections

**Acceptance Criteria**:
- 80%+ auto-categorization accuracy on sample data
- All Uruguayan merchants in samples are recognized
- User can override any category
- System learns from user corrections

---

## 🔥 HEAT 3: Data Models & State Management
**Goal**: Create robust data layer with local storage persistence

### Tasks
- [x] **3.1** Transaction Store (TDD) ✅
  - ✅ Write tests for transaction CRUD operations
  - ✅ Write tests for duplicate detection
  - ✅ Write tests for merging multiple imports
  - ✅ Implement transaction store with Zustand or Context
  - ✅ Add LocalStorage persistence

- [x] **3.2** Data Aggregation Service (TDD) ✅
  - ✅ Write tests for grouping by category
  - ✅ Write tests for grouping by month/date
  - ✅ Write tests for currency conversion utilities
  - ✅ Write tests for balance calculations
  - ✅ Implement aggregation functions
  - ✅ Add memoization for performance

- [x] **3.3** Filter & Search Engine (TDD) ✅
  - ✅ Write tests for date range filtering
  - ✅ Write tests for category filtering
  - ✅ Write tests for amount range filtering
  - ✅ Write tests for text search (description/merchant)
  - ✅ Write tests for multi-currency filtering
  - ✅ Implement filter engine
  - ✅ Add sort capabilities

**Acceptance Criteria**:
- Data persists across page refreshes
- Can import multiple CSVs without duplicates
- Fast filtering on 1000+ transactions
- All operations fully tested

---

## 🔥 HEAT 4: Dashboard & Visualizations
**Goal**: Build interactive dashboard with charts and insights

### Tasks
- [x] **4.1** Layout & Navigation (TDD) ✅
  - ✅ Write component tests for main layout
  - ✅ Implement responsive layout
  - ✅ Add navigation structure
  - ✅ Test mobile responsiveness

- [ ] **4.2** File Upload Component (TDD)
  - ✅ Write tests for drag & drop functionality
  - ✅ Write tests for file validation
  - ✅ Write tests for upload progress
  - ✅ Implement upload UI with visual feedback
  - ✅ Handle multiple file selection

- [ ] **4.3** Dashboard Overview (TDD)
  - ✅ Write tests for summary cards (total income, expenses, balance)
  - ✅ Write tests for multi-currency display
  - ✅ Implement summary components
  - ✅ Add period selector (this month, last month, custom range)

- [ ] **4.4** Charts & Visualizations (TDD)
  - ✅ Write tests for spending by category (pie/donut chart)
  - ✅ Write tests for monthly trends (line/bar chart)
  - ✅ Write tests for income vs expenses comparison
  - ✅ Implement charts with Recharts
  - ✅ Add interactive tooltips
  - ✅ Test chart data transformations

- [ ] **4.5** Transaction List View (TDD)
  - ✅ Write tests for transaction table
  - ✅ Write tests for pagination
  - ✅ Write tests for sorting
  - ✅ Implement virtualized list for performance
  - ✅ Add category badges and icons

**Acceptance Criteria**:
- Dashboard loads in < 1 second with 1000 transactions
- All charts are interactive and responsive
- Works on mobile devices
- Upload handles errors gracefully

---

## 🔥 HEAT 5: Advanced Features & Polish
**Goal**: Add filtering, export, and UX improvements

### Tasks
- [ ] **5.1** Advanced Filtering UI (TDD)
  - ✅ Write tests for filter panel
  - ✅ Write tests for multi-select category filter
  - ✅ Write tests for date range picker
  - ✅ Write tests for amount range slider
  - ✅ Implement filter UI components
  - ✅ Add filter chips/tags display
  - ✅ Test filter combinations

- [ ] **5.2** Search Functionality (TDD)
  - ✅ Write tests for search input
  - ✅ Write tests for search debouncing
  - ✅ Write tests for highlighting search results
  - ✅ Implement search UI
  - ✅ Add search suggestions

- [ ] **5.3** Export Features (TDD)
  - ✅ Write tests for CSV export
  - ✅ Write tests for filtered data export
  - ✅ Write tests for PDF report generation
  - ✅ Implement export functionality
  - ✅ Add export options (date range, format)

- [ ] **5.4** Category Management (TDD)
  - ✅ Write tests for category editor
  - ✅ Write tests for custom category creation
  - ✅ Write tests for merchant rule management
  - ✅ Implement category settings UI
  - ✅ Add category color customization

- [ ] **5.5** UX Polish
  - ✅ Add loading states
  - ✅ Add empty states
  - ✅ Add error boundaries
  - ✅ Improve accessibility (ARIA labels, keyboard nav)
  - ✅ Add dark mode support
  - ✅ Test with real user scenarios

**Acceptance Criteria**:
- Filters are intuitive and fast
- Export works for all data formats
- Custom categories can be created and managed
- App is accessible (WCAG AA compliance)
- Smooth animations and transitions

---

## 🔥 HEAT 6: Currency & Insights (Future)
**Goal**: Advanced currency features and financial insights

### Tasks
- [ ] **6.1** Currency Conversion
  - Exchange rate integration
  - Historical rate lookup
  - Unified currency view

- [ ] **6.2** Budget Tracking
  - Set category budgets
  - Budget vs actual comparison
  - Alerts for overspending

- [ ] **6.3** Insights & Analytics
  - Spending trends and patterns
  - Anomaly detection
  - Recurring transaction detection
  - Financial health score

---

## Development Guidelines

### TDD Workflow (MANDATORY)
1. 🔴 **RED**: Write failing test first
2. 🟢 **GREEN**: Write minimal code to pass
3. 🔵 **REFACTOR**: Clean up code
4. ♻️ **REPEAT**: Next test

### Testing Requirements
- Unit tests for all business logic
- Integration tests for data flow
- Component tests for UI
- E2E tests for critical paths
- Minimum 90% code coverage

### Commit Convention
- `test:` for test files
- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code improvements
- Each commit should have passing tests

---

## Current Heat: HEAT 4
**Status**: IN PROGRESS 🔥
**Completed**:
- 2.1 - Define Category System (TDD) ✅
- 2.2 - Build Merchant Pattern Matcher (TDD) ✅
- 2.3 - Transaction Categorizer (TDD) ✅
- 2.4 - Manual Category Override (TDD) ✅
- 3.1 - Transaction Store (TDD) ✅
- 3.2 - Data Aggregation Service (TDD) ✅
- 3.3 - Filter & Search Engine (TDD) ✅
**Next Task**: 4.2 - File Upload Component (TDD)

---

## Progress Tracking
- [x] Heat 1: Foundation & CSV Parser ✅
- [ ] Heat 2: Category Inference Engine
- [x] Heat 3: Data Models & State Management ✅
- [ ] Heat 4: Dashboard & Visualizations
- [ ] Heat 5: Advanced Features & Polish
- [ ] Heat 6: Currency & Insights
