# Change spec — Merge Resumen + Análisis · Expense-by-source cards

**Date:** 2026-06 · **Status:** AUTHORITATIVE — overrides any conflicting text in
`README.md` and `IMPLEMENTATION_CHECKLIST.md`. Where this file and the older docs
disagree, **this file wins**. The prototype source of truth for these changes is
`prototype/screen-home.jsx` (NOT `screen-overview.jsx` / `screen-analysis.jsx`,
which are kept only for reference and are no longer loaded).

These are two scoped changes on top of the already-specified redesign. Do **only**
what is described here; do not redesign anything else.

---

## Change 1 — Merge "Análisis" into "Resumen" (one screen)

The redesign originally had five views with Análisis as its own nav item. **Remove
Análisis as a separate view.** Resumen becomes a single page that flows from
glanceable content into the analytical content.

### Navigation / routing
- `View` type drops `'analysis'` → `type View = 'overview' | 'transactions' | 'categories' | 'settings'`.
- Sidebar **General** group is now just **Resumen** (`overview`) and **Transacciones** (`transactions`). Remove the "Análisis" nav item (and its `pie` icon entry).
- Any code that navigated to `analysis` (e.g. a `goAnalysis()` / "Ver análisis completo →" link) is removed.
- Real-codebase mapping: fold `Charts.tsx` (the Análisis screen) content into `Dashboard.tsx` (Resumen). Delete the standalone Análisis route. Do not delete the chart/selector logic — reuse it inside Dashboard.

### Page order (top → bottom) — match `screen-home.jsx` exactly
1. **Header** — greeting `Hola, {firstName} 👋` (Spectral, 30/600), subtitle `Tus cuentas Santander de un vistazo · {mes}`. Right side: editable `FxChip` + home-currency `Segment` (`US$ · $U`). One shared header for the whole page.
2. **Account cards** — 3-col grid, gap 16 (see Change 2 for new content).
3. **"Este mes, todo en {dólares|pesos}"** card — Ingresos / Gastos / Balance neto (unchanged from prior spec except the color rule in Change 2). Its old "Ver análisis completo →" link is **removed** (it's the same page now).
4. **Section divider** — a row with a Spectral 20/600 label **"Análisis"**, a faint subtitle `Tendencias y patrones · combinado en {dólares|pesos}`, and a 1px `var(--border)` rule filling remaining width. Margin `34px 0 18px`. This visually separates the glanceable top from the analytical bottom.
5. **KPI tiles** — 4-col grid: Mayor categoría / Gasto promedio mensual / Tasa de ahorro / Categorías activas.
6. **"¿Estás ahorrando?"** card — `258px 1fr` grid: verdict text left, `NetBars` diverging chart right.
7. **"Gasto por categoría"** card — `240px 1fr` grid: Recharts donut left, ranked rows right. **This single card replaces BOTH** the old overview top-5 list AND the old Análisis donut — do not render two category cards. Header right-link reads "Ver movimientos →" → Transacciones (unfiltered). Rows clickable → Transacciones filtered by that category.
8. **"Gasto por moneda"** card — two-segment `SplitBar` (brand = USD, accent/amber = UYU) + legend.
9. **"Ingresos vs Gastos"** card — Recharts area/line trend with green/red legend.
10. **Bottom 2-col grid** (`1fr 1fr`, gap 16) — **Movimientos recientes** (left) + **Mayores comercios** (right).

### Notes
- The whole page shares ONE home-currency + FX state (already in the store as `homeCurrency` / `fxRate`). There is no second currency control.
- Keep base opacity 1 on the resting view (do not gate visibility on entrance animation).

---

## Change 2 — Top cards show expenses *by source*, styled neutrally

### 2a. Card content: balances → expenses per account
The 3 top cards previously showed balances / "Consumo del período". They now show
**total expenses originating from each source (account)**, converted + COMBINED
into the home currency so the three are directly comparable.

Aggregation (port as a pure, tested TS selector — call it e.g. `spendByAccount(txs, homeCurrency, fxRate)`):
- Consider only expenses: `amount < 0` AND `category !== 'transfer'`.
- For each account id (`card`, `usd`, `uyu`) accumulate:
  - `conv` += `abs(convert(amount, txCurrency, homeCurrency, fxRate))`
  - native `USD` / `UYU` totals (abs of native amount, per tx currency)
  - `count` += 1
- `pct` = account `conv` / sum of all accounts' `conv` × 100.

Each card renders:
- Icon tile + account label + `{sub} ·· {last4}` (unchanged header).
- Label **"Gastos del período"**.
- Primary amount = `fmtPlain(conv, homeCurrency)` — the converted total spend.
- **Only when the account has spend in BOTH currencies** (the credit card), a faint secondary line: `US$ {usd} · $U {uyu}` (native, rounded, `es-UY` thousands).
- Footer (above it a 1px top border): a thin progress track filled to `pct%`, then a space-between row `{count} movimientos` (left) · `{pct}% del gasto` (right, mono).

Reference implementation: `HomeAccountCard` + the `acctSpend` memo in
`prototype/screen-home.jsx`.

### 2b. Color: do NOT render expenses in red
This is an expense tracker — expense magnitudes are the normal content, not a
warning. Across Resumen:
- **Top source cards**: primary amount uses `var(--text)` (neutral), NOT `var(--neg)`. The share progress bar uses `var(--brand)`, NOT `var(--neg)`.
- **"Este mes" card**: the **Gastos** figure uses `var(--text)` (neutral), NOT `var(--neg)`.
- **Keep** semantic color where it's a genuine signal: **Ingresos** stays `var(--pos)` (green); **Balance neto** stays signed (green when ≥ 0, red when < 0, i.e. only red when the user genuinely spent more than they earned).
- Red (`var(--neg)`) is reserved for true negatives (a negative net, a deficit month in NetBars) — never for plain expense amounts.

---

## Acceptance criteria (self-verify before finishing)
- [ ] No `'analysis'` value remains in the `View` union; no "Análisis" sidebar nav item; no route/handler navigates to a standalone Análisis screen.
- [ ] Resumen renders, in order: header → 3 source cards → "Este mes" → "Análisis" divider → KPIs → ¿Estás ahorrando? → Gasto por categoría (donut) → Gasto por moneda → Ingresos vs Gastos → recientes + comercios.
- [ ] Exactly **one** "Gasto por categoría" card on the page (the donut version); the old top-5 list is gone.
- [ ] The 3 top cards show per-account expense totals (converted + combined), each with `{count} movimientos` and `{pct}% del gasto`; the credit-card card shows the native `US$ · $U` split line; the others do not.
- [ ] No expense amount is rendered in red anywhere on Resumen. Ingresos is green; Balance neto and NetBars deficits may be red.
- [ ] Changing the home-currency toggle or FX rate recomputes the source cards, KPIs, donut, split, trend, and "Este mes" live.
- [ ] `npm run tdd:verify` and `npm run ci:check` pass; new selector(s) have tests.
- [ ] Screenshot-compare Resumen (light + dark) against `prototype/screen-home.jsx` rendered in `prototype/index.html`; they should match in layout, copy, and color.
