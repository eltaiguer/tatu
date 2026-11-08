# ADR-0005: Household vs personal as its own dimension (scope)

## Status

Proposed

## Date

2026-11-08

## Context

Categories answer _what_ the money went on (Alimentación, Restaurantes…).
The owner also needs _who it was for_: the household/family or just them, so
they can review household spending with their partner on their own screen and
decide what to cut. That is a second axis: a restaurant bill can be a family
dinner or a solo lunch, and putting "personal" spending in the `Personal`
category would hide what it actually was.

`Transaction.tags` already exists, but it is free text, only matched by the
search box, unused by Resumen and never assigned automatically.

Which side a row falls on mostly follows its category (the supermarket is
almost always household), with per-row exceptions.

## Decision

- A dedicated `scope` (`'household' | 'personal'`, UI "Hogar" / "Personal")
  resolved by one function, `resolveScope` in `src/services/scope/scope.ts`.
  Precedence: the row's own choice → the user's mapping for its category →
  a seeded default (`SEEDED_HOUSEHOLD_CATEGORIES`: Alimentación, Servicios,
  Vivienda, Salud, Seguros, Educación, Automotor; everything else, custom
  categories included, Personal).
- Uncategorized rows without a row choice are `'unassigned'` ("Sin definir")
  and are never counted on either side, so household totals are not built on
  guesses. Sin categoría cannot be mapped to a side.
- Only two values; a mixed purchase is split and each part gets its own scope.
- A row's own choice survives recategorization until the user resets it to
  "Según categoría".
- The household view is a Todo / Hogar / Personal mode on Resumen (in the
  URL), plus an Ámbito filter in Transacciones. No new view.
- No merchant rules for scope in the first version.

Delivered in steps: the resolver (this ADR's first PR), then persistence
(`transactions.scope`, a `category_scopes` table), the Categorías and row
toggles, the Transacciones filter, the Resumen mode, and scope-aware
Insights.

## Alternatives considered

### Tags

Free text ("hogar", "Hogar ", "casa") makes totals fragile, and tags carry no
category default, so every row would have to be tagged by hand.

### A "Personal" (or "Hogar") category

Loses the real category, which is the other half of "where did the money go".

### A third "Compartido" value

Splits already express a mixed purchase exactly; a third bucket would be a
vague total nobody can act on.

## Consequences

- Every surface that shows the split must call `resolveScope`; nothing
  re-derives it.
- Two schema changes to apply by hand (`supabase/README.md`): a nullable
  `transactions.scope` column and a `category_scopes` table.
- Changing a category's mapping moves all its rows without a row choice at
  once, which is intended (Q9 of the planning session: rows come pre-filled
  from their category).
- If repeated per-merchant exceptions appear, merchant rules for scope are the
  natural follow-up.
