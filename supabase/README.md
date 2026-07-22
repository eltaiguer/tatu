# Supabase schema

`schema.sql` is the single source of truth for the database structure (tables,
columns, constraints, RLS policies). It is written to be **idempotent** — every
statement uses `create ... if not exists` / `add column if not exists` guards, so
it is safe to run repeatedly.

## ⚠️ It is NOT applied automatically

Nothing in the app or CI runs `schema.sql` against the live database. Editing
this file changes the *intended* schema only. Until you apply it manually, the
live database and the app code disagree — and PostgREST (Supabase's REST layer)
will reject any request that references a missing column with:

```
Could not find the '<column>' column of 'transactions' in the schema cache
```

## Applying a change

Whenever `schema.sql` changes (or after pulling a branch that changed it):

1. Open the Supabase Dashboard → your project → **SQL Editor** → **New query**.
2. Paste the **entire** contents of `schema.sql` and **Run**. The `if not exists`
   guards mean already-applied statements are no-ops, so running the whole file
   is the safe default — you don't have to isolate just the new lines.
3. Run the cache reload so PostgREST picks up the change immediately (otherwise
   it can take a few minutes, or you may keep seeing the schema-cache error):

   ```sql
   notify pgrst, 'reload schema';
   ```

4. Retry the action in the app. No redeploy is needed — schema changes are
   database-only.

## Checklist for adding a new column

- [ ] Add the column to `schema.sql` with `add column if not exists`.
- [ ] Map it in `src/services/supabase/transactions.ts` (both the row type and
      the to/from-DB converters).
- [ ] Add/adjust the model field in `src/models/`.
- [ ] Apply `schema.sql` in the SQL Editor (steps above) **before** shipping the
      feature — code that writes the column will 400 until the DB has it.
- [ ] `notify pgrst, 'reload schema';`
