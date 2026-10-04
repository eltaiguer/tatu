---
name: add-supabase-column
description: Checklist for changing the Tatu database schema. Use when adding a column or table to supabase/schema.sql, or persisting a new field on a transaction, preference, override or pattern.
---

# Add a Supabase column (or table)

`supabase/schema.sql` is applied **by hand** — nothing in the app or CI runs
it. Code that writes a column the live database lacks gets a 400 ("Could not
find the '…' column … in the schema cache"). Read `supabase/README.md` first;
its checklist is the source of truth for the apply steps.

## Steps

1. **Red.** Write the failing test first, in the table's service test (e.g.
   `src/services/supabase/transactions.test.ts`): the new field round-trips
   through the row mapping, and the persisted row carries the snake_case
   column.
2. **Schema.** In `supabase/schema.sql`:
   - Existing table: `alter table … add column if not exists …` with a default
     or nullable, so rows written before the change still load. RLS and grants
     are per table, so nothing else changes.
   - New table: `create table if not exists`, `enable row level security`, a
     `grant … to authenticated`, the four `drop policy if exists` +
     `create policy "<table>_<op>_own"` pairs (`auth.uid() = user_id`), and a
     `set_updated_at_timestamp` trigger if it has `updated_at`. Copy the shape
     of `custom_patterns`.
   - Keep every statement idempotent: the whole file is re-run on every apply.
3. **Green: row mapping.** Every service reads with `.select('*')`, so there
   is no column list to edit. Update the table's own service in
   `src/services/supabase/` — for transactions, `TransactionRow`,
   `transactionToRow` and `rowToTransaction` in
   `src/services/supabase/transactions.ts`. Map `null` from older rows to the
   model's default.
4. **Types.** Add the field to the model in `src/models/` (exported through
   `src/models/index.ts`).
5. **Locally.** `npm run dev:backend` re-applies `schema.sql` to the Docker
   stack (see the `run` skill) — check the feature end to end there.
6. **Docs.** If the table is new or its role changed, update the persistence
   table in `docs/architecture.md`.

## The PR

- Say "**Schema change**" in the PR body, with the SQL the owner must apply
  (whole `schema.sql` in the SQL Editor, then `notify pgrst, 'reload schema';`).
- CI's `.github/workflows/schema-change.yml` adds the `schema-change` label.
  Add `needs-human-review` yourself. A human merges, after applying the SQL to
  the live database.
