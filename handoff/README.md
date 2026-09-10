# Handoff: Tatú — App Reorganization & Visual Refresh

## Overview
This package specifies a full reorganization and visual refresh of **Tatú**, the
Santander Uruguay expense tracker. It replaces the current 5-tab top-nav layout
(Dashboard · Transacciones · Insights · Herramientas · Importar) with a **left
sidebar IA**, consolidates all filtering into one place, dissolves the
catch-all "Herramientas" view, demotes "Importar" from a nav tab to an action,
and applies a warmer, more distinctive visual system.

The goal: **the real app should look and behave exactly like the HTML prototype
in `/prototype`.**

## About the Design Files
The files in `/prototype` are a **design reference built in HTML/React+Babel** —
a runnable prototype that shows the intended look, layout, copy, and behavior.
**They are not production code to copy verbatim.** The task is to **recreate
this design inside the existing `tatu/` codebase** using its established
stack and patterns:

- React 18 + TypeScript (strict) + Vite
- Tailwind CSS + Radix UI primitives (shadcn/ui style) in `src/components/ui/`
- CSS variables for theming (`src/styles/`, `src/index.css`)
- Zustand store (`src/stores/transaction-store`)
- Recharts for charts
- Existing services in `src/services/` (parsers, categorizer, export, etc.)

Reuse the existing components and services — do not re-invent parsing,
categorization, export, or the store. This is a **re-wire + re-token** job, not
a rewrite. Keep the project's TDD workflow: each change should keep
`npm run tdd:verify` green.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, copy, and interactions in
the prototype are final. Recreate the UI pixel-faithfully using the codebase's
existing Tailwind + Radix components. Exact token values are in **Design Tokens**
below and in `/prototype/styles.css`.

---

## Target-codebase mapping (prototype → real files)
| Prototype | Real file(s) to create/modify |
|---|---|
| App shell + sidebar (`app.jsx`, `sidebar.jsx`) | `src/App.tsx` (replace top `<nav>`/`<header>` with sidebar); use existing `src/components/ui/sidebar.tsx` |
| Resumen (`screen-overview.jsx`) | `src/components/Dashboard.tsx` (rework into overview) |
| Transacciones + unified filters (`screen-transactions.jsx`) | `src/components/Transactions.tsx` (extend its filter state; add chips, advanced panel, export button) |
| Análisis (`screen-analysis.jsx`) | `src/components/Charts.tsx` (rename concept to "Análisis"; Recharts donut + area + lists) |
| Categorías y reglas (`screen-manage.jsx` → `Categories`) | **new** `src/components/Categories.tsx` (lift category mgmt + custom patterns out of `Tools.tsx`) |
| Configuración (`screen-manage.jsx` → `Settings`) | **new** `src/components/Settings.tsx` (theme, account, export-all, reset — out of `Tools.tsx`) |
| Importar overlay (`screen-manage.jsx` → `ImportModal`) | wrap existing `src/components/ImportCSV.tsx` in a Radix `Dialog` |
| Tokens (`styles.css`) | `src/styles/` design-token CSS + `tailwind.config.js` |
| **delete** | `src/components/Tools.tsx` + `Tools.test.tsx` (its 4 tabs are redistributed) |

### New navigation / `View` type
```
type View = 'overview' | 'transactions' | 'analysis' | 'categories' | 'settings'
```
Sidebar groups:
- **General**: Resumen (`overview`), Transacciones (`transactions`), Análisis (`analysis`)
- **Gestión**: Categorías (`categories`), Configuración (`settings`)
- Above the groups: brand mark + a prominent **"Importar"** button that opens the import Dialog (NOT a routed view).
- Footer: user row (avatar, name, email — **no bank name**, users may have multiple banks) + sign-out icon.

---

## Multicurrency model (IMPORTANT — core concept)
The user earns in **USD** and spends in a **mix of USD and UYU**. Showing each
currency in its own silo (the old design) makes totals, savings rate, and
category spend meaningless. The redesign solves this with a **home/display
currency + FX conversion**:

- **Home currency** (app-level state, default **USD**): Resumen and Análisis
  **convert and COMBINE** every transaction into this currency instead of
  filtering to one. Toggle is `US$ · $U` in each screen header and in
  Configuración → Monedas.
- **FX rate** (app-level state, default `40.5` UYU per USD): editable via the
  **`FxChip`** in the Resumen/Análisis headers (click to edit) and a number
  field in Configuración. All conversions and combined totals recompute live.
- **Native amounts stay primary** everywhere a single transaction is shown
  (transaction rows, recent list): the native figure is the main value, with a
  faint **`≈ {converted}`** secondary line shown only when the tx currency ≠ home.
- **Currency is a *filter*, not a view-splitter** — it lives in the Transacciones
  filter bar, not as the thing that divides the whole dashboard.
- **New "Gasto por moneda"** card in Análisis: a two-segment bar (brand = USD,
  amber = UYU) showing what share of converted spend originated in each currency
  — directly answers "I earn USD but where does my money actually go?".

Conversion helper (see `prototype/data.js` → `TATU.convert`):
`convert(amount, from, to, rate)` → same currency returns as-is; `USD→UYU` is
`× rate`; `UYU→USD` is `÷ rate`. Aggregation selectors
(`prototype/selectors.js`: `categoryBreakdown`, `monthlyTrend`, `monthSummary`,
`currencySplit`) all take `(txs, displayCurrency, rate)` and convert per-tx
before summing. `monthSummary` also returns a native `split { USD, UYU }` for the
"US$ X + $U Y" caption under Gastos.

**Real-codebase note:** store `homeCurrency` and `fxRate` in the Zustand store
(persisted), default USD / a sensible rate; ideally let the rate be refreshed
from an FX source later, but a user-editable value is the MVP. Port the
conversion + selectors as pure, tested TS functions. Keep `currency` in the
Transactions filter as native filtering (unchanged).

---

## Screens / Views

### 1. Resumen (overview)
- **Purpose**: At-a-glance home. Balances, this month, recent activity, top categories — each links deeper.
- **Layout**: Page max-width 1180px, padding 40px 44px. Header row (serif greeting + period segment on the right). Then: (a) 3 equal account cards in a grid (gap 16); (b) full-width "Este mes" card; (c) two-column grid `1fr 1.15fr` — top categories left, recent movements right.
- **Header**: `h1` `Hola, {firstName} 👋` in **display serif (Spectral)**, 30px/600 — derive `firstName` from the signed-in user (do NOT hardcode "José"; the prototype only does because it has no auth). Subtitle muted 14.5px: "Esto es lo que pasó en tus cuentas Santander · {mes}". Right: editable **`FxChip`** + the **home-currency toggle `US$ · $U`** (2 options — this is the convert+combine home currency, not a 3-way `Todo` splitter).
- **Account cards** (3): icon tile (36px, radius 10, surface-2 bg, brand icon) + account label (14/600) + sub `Caja de ahorro · ··{last4}` (faint 12). Then a label ("Consumo del período" for the credit card, "Saldo disponible" for accounts) and a mono amount (21–23px). Card = expense red for the credit card consumo + a secondary USD line. Footer (faint 11.5, top border) is a **space-between row**: `{n} movimientos` on the left + a mono `≈ {amount converted into home currency}` on the right — NOT "{n} movimientos este período".
- **Este mes card**: title **`Este mes, todo en {dólares|pesos}`** (suffix tracks the home-currency toggle) + faint subtitle **`Combina tus movimientos en US$ y $U usando el tipo de cambio.`** + link "Ver análisis completo →". 3-column grid: **Ingresos** (pos green mono ~26px) + a `MiniBars` sparkline; **Gastos** (neg red) + the native split caption `US$ X + $U Y` (**no sparkline**); **Balance neto** (signed pos/neg) + "{n} transacciones registradas" (no sparkline). Only Ingresos gets a sparkline — see `prototype/screen-overview.jsx`.
- **Top categories card**: title + "Detalle" link. 5 rows: color dot + label (13.5/500) on the left, mono amount on the right, then a 7px progress track with a category-color fill at `pct%`. Whole row is clickable → Transacciones filtered by that category.
- **Recent movements card**: title + "Ver todos →". 6 rows: category emoji tile (32px, radius 9, category-color@12% bg) + display description (13.5/500, ellipsis) + date · account (faint 11.5) + signed mono amount (green if income). Row click → open edit modal.

### 2. Transacciones (unified filtering)
- **Purpose**: Find, review, categorize, and clean up movements — the primary daily task.
- **Header**: `h1` "Transacciones" + subtitle "{filtered} de {total} movimientos · filtrado". Right: **Exportar** button (`download` icon) — exports the *current filtered view* (CSV/PDF via existing `services/export`).
- **Unified filter bar** (one card, padding 18). Row 1 (flex, wrap, gap 10): search input (flex, left search icon, placeholder "Buscar comercio o descripción…"); **Categoría** multiselect popover (checkbox list w/ color dots, shows `· N`); **Cuenta** multiselect popover; **Tipo** segment `Todos · Ingresos · Gastos`; **Moneda** segment `Todo · $U · US$`; **Más** toggle button (`filter` icon).
  - **Advanced panel** (revealed by "Más", 4-col grid, top border): Fecha desde / Fecha hasta (date inputs) / Monto mínimo / Monto máximo (number inputs).
  - **Active-filter chips** row: one pill per active filter with an `×` to clear it, plus a "Limpiar todo" link. This is the single consolidation point — remove the old separate filter UIs on Dashboard and in Herramientas.
- **Bulk-action bar** (appears only when ≥1 row selected; brand-soft background, fadeUp in): "{n} seleccionadas" + actions **Auto-categorizar** (`sparkles`), **Categorizar** (`tag`), **Etiquetar**, **Eliminar** (neg). Wire to existing store bulk handlers in `App.tsx` (`handleBulkCategorize`, `handleAutoCategorize`, `handleBulkTag`, `handleBulkDelete`).
- **Table**: columns — select checkbox / Fecha (mono faint 12) / Descripción (category emoji tile + display desc, with original desc faint underneath when overridden) / Categoría (badge: color dot + label, color@12% bg) / Cuenta (account icon + short name, faint) / Conf. (3-bar confidence meter: green ≥0.8, amber ≥0.55, red below) / Monto (signed mono, green if income, right-aligned) / row actions (edit + delete, opacity 0 → 1 on row hover). Header cells: 11.5px/700 uppercase, letter-spacing 0.05em, faint, bottom border. Rows: 13px vertical padding, bottom border, hover = surface-2, selected = brand-soft.
- **Empty state**: 🔍 + "Sin resultados" + "Probá ajustar o limpiar los filtros." + "Limpiar filtros" button.
- **Pagination**: PAGE_SIZE 12. "Mostrando a–b de N" left; Anterior / numbered pages / Siguiente right (active page = brand primary).
- **Edit modal** (see Interactions): opened from row edit action or from a recent-movements row on Resumen.

### 3. Análisis
- **Purpose**: Trends and spending patterns (clear separation from the at-a-glance Resumen).
- **Header**: `h1` "Análisis" + subtitle. Right: segment `Pesos $U · Dólares US$` (this screen is single-currency at a time).
- **KPI tiles** (4-col grid): Mayor categoría (label + "{pct}% del gasto"); Gasto promedio mensual (mono); Tasa de ahorro (pct, green/red); Categorías activas (count). Each: small card, label 12.5 muted, value mono 23/600.
- **Gasto por categoría card**: 2-col grid `240px 1fr`. Left: **donut** (Recharts `PieChart`/`Cell`, 26px ring, hover lifts a segment + shows that category's % in the center; idle center shows "Total" + total). Right: ranked rows (emoji + label, amount + pct, progress track). Rows clickable → Transacciones filtered by category + currency.
- **Ingresos vs Gastos card**: legend (Ingresos green / Gastos red) + **area/line chart** over months (Recharts `AreaChart`, two series with soft gradient fills, 2.5px lines, dotted gridlines, month labels).
- **¿Estás ahorrando? card**: the "am I saving" answer. Left: headline = average monthly net (income − expense, combined in home currency), signed pos/neg, with a plain-language verdict ("Ahorrás US$ X por mes" / "Gastás US$ X más de lo que ingresás") + "{n} de {m} meses en positivo". Right: **net-cashflow diverging bar chart** — one bar per month around a zero baseline, green above (surplus), red below (deficit), with the net value labeled. Component `NetBars` in `/prototype/ui.jsx`.
- **Mayores comercios card**: 2-col list, top 6 merchants by spend: rank + emoji tile + name + "{n} movimientos" + total.

### 4. Categorías (was part of Herramientas)
- **Purpose**: Manage categories and auto-categorization rules.
- **Header**: `h1` "Categorías y reglas" + "Nueva categoría" primary button.
- **Tus categorías card**: 3-col grid of category cards (emoji tile 38px color@14% + label/600 + "{n} movimientos" + edit pencil). Source counts from the store; categories from `src/models/category.ts` + custom categories service.
- **Reglas de auto-categorización card**: explainer + add-rule row (pattern text input / match-type select `contiene · empieza con · es igual a` / category select / "Agregar" button) → wire to `services/categorizer/custom-patterns`. Below: list of rules (match-type tag + `"pattern"` + → + category badge + delete).

### 5. Configuración (was part of Herramientas)
- **Purpose**: Appearance, account, and data management.
- Cards with `SettingRow` (title/desc left, control right, bottom border):
  - **Apariencia**: Tema segment `Claro · Oscuro` (drives `.dark` class + persists, as `useTheme` already does); Moneda principal segment.
  - **Cuenta**: name + email + "Conectado" status badge; "Cerrar sesión" button (wire to existing `handleSignOut`).
  - **Datos**: "Importar movimientos" (opens import Dialog); "Exportar todo" (CSV/PDF via `services/export`); **"Eliminar todos los datos"** danger row (wire to existing `handleResetAllData`).
  - Privacy note (brand-soft callout): **must be accurate** — data is stored/synced to the user's account (Supabase), NOT "processed only locally / never sent to a server". Use copy like: "Tus movimientos se guardan cifrados en tu cuenta y se sincronizan de forma segura. Nunca compartimos tus datos financieros con terceros."

### Importar (overlay, not a view)
- Triggered by the sidebar "Importar" button and the Configuración data row. Implement as a Radix `Dialog` wrapping the existing `ImportCSV` flow.
- Contents: header "Importar movimientos" / subtitle; **dropzone** (dashed border, upload icon tile, "Arrastrá tu archivo CSV aquí", "Detectamos el tipo de cuenta automáticamente", "Seleccionar archivo" primary button; drag state highlights border brand + brand-soft bg); 3 file-type cards (Tarjeta de Crédito / Cuenta USD / Cuenta UYU); accurate privacy note. On import, route to Transacciones (existing `onImportComplete`).

---

## Interactions & Behavior
- **Navigation**: sidebar item sets `View`; active item = brand-soft bg, brand text, 3px brand left-accent bar.
- **Cross-links**: category rows (Resumen + Análisis) and "Ver todos" navigate to Transacciones with a pre-applied filter (pass an initial filter object; Transactions merges it into its filter state on mount/update).
- **Edit modal** (`TxEditModal`): editable display name + category chip picker + **apply scope** segment `Solo esta · Todas iguales · Futuras`, with an explanatory line per scope. Maps directly to the existing `handleUpdateTransaction` `applyScope` values (`single` / `matching_past_and_future` / `future_matching_only`). Save shows a toast.
- **Bulk actions**: operate on selected row ids via existing store handlers; clear selection + toast after.
- **Toasts**: bottom-center, auto-dismiss ~2.6s (the app already uses `sonner` — use it).
- **Theme toggle**: floating circular button bottom-right (sun/moon) AND the Configuración segment; toggles `.dark`, persists to localStorage (reuse `useTheme`).
- **Transitions**: subtle. Modals scale/fade in (~0.2–0.24s). Do NOT gate a view's *resting* visibility on a CSS entrance animation — keep base opacity 1 (offscreen/iframe throttling can otherwise freeze content at opacity 0). Respect `prefers-reduced-motion`.
- **Hover**: table rows reveal edit/delete; nav + buttons have surface-2 hover; donut segments lift.
- **Responsive**: desktop-first (design target). Sidebar fixed 252px; main content offset by it. (Mobile pass can come later — collapse sidebar to a drawer.)

## State Management
Reuse the existing Zustand `transaction-store` and `App.tsx` handlers. UI-only state to add:
- `view` (current screen), `currency` (overview/analysis display currency), `importOpen` (Dialog), `editingTx` (modal target), `txFilter` (pending filter passed Resumen/Análisis → Transacciones), `theme`.
- Transactions local filter state: `{ search, categories[], accounts[], currency, type, from, to, min, max }` + `advanced` (panel open) + `selected[]` (row ids) + `page`.
- No new data fetching — all derived from the store. Aggregation helpers (category breakdown, monthly trend, month summary, filter application) are shown in `/prototype/selectors.js`; port them as pure TS selectors/util functions with tests.

## Design Tokens
Fonts (Google Fonts): **Spectral** (display: the page greeting + brand wordmark only), **Hanken Grotesk** (all UI, body, buttons, nav, section titles), **JetBrains Mono** (all amounts/data, tabular-nums).

> ⚠️ **Single typography source.** Define the font variables in exactly one place
> (`theme.css` + `fonts.css`). Do **not** leave a second stylesheet (e.g. a Figma-starter
> `typography.css` using Inter / Space Grotesk) in `src/styles/` — if it loads, it wins the
> cascade and silently swaps the whole app to the wrong fonts. A grep for
> `"Space Grotesk"` or `'Inter'` under `src/` must come back empty. See `CORRECTIONS.md §A`.

Radii: `--radius-lg: 18px`, `--radius: 12px`, `--radius-sm: 9px`. Pills 999px.
Sidebar width: 252px. Base font-size 15px, line-height 1.5.

Shadows (light): sm `0 1px 2px oklch(0.3 0.02 70 / .05), 0 1px 3px oklch(0.3 0.02 70 / .04)`; md `0 2px 4px …/.05, 0 6px 16px …/.06`; lg `0 8px 24px …/.1, 0 24px 48px …/.1`.

**Colors — Light (warm bone):**
```
--bg            oklch(0.984 0.006 80)
--surface       oklch(0.997 0.003 80)
--surface-2     oklch(0.963 0.007 80)
--surface-3     oklch(0.94 0.008 78)
--border        oklch(0.905 0.008 75)
--border-strong oklch(0.84 0.01 75)
--text          oklch(0.24 0.012 60)
--text-muted    oklch(0.52 0.012 65)
--text-faint    oklch(0.66 0.01 70)
--brand         oklch(0.5 0.085 197)
--brand-hover   oklch(0.44 0.085 197)
--brand-soft    oklch(0.95 0.028 197)
--brand-text    oklch(0.42 0.08 199)
--pos           oklch(0.53 0.12 153)   /* income green */
--pos-soft      oklch(0.952 0.04 153)
--neg           oklch(0.55 0.16 25)    /* expense clay-red */
--neg-soft      oklch(0.955 0.03 30)
--accent        oklch(0.7 0.13 62)     /* warm amber */
--accent-soft   oklch(0.95 0.05 70)
```
**Colors — Dark (warm espresso):**
```
--bg            oklch(0.162 0.008 65)
--surface       oklch(0.205 0.009 66)
--surface-2     oklch(0.246 0.01 66)
--surface-3     oklch(0.285 0.011 66)
--border        oklch(0.3 0.012 66)
--border-strong oklch(0.38 0.014 66)
--text          oklch(0.95 0.006 80)
--text-muted    oklch(0.69 0.012 72)
--text-faint    oklch(0.54 0.01 70)
--brand         oklch(0.74 0.09 196)
--brand-hover   oklch(0.8 0.09 196)
--brand-soft    oklch(0.31 0.045 200)
--brand-text    oklch(0.82 0.085 196)
--pos           oklch(0.74 0.13 153)
--pos-soft      oklch(0.3 0.05 153)
--neg           oklch(0.7 0.15 28)
--neg-soft      oklch(0.32 0.06 28)
--accent        oklch(0.8 0.12 70)
--accent-soft   oklch(0.33 0.05 70)
```
**Category colors** (keep the existing palette in `src/models/category.ts`): used as the dot/badge/tile color, typically at ~12–14% alpha for fills. Semantic green/red above are reserved for amount signs and income/expense — keep category hues distinct from them.

## Assets
- **Logo / brand mark**: geometric SVG (no raster). An armadillo (*tatú*) shell rendered as 2–3 nested banded arcs over a baseline + a small head circle — also reads as a rising growth curve. White (`currentColor`) on a brand-color rounded tile (34px, radius 10). See `BrandMark` in `/prototype/sidebar.jsx`. Use the existing `TatuLogo` slot in the codebase; replace its glyph with this mark.
- **Icons**: line icons (lucide). The codebase already uses `lucide-react` — use it directly (the prototype inlines equivalent paths only because it has no bundler).
- **Fonts**: Spectral, Hanken Grotesk, JetBrains Mono — add via Google Fonts `<link>` or `@fontsource`.
- **Emoji**: category icons are emoji (from `CATEGORY_ICONS`) — already in the codebase.
- No third-party brand assets. Sample CSVs in `tatu/samples/` are realistic test data.

## Files (in this bundle, under `/prototype`)
- `index.html` — loads everything (font links, React+Babel pins, script order).
- `styles.css` — the full design system (tokens, components, layout) — **the source of truth for visuals**.
- `data.js` — mock dataset + currency/date formatters (reference only; real app uses the store).
- `selectors.js` — aggregation + filter helpers (port to TS).
- `icons.jsx` — icon set (use `lucide-react` instead).
- `ui.jsx` — `CategoryBadge`, `ConfidenceDot`, `Segment`, `Donut`, `TrendChart`, `MiniBars`.
- `sidebar.jsx` — `Sidebar` + `BrandMark` (logo).
- `screen-overview.jsx` / `screen-transactions.jsx` / `screen-analysis.jsx` / `screen-manage.jsx` — the five screens + import/edit modals.
- `app.jsx` — shell, routing, theme, toasts, import overlay.

## Suggested implementation order (ship-safe, each keeps tests green)
1. **Tokens + fonts** → `src/styles/` + `tailwind.config.js`. Restyles the whole current app at once (the "less bland" win) before any structural change.
2. **Sidebar shell** → swap top nav in `App.tsx` for `ui/sidebar.tsx`; regroup nav; demote Import to a button.
3. **Dissolve `Tools.tsx`** → new `Categories.tsx` + `Settings.tsx`; move Export into Transactions; delete Tools + test; repoint routing.
4. **Unify filters + import Dialog** → extend `Transactions.tsx` filters (amount/currency + chips + advanced panel); remove Dashboard's loose dropdowns; wrap `ImportCSV` in a Dialog.
5. **Polish** → Resumen rework, Análisis (Recharts donut/area), edit modal apply-scope, toasts, theme toggle, confidence meters.
