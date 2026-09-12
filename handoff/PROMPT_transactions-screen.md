# Prompt — bring the Transacciones screen in line with the prototype

Paste the block below to Claude Code, run from the repo root with
`design_handoff_tatu_redesign/` inside it.

---

```
Re-align the Transacciones screen with the redesign. The current build works but has
drifted from the prototype in several ways. These are SURGICAL fixes — reuse the
existing hook, store handlers, and services; do NOT rewrite business logic or touch
other screens.

SOURCE OF TRUTH (in this order — when prose and prototype disagree, the prototype wins):
1. design_handoff_tatu_redesign/prototype/screen-transactions.jsx — exact markup,
   sizes, copy, and component structure for this screen.
2. design_handoff_tatu_redesign/prototype/ui.jsx (Segment, CategoryBadge,
   ConfidenceDot) + prototype/selectors.js (applyFilters) + prototype/styles.css (tokens).
3. design_handoff_tatu_redesign/screenshots/ — target render, light + dark.

REUSE (don't reinvent):
- src/hooks/useTransactionFiltering.ts — extend its state; keep it the single filter brain.
- src/services/currency/convert.ts (convert) — already used by Dashboard.
- Store/App handlers: handleBulkCategorize, handleAutoCategorize, handleBulkDelete,
  handleUpdateTransaction (applyScope), export service. Wire bulk "Ignorar" to the
  existing ignore/transfer path.
- Thread homeCurrency (preferredCurrency) + fxRate into <Transactions> from App.tsx —
  Dashboard already receives them; Transactions currently does not. The totals strip and
  the per-row "≈ converted" line need them.

FIX, matching the prototype line-for-line:

1. TOTALS STRIP — replace the per-currency silo row (the killed pattern) with the
   prototype's TotalsStrip: a 4-col grid (gap 12, mb 16) of TotalTile cards, all
   converted + COMBINED into the home currency via convert():
   - Ingresos (green, icon trendUp, sub "{n} movimientos contados")
   - Gastos (neutral var(--text), icon trendDown, sub "Combinado en {dólares|pesos}")
   - Balance (signed +/−, green if ≥0 else red, icon wallet, sub "Ingresos − gastos")
   - Transferencias (value = ignored/transfer count, icon slash,
     sub "Ignoradas · no se cuentan" / "Ninguna en el período")
   Transfers are excluded from income/expense/balance. Currency stays a FILTER, never
   a splitter — there is no per-currency grouping here anymore.

2. PERIOD NAVIGATOR — add the MonthNav control (prev/next month stepper + popover:
   quick options "Este mes / Últimos 3 meses / Este año / Todo", a year stepper, and a
   3-col month grid with future months disabled). It sits in the header next to the
   Exportar button. The selected period drives dateFrom/dateTo in the filter hook.
   Default to the newest month in the data; if an initialFilter deep-link is present
   (category/account/search) default to "Todo". The header subtitle becomes
   "{n} movimiento(s)[ · filtrado] · {periodLabel}".

3. CATEGORÍA + CUENTA → MULTI-SELECT popovers (checkbox list, color dot per category,
   "· {N}" count, brand border + brand-text when any selected). State becomes
   categories: string[] and accounts: string[] (replace the single category string and
   the 3-way account single-select). Account options come from the real account/source
   set. Update applyFilters/clearAll/hasActiveFilters accordingly.

4. "MONTO" ADVANCED PANEL — add a toggle button (filter icon, label "Monto", primary
   style when open) that reveals a 2-col grid (top border) with "Monto mínimo" /
   "Monto máximo" number inputs (filter on Math.abs(amount)). Remove the DateRangePicker
   from the filter bar — date range now lives in the period navigator (keep any hidden
   date inputs only if a test depends on them; otherwise repoint the tests).

5. ACTIVE-FILTER CHIPS — below the filter bar, render one pill per active filter
   (each category, each account, currency, type, amount range) with an "×" to clear just
   that filter, plus a "Limpiar todo" link. Replaces the lone "Limpiar" button.

6. FLOATING BULK PILL — replace the inline brand-soft bar with the prototype's BulkBar:
   a fixed, pill-shaped, shadow-lg bar centered at the bottom
   (left: calc(50% + var(--sidebar-w) / 2); transform: translateX(-50%); fadeUp in).
   Contents: count badge + "seleccionada(s)", "Seleccionar las {N}" link (when not all
   selected), divider, then Categorizar (opens an inline category quick-pick popover) ·
   Auto · Ignorar · Eliminar (var(--neg)), divider, and an "×" to deselect. Wire each to
   the existing store handlers. The selection-count text moves OUT of here into the table
   toolbar (see 7).

7. TABLE TOOLBAR + IGNORED ROWS — add a toolbar row above the table (space-between):
   left = "{n} de {m} seleccionadas" when a selection exists, else "{m} movimientos en la
   vista"; right = a "Mostrar/Ocultar transferencias ignoradas · {N}" toggle (eye/eyeOff,
   brand border when on, disabled when count is 0). Default showIgnored to FALSE (the
   prototype hides transfers by default). Render ignored/transfer rows at ~0.62 opacity
   with a small inline "Ignorada" tag next to the description.

8. AMOUNT COLUMN — under the native amount, when tx.currency !== homeCurrency, add a
   faint mono secondary line "≈ {converted}" (convert into home currency). Column header
   label is "Conf." per the prototype.

After the changes: run `npm run tdd:verify` and fix until green; add/adjust tests for the
new multi-select filters, the amount min/max filter, the period→range wiring, the
converted+combined totals, and the transfers toggle default. Then `npm run ci:check`.
Show me the diff before moving on. Compare the result side-by-side with
prototype/screen-transactions.jsx (rendered via prototype/index.html) and the screenshots,
in both light and dark.
```

---

**Why these specific fixes** (current build → prototype target):
- Totals are still rendered as per-currency silos — the exact pattern the multicurrency rework replaced with convert-and-combine.
- No period navigator, no amount min/max filter, no active-filter chips.
- Categoría/Cuenta are single-select; the prototype is multi-select.
- Bulk actions are an inline top bar (Editar/Auto/Eliminar) rather than the floating pill with inline Categorizar + Ignorar.
- The transfers toggle lives in the filter bar (default on) rather than a table toolbar (default off), and ignored rows aren't visually demoted.
- Rows have no "≈ converted" secondary line.
