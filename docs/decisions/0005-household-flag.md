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
- A "Gasto del hogar" group in the edit dialog: "Según categoría (Sí / No / Sin
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
  spend is a bar at 0, with no drill (it would open an empty list).
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
  Hogar mode and moves focus to the hero (hidden when $X is 0; its accessible
  name starts with the visible text, and an arrow marks it as a link).
- With transactions but no household spend at all Hogar mode shows
  "Todavía no hay gastos del hogar" and a link to Categorías instead of zeroed
  cards, plus the Sin definir banner when there are such rows.
- The mode is read on Resumen only (the Transacciones filter shares the `hogar`
  token); re-selecting Resumen in the sidebar replaces the history entry and
  returns to Todo. (Step 8 later made Insights read it too: `App.tsx` reads the
  token on Resumen and Insights.)

Implemented in step 7 of #251: the household flag remembered per merchant.
This reverses "no merchant rules in the first version": the owner expects Hogar
to behave like categories, where one choice reaches the merchant's other rows
and the ones imported later.

- Precedence becomes: the row's own choice → the merchant rule → the user's
  category default → the seeded default → Sin definir. A rule also covers an
  uncategorized row (it is then not Sin definir). `HouseholdResolution.source`
  (`row` / `merchant` / `category`) replaces `isOverride`; the dot on the house
  is `row` only, a rule shows the faint house like a category default.
- Rules are read, not stamped: a rule is one row in `household_rules`
  (`merchantOverrideKey` of the raw description, like category rules, so rows
  imported later follow it with no import change), and resolution reads it.
  Deleting the rule puts its rows back on their category. The alternative,
  stamping every similar row with its own choice, would lose the difference
  between "chosen" and "inherited" and make a rule impossible to undo.
- A split part ignores merchant rules (a split is a mixed purchase, as
  `findSimilarTransactions` already leaves it out) but keeps its own choice and
  its category default.
- Edit dialog, one "Aplicar a" for category and Hogar. Solo esta: the row's own
  choice, its follow option reads "Según comercio (Sí|No)" when a rule covers
  the row. Todas las similares: Sí/No saves the rule and clears the own choice
  of every similar row; "Según categoría" deletes the rule. Esta y las que
  importes en el futuro: saves or deletes the rule, and every other similar row
  without an own choice whose shown value would change keeps it as its own
  choice (a Sin definir row has nothing to keep and takes the rule). Under the
  two rule scopes the radio starts at the rule and the household part is
  written only if it was touched; a Hogar-only save never reaches
  `editTransaction`.
- The one-click house still writes only its row; its toast offers "Aplicar a las
  N similares" (N = the other rows whose shown value would change), which runs
  the Todas las similares path. The bulk menu stays rows-only and no screen
  lists rules: they are managed through the dialog, as category rules are.

Implemented in step 8 of #251: Hogar mode on Insights (`/insights?hogar=si`).

- Same "Todo · Hogar" toggle and URL token as Resumen (REPLACE; Todo = no
  param; the sidebar's Insights link opens Todo). Read on Resumen and Insights
  only.
- Hogar is its **own analysis**, not a filter over Todo's cards: the household
  rows (`partitionByHousehold`, counted expenses only) go through the same
  `buildInsightInput` with `scope: 'hogar'`, whose trend is `{ month, expense }`
  only (spending, no income or savings, as on Resumen). The partner reads it,
  so it must never carry personal cards.
- Own prompt paragraph (`buildInsightSystemPrompt('hogar')`: household
  figures only, never talk about income, savings or personal spending) and its
  own version constant, `HOUSEHOLD_INSIGHT_PROMPT_VERSION`, folded into the
  Hogar hash together with `INSIGHT_PROMPT_VERSION` (`base.household`): its
  prompt is Todo's plus a paragraph, so a base change stales both modes.
  Recurring charges are detected over the household rows only, but the
  history's start/end and the months of the trend come from every imported row
  (`coverage`): a household subscription that stopped two imported months ago
  reads as lapsed, and a month with no household spend is a point at 0, as on
  Resumen's "Mes a mes".
- Own cache, own table: `ai_household_insights`, same shape and policy as
  `ai_insights`, one row per user. A table beside the old one rather than a
  `mode` column: no primary-key migration, and Todo's cache path, hash, prompt
  and table stay exactly as they were, so every cached Todo row stays fresh
  (pinned by a hash test). The repository port takes a mode:
  `loadInsights(mode?)` / `saveInsights(row, mode?)`, `'todo'` by default; the
  cache functions pick it from `input.scope`.
- Stale like Todo (hash of the Hogar input): a house click, a merchant rule or
  a category default that moves a row in or out of the household shows the
  banner; nothing regenerates by itself. Todo is not made stale by those.
- Sin definir rows are left out of the input. A `SpendNudge` row (Resumen's
  component), written by the app and not by Claude, says so: "Sin definir: no
  entran en este análisis", with the total and count, opening
  `{ type: 'debit', household: 'unassigned' }`. It shows only while the AI is
  configured (above the cards and above the empty state). A Hogar
  card's "Ver transacciones →" adds `household: 'household'`.
- No household spend yet: the Resumen empty state ("Todavía no hay gastos del
  hogar") and no Generar button.
- A lookup, a running generation and an error each belong to the mode they
  started in (`useInsightsByMode`, one record per mode): switching mode never
  shows or saves one in the other, a result that finishes while the user is in
  the other mode is kept for when they return, and staleness is derived from
  the hash of the input a result came from, so a result that finished after the
  data changed shows the banner. A failed cache lookup still offers Generar.
- Until the table is applied by hand, loading Hogar insights reads as no cache,
  a reset skips it (clearing either cache is best-effort and never fails
  "reset all data"), and saving a generation says "Falta crear la tabla de
  insights del hogar…" (the generated cards still show).

Planned for the later PRs of #251:

- A mixed purchase is split, and each part gets its own flag.

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
- A per-merchant rule is one more place a row's value can come from; every
  surface reads `HouseholdResolution.source` instead of guessing.
- `ai_household_insights` (step 8) also needs the manual apply, but nothing
  breaks without it: only generating Hogar insights is blocked.
- The new table needs a manual apply of `schema.sql` before the code ships
  (`supabase/README.md`). Until then the app still loads (a missing table reads
  as no rules, as for `ai_insights`) but a rule cannot be saved.
- The rules store is subscribable (`useHouseholdRules`): a rule can change what
  rows show without any row being written, so Transacciones, the Hogar filter
  and Resumen re-render on it.
