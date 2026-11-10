# ADR-0005: Household expenses as a yes/no flag beside the category

## Status

Proposed

## Date

2026-11-08

## Context

Categories answer _what_ the money went on (Alimentación, Restaurantes…).
The owner also needs to know _which expenses were for the household/family_,
so they can review household spending with their partner on their own screen
and decide what to cut ([#251](https://github.com/eltaiguer/tatu/issues/251)).
That is a second axis: a restaurant bill can be a family dinner or a solo
lunch, and moving rows into a "Hogar" or "Personal" category would hide what
they actually were.

`Transaction.tags` already exists, but it is free text, only matched by the
search box, unused by Resumen and never assigned automatically.

Whether a row is a household expense mostly follows its category (the
supermarket almost always is), with per-row exceptions. A first sketch had
two positive values, household and personal. It was dropped: "personal" is
just "not household", and a third named bucket made salary and transfers
look like personal spending.

## Decision

Implemented in this ADR's first PR:

- A household flag per row, resolved in one place, `resolveHousehold` in
  `src/services/household/household.ts`, returning `household`,
  `not_household` or `unassigned` ("Sin definir").
- Precedence: the row's own choice → the user's default for its category →
  a seeded default (`SEEDED_HOUSEHOLD_CATEGORIES`). Every other category,
  custom ones, income and transfers included, starts as not household. A
  user may still flag a category such as external transfers (rent paid by
  transfer) as household.
- An uncategorized row without a choice of its own is `unassigned`: it is
  counted on neither side, so household totals are never built on guesses.
  Sin categoría cannot be given a household default.
- A row's own choice survives a recategorization; only clearing it (`null`)
  removes it.
- Category defaults are looked up by normalized id
  (`buildCategoryHousehold`), and a stored value that is not a yes/no is
  ignored.
- The flag says nothing about whether a row counts toward totals; callers
  combine it with `services/spending/spending-rules.ts`.

Implemented in step 2 of #251: persistence of the row choice
(`transactions.household`) and of the per-category defaults
(`custom_categories.is_household`), with the write paths and no UI yet.

Implemented in step 3 of #251: the per-category default in Categorías, set
in two places: a house toggle on each tile of "Tus categorías" (one click,
saved at once) and a "Gasto del hogar" checkbox in the new/edit category form.
Sin categoría, Ingresos and deleted categories get neither. Choosing the
seeded default stores nothing (null), so the category keeps following the app;
only a different choice is stored.

Implemented in step 4 of #251: the household control on transactions, only on
counted expenses (`rowHouseholdView` is null for income, ignored rows and
split parents).

- A house next to the category badge on every row and card (`HouseToggle`),
  always visible. Faint when the row follows its category, solid brand colour
  when it was set by hand; filled = household, outline = not, dashed = Sin
  definir. A click flips it; when the new value is what the category alone says
  it writes null (back to following the category), else the boolean
  (`nextHouseholdChoice`). Quiet: no success toast, the house moves when the
  saved row comes back; a failure offers "Reintentar".
- A "Gasto del hogar" group in the edit dialog: "Según categoría (sí / no / sin
  definir)" (follows the dialog's own category picker), "Sí", "No". It is this
  transaction's own choice, not part of the apply-scope. It is offered only
  while the picked category counts as an expense, and written after the edit it
  came with, only when it changed; a household-only save does not rewrite the
  category (no confidence-1 write).
- A "Hogar" menu in the bulk bar: "Marcar como hogar", "Marcar como no hogar",
  "Según categoría". It applies to the selected rows that count as expenses and
  says how many were skipped ("no cuenta(n) como gasto").
- Split parts keep the parent's own choice (they spread the parent).

Implemented in step 5 of #251: the Hogar filter in Transacciones and the
`hogar` export column.

- A "Hogar" group in the filter bar (Todos · Hogar · Sin definir), URL
  `?hogar=si` / `?hogar=sin-definir`, counted by `hasActiveFilters`. It is
  part of `filterTransactions`: Hogar keeps counted expenses that resolve to
  household, Sin definir those that resolve to unassigned
  (`rowHouseholdView`), so income, ignored rows (even with "show ignored" on)
  and split parents never match. There is no "not household" value. Income
  and Hogar never combine: the latest pick wins (picking one while "Ingresos"
  is on sets the type back to Todos, picking Ingresos while one is on sets
  Hogar back to Todos), and a URL with `tipo=credit` drops `hogar`. Split parts are
  filtered one by one, as the category filter does: the parent shows above
  the parts that match.
- Under either value the totals strip is one tile: "Gastos del hogar" or
  "Sin definir" (with "Categorizalos o marcalos con la casita."), the
  home-currency total and the number of expenses.
- A `hogar` column after `cuenta_en_totales` in the CSV and the PDF report:
  `si` / `no` / `sin_definir` for counted expenses, empty for every other row.

Implemented in step 6 of #251: the Todo / Hogar mode on Resumen.

- A "Todo · Hogar" toggle (group "Ver gastos", house icon) beside the FX chip
  and currency toggle. The mode is `/?hogar=si` on Resumen (REPLACE; Todo = no
  param, any other value = Todo); the sidebar's Resumen link goes back to `/`.
- Hogar mode is one cut at the top of `Dashboard.tsx`: the rows that
  `rowHouseholdView` resolves to household replace `transactions` in every
  figure ("Qué cambió", donut, merchants, recent rows, "Mes a mes", accounts,
  currency split). The months of "Mes a mes" and which of them are complete
  still come from every row (`coverage` of `buildMonthlyTrendRows` /
  `categoryChanges`): it is about the statements, so a month with no household
  spend is a bar at 0.
- Hero: "Gastos del hogar $X" for the Todo hero's month (it never moves with
  the mode: `buildCurrentMonthSummary` takes the reference month, so a month
  with no household spend reads $0). The income, balance and savings views
  are not shown, nor the income bars of "Mes a mes"; one link opens the
  month's household expenses (hidden when the month has none).
- Every drill-through in Hogar mode adds `household: 'household'` (one wrapper
  in `Dashboard.tsx`; Todo adds no key).
- Sin definir apart: a muted hero line "Sin definir este mes: $Z" (hidden at
  zero) opening `household: 'unassigned'` for the month, and, in place of the
  "Sin categoría" nudge, a "Sin definir" banner with the all-time total and
  count. Never inside the household totals.
- Todo mode's hero adds "Hogar $X de $Y gastados", a button that switches to
  Hogar mode and moves focus to the hero (hidden when $X is 0).
- With transactions but no household spend at all Hogar mode shows
  "Todavía no hay gastos del hogar" and a link to Categorías instead of zeroed
  cards, plus the Sin definir banner when there are such rows.
- The mode is read on Resumen only (the Transacciones filter shares the `hogar`
  token); re-selecting Resumen in the sidebar replaces the history entry and
  returns to Todo.

Planned for the later PRs of #251:

- Household-aware Insights.
- A mixed purchase is split, and each part gets its own flag.
- No merchant rules for the flag in the first version.

## Alternatives considered

### Tags

Free text ("hogar", "Hogar ", "casa") makes totals fragile, and tags carry no
category default, so every row would have to be tagged by hand.

### A "Hogar" (or "Personal") category

Loses the real category, which is the other half of "where did the money go".

### Household / personal as two named values

"Personal" is only the complement of household. Naming it forces a decision
for rows nobody thinks of as personal (salary, card payments) and a third UI
position nobody needs.

## Consequences

- Every surface that shows household spending must call `resolveHousehold`;
  nothing re-derives it.
- Persistence needs a schema change applied by hand (`supabase/README.md`).
- Changing a category's default moves all its rows that have no choice of
  their own at once. That is intended: most rows should follow their
  category, and only the exceptions are flagged by hand.
- If repeated per-merchant exceptions appear, merchant rules for the flag are
  the natural follow-up.
