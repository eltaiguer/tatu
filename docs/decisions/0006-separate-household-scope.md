# ADR-0006: A separate "apply to" for the household choice in the edit dialog

## Status

Proposed

## Date

2026-11-15

## Context

ADR-0005 gave the edit dialog one "Aplicar a" for both the name/category and
the household choice: "Todas las similares" made the household choice a
merchant rule and also spread the category. That radio's legend reads
"Aplicar nombre y categoría a", and the "Gasto del hogar" group said what it
reached only in a faint suffix. In use, the owner could not find a way to set
Hogar for every similar row. They also could not combine the two, for example
a category for this row only with Hogar for every row of the merchant
([#251](https://github.com/eltaiguer/tatu/issues/251)).

## Decision

The household choice gets its own radio, "Aplicar “gasto del hogar” a", under
the Sí/No group in `EditTransactionDialog`. It has the same three options as
the category radio ("Solo esta transacción" / "Todas las similares · …" /
"Esta y las que importes en el futuro") and starts at Solo esta.

- The two radios are independent. `EditTransactionDraft.householdScope`
  decides whether `applyHouseholdToSimilar` runs (and with which scope);
  `applyScope` reaches only the name and category.
- The radio is shown only when a rule can be made: a counted expense, not a
  split part, with a merchant key, and a view that can save rules
  (`canSetHouseholdRule`). Otherwise the group's legend says "· solo esta
  transacción", as before.
- "Todas las similares" carries the Hogar reach (`rowsSharingMerchantRule`).
- The radio shows what the save writes:
  - A Sí / No on screen carries over when the household scope changes. A Sí
    picked for this row becomes the rule's Sí, and back again.
  - A "Según …" does not carry over. It means "follow" under Solo esta and
    "delete the rule" under a rule scope. The radio shows the new scope's
    starting point instead (the rule, or "Según categoría"), untouched.
- A household-only save still skips the category write, but only when the
  category radio is at Solo esta. Picking "Todas las similares" for the
  category is a request for that rule, so it is written.
- When both writes reach several rows, the toast names both:
  "Cambios aplicados a N transacciones · gasto del hogar en M".

What ADR-0005 decided about the rule itself is unchanged: rules are read, not
stamped; future-only pins past rows; "Según categoría" deletes the rule; the
one-click toast and the bulk menu.

## Alternatives considered

### Keep one shared "Aplicar a" and rename its legend

This would fix the label, but still couldn't express a category for this row
plus Hogar for all. It also keeps a category rule and a household rule tied
together, although they answer different questions.

### A single "Recordar para todas las de este comercio" checkbox

More compact, but it drops the future-only option that ADR-0005 built, and
it reads differently from the category radio right above it.

## Consequences

- The dialog grows by one radio group, shown only where a rule is possible.
- Two radios share option labels. Each is a named `fieldset`, so tests and
  screen readers tell them apart by their group.
- ADR-0005 is partially superseded: its "one 'Aplicar a' for category and
  Hogar" bullet.
- No schema or mutation change.
