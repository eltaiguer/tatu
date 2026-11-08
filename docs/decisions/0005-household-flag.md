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

Planned for the later PRs of #251:

- A one-click house toggle per row (dimmed when it comes from the category),
  in the edit dialog (with "Según categoría" to clear the row's choice) and
  as a bulk action, and the per-category default in Categorías.
- A Hogar filter in Transacciones (Todos / Solo hogar / Sin definir).
- A Todo / Hogar mode on Resumen, kept in the URL. Hogar mode shows counted
  expenses only, plus the Sin definir amount apart.
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
