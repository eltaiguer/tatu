# ADR-0007: Simplify the household flag to Hogar / No and one "remember" checkbox

## Status

Accepted. Partially supersedes [0005](0005-household-flag.md) (the
unassigned value, "Sin definir") and [0006](0006-separate-household-scope.md)
(the household scope radio).

## Date

2026-11-16

## Context

After the eight steps of [#251](https://github.com/eltaiguer/tatu/issues/251)
the household flag had five sources for one row's value (row → merchant rule
→ category default → seeded default → unassigned), seven controls that set
it, and six visual states on a 14px icon. The owner found it convoluted. An
audit (2026-11-16) found two parts of the model that cost more than they
give:

- **"Sin definir" (unassigned).** Every categorized expense resolves to a
  yes or no through its category default or the seeded one, so unassigned
  only ever means "uncategorized, no own choice, no merchant rule". It never
  changes a Hogar figure: Hogar mode, the Hogar filter and Hogar Insights
  leave out unassigned and not-household rows alike, and nothing shows the
  "no" side. What it does add is a second to-do for the same rows as "Sin
  categoría" (same count, same total), under its own name, on Resumen,
  Insights and the totals strip, plus a third filter value, a dashed house
  and a `sin_definir` export value.
- **The household scope radio (ADR-0006).** Its three options repeat the
  category radio's labels. "Esta y las que importes en el futuro" saves the
  rule and pins every past similar row to its current value as that row's
  own choice: correct, but hard to predict. What the owner needed from
  ADR-0006 was to set Hogar for every row of a merchant, and to combine that
  with a category for one row only.

## Decision

1. **The flag has two values: Hogar and No.** An uncategorized row with no
   choice of its own and no merchant rule resolves to **No**.
   `HouseholdStatus` loses `unassigned`. Every "Sin definir" surface goes
   (the Resumen hero line and banner, the Insights nudge, the Transacciones
   filter value and its totals tile, the dashed house); the "Sin categoría"
   to-do is the one nag for those rows. The export column `hogar` is
   `si` / `no` for counted expenses. Categorizing such a row makes it follow
   its new category's default, as any row does.
2. **The edit dialog's household scope is one checkbox**, "Recordar para
   todas las de [comercio]", under the Sí / No group, replacing the
   "Aplicar “gasto del hogar” a" radio. Checked, it saves the merchant rule
   and applies it to every similar row (today's "Todas las similares").
   There is no future-only option for Hogar. The category radio ("Aplicar
   nombre y categoría a") is unchanged, so a category for this row only and
   Hogar for the merchant still combine. What the dialog shows is what is
   saved:
   - With a rule covering the row, the box starts checked and the Sí / No
     group shows the rule's value; "Según categoría" is hidden while the box
     is checked (a rule is always a yes or a no). Changing Sí / No edits the
     rule.
   - Unchecking it deletes the rule: the merchant's other rows go back to
     their category, and this row keeps the value on screen as its own
     choice (none when that equals what its category says).
   - With no rule, the box starts unchecked and the group is this row's own
     choice ("Según categoría" / Sí / No).

   Settled while building it (#263), where the text above was silent:
   - A row whose own choice contradicts the rule (a house click or the bulk
     menu after the rule, or an old future-only pin) opens **unchecked** on
     that choice, with "Según comercio (X)" as the follow option. The row's
     own choice outranks the rule (ADR-0005), so the rule does not decide
     this row; leaving the box unchecked never deletes the rule. Checking it
     makes the value on screen the rule for all.
   - Unchecking keeps the **other rows' own choices**; only rows that followed
     the rule go back to their category. The same as deleting a rule from the
     Categorías list. This row keeps what it shows as its own choice, none
     when its category (the picked one, if the same save changes it) gives the
     same answer.
   - The dialog can no longer make a one-row exception on a rule-covered row
     (changing Sí / No with the box checked edits the rule); the one-click
     house still does.
   - The box's label names the row ("Recordar para todas las de [descripción
     visible]") with the reach as a hint ("Se aplica a N transacciones y a las
     que importes"). Checking over "Según categoría" preselects what the row
     shows; checking then unchecking without a pick writes nothing.

Unchanged from ADR-0005: precedence (row → merchant rule → category default
→ seeded default); rules are read, not stamped; split parts ignore merchant
rules; the flag never decides what counts toward totals.

## Alternatives considered

### Keep "Sin definir" in the model, hide it in the UI

Keeps the "never built on guesses" principle in code while removing the
noise. Rejected: a status nothing shows is one more branch every caller
must handle, and the only rows it covers are already flagged as "Sin
categoría".

### Keep the scope radio, rename its options

Fixes the repeated labels but keeps the future-only semantics nobody can
predict, for a case (a merchant whose past rows should differ from its
future ones) that does not come up for household spending.

## Consequences

- ADR-0005's "household totals are never built on guesses" no longer holds
  for uncategorized rows: they sit on the No side until categorized or
  marked. Hogar figures do not change.
- Hogar Insights' input does not change (unassigned rows were already left
  out); only the app-written "Sin definir" nudge goes.
- Rows pinned by an earlier future-only save keep their own choices; nothing
  is migrated. No schema change.
- Rules become easy to delete from the dialog (uncheck), so they need a place
  to be seen: a "Reglas del hogar" list in Categorías (merchant, Hogar: Sí /
  No, rows reached, delete with undo) ships with this change set.
- The one-click house and its "Aplicar a las N similares" toast are
  unchanged; the bulk menu stays rows-only.
