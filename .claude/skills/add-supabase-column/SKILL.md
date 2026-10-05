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
3. **Green: row mapping.** Each table's row mapping lives in its own service
   in `src/services/supabase/` — for transactions, `TransactionRow`,
   `transactionToRow` and `rowToTransaction` in
   `src/services/supabase/transactions.ts`. Map `null` from older rows to the
   model's default. Loads use `.select('*')`, but some reads name their
   columns: the import-dedup candidate lookup (`CANDIDATE_COLUMNS` in
   `transactions.ts`, feeding `src/services/dedup/import-dedup.ts`) needs the
   column only if dedup must see it.
4. **Green: the repository port.** Every read and write goes through
   `Repository` (`src/services/repository/repository.ts`):
   `src/services/repository/supabase-repository.ts` composes the
   `services/supabase/` functions, and
   `src/services/repository/in-memory-repository.ts` is the test adapter — a
   new table or operation goes into the interface and **both** adapters. A
   transaction field the user can edit after import also needs a key in
   `TransactionPatch` / `PATCH_KEYS` (`repository.ts`, the store side) and in
   `TransactionColumnsPatch` / `patchToColumns` (`transactions.ts`, the column
   side); the writes themselves live in
   `src/services/mutations/transaction-mutations.ts`. Loaded data reaches the
   store through `hydrateWorkspace` (`src/stores/workspace-store.ts`).
5. **Types.** Add the field to the model in `src/models/` (exported through
   `src/models/index.ts`).
6. **Locally.** `npm run dev:backend` re-applies `schema.sql` to the Docker
   stack (see the `run` skill) — check the feature end to end there.
7. **Docs.** If the table is new or its role changed, update the persistence
   table in `docs/architecture.md` (and the repository section if the port
   changed).

## The PR

- Say "**Schema change**" in the PR body, with the SQL the owner must apply
  (whole `schema.sql` in the SQL Editor, then `notify pgrst, 'reload schema';`).
- CI's `.github/workflows/schema-change.yml` adds the `schema-change` label.
  Add `needs-human-review` yourself. A human merges, after applying the SQL to
  the live database.
