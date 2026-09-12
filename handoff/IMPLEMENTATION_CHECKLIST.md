# Tatú Redesign — Implementation Checklist

Work top-to-bottom. Each PR is self-contained and should keep `npm run tdd:verify`
green. Check items off as you go. File targets reference the real `tatu/` codebase;
visual truth lives in `../prototype/styles.css` and the screenshots in `../screenshots/`.

---

## PR 1 — Design tokens + fonts (visual refresh, no IA change)
- [ ] Add Google Fonts: Spectral, Hanken Grotesk, JetBrains Mono (link or `@fontsource`).
- [ ] **Single typography source:** delete any leftover Figma `src/styles/typography.css` (Inter / Space Grotesk) and `src/utils/figma-data.ts` if unused. `grep -R "Space Grotesk|'Inter'" src` must be empty. (See `CORRECTIONS.md §A`.)
- [ ] Replace light-theme CSS variables in `src/styles/` / `src/index.css` with the warm palette (see README → Design Tokens).
- [ ] Replace dark-theme (`.dark`) variables with the warm-espresso set.
- [ ] Update `tailwind.config.js`: font families (`display`/`sans`/`mono`), radii (18/12/9), shadow scale.
- [ ] Set base `font-family: var(--font-sans)`, 15px / 1.5; amounts use `--font-mono` + tabular-nums.
- [ ] Sanity check: every existing screen re-themes with no layout regressions; light + dark both pass.

## PR 2 — Sidebar navigation shell
- [ ] In `App.tsx`, replace the top `<header>`/`<nav>` with `components/ui/sidebar.tsx`.
- [ ] New `View` union: `'overview' | 'transactions' | 'analysis' | 'categories' | 'settings'`.
- [ ] Nav groups — General: Resumen, Transacciones, Análisis · Gestión: Categorías, Configuración.
- [ ] Active item style: brand-soft bg, brand text, 3px brand left-accent bar.
- [ ] Brand mark (armadillo shell) in the existing `TatuLogo` slot; "Importar" button above the nav groups.
- [ ] Footer user row: avatar + name + email, **no bank name**; sign-out icon wired to `handleSignOut`.
- [ ] Main content offset by fixed 252px sidebar; max-width 1180px, padding 40/44.

## PR 3 — Dissolve `Tools.tsx`
- [ ] Create `src/components/Categories.tsx` (category management + custom-pattern rules from Tools).
- [ ] Create `src/components/Settings.tsx` (theme, currency, account, export-all, reset-all from Tools).
- [ ] Move **Export** (filtered view) into the Transactions toolbar.
- [ ] Fix privacy copy to be accurate (synced to account, not "local only / no server").
- [ ] Delete `Tools.tsx` + `Tools.test.tsx`; repoint routing; remove `'tools'`/`'import'` from `View`.
- [ ] Add `Categories.test.tsx` / `Settings.test.tsx` covering the moved behavior.

## PR 4 — Unify filters + import Dialog
- [ ] Extend `Transactions.tsx` filter state with amount range + currency; add the advanced panel toggle.
- [ ] Add active-filter chips row + "Limpiar todo".
- [ ] Remove the loose filter dropdowns from `Dashboard.tsx`; remove any duplicate filter UI.
- [ ] Wrap `ImportCSV.tsx` in a Radix `Dialog`; open from sidebar button + Settings → Datos.
- [ ] Category/recent rows on Resumen & Análisis deep-link to Transacciones with a pre-applied filter.
- [ ] Regression test: filtering by category from Resumen lands on filtered Transactions.

## PR 4.5 — Multicurrency (convert + combine) — see README "Multicurrency model"
- [ ] Add `homeCurrency` (default USD) + `fxRate` (default ~40.5) to the store, persisted.
- [ ] Port `convert(amount, from, to, rate)` + the converting selectors (`categoryBreakdown`, `monthlyTrend`, `monthSummary`, `currencySplit`) as pure TS with tests.
- [ ] Resumen & Análisis: home-currency segment (`US$ · $U`) + editable `FxChip`; all totals convert + combine.
- [ ] Transaction rows + recent list: native amount primary, faint `≈ converted` secondary when currency ≠ home.
- [ ] New "Gasto por moneda" split card in Análisis (USD vs UYU share of converted spend).
- [ ] "¿Estás ahorrando?" card in Análisis: avg monthly net + verdict + `NetBars` diverging cashflow chart (income − expense per month, combined in home currency).
- [ ] Configuración → Monedas: principal-currency segment + FX-rate field.
- [ ] Verify savings rate / monthly average / category totals are computed on converted amounts.

## PR 5 — Screen polish to match prototype
- [ ] **Resumen**: 3 account cards (sub includes `·· {last4}`; footer = `{n} movimientos` left + `≈ {converted}` right), "Este mes" panel titled **"Este mes, todo en dólares/pesos"** + subtitle (Ingresos/Gastos/Neto; **one** sparkline, under Ingresos), top-categories + recent lists with deep-links.
- [ ] **Análisis**: KPI tiles; Recharts donut (hover-to-highlight) + ranked breakdown; income-vs-expense area chart; top merchants.
- [ ] **Transacciones table**: category emoji tile, badge, account, 3-bar confidence meter, signed mono amounts, hover row actions, pagination (12/page), empty state.
- [ ] **Edit modal**: display-name + category picker + apply-scope (`single` / `matching_past_and_future` / `future_matching_only`) → `handleUpdateTransaction`.
- [ ] **Bulk-action bar**: auto-categorize / categorize / tag / delete → existing store handlers; toast + clear selection.
- [ ] Toasts via `sonner`; floating theme toggle (bottom-right) + Settings segment; honor `prefers-reduced-motion`; never gate resting visibility on an entrance animation.

## Done when
- [ ] All five screens match the screenshots in `../screenshots/` (light + dark).
- [ ] No reference to "Herramientas" remains; Import is an overlay, not a tab.
- [ ] Filtering exists in exactly one place (Transacciones).
- [ ] `npm run ci:check` passes (tests + lint + build).
