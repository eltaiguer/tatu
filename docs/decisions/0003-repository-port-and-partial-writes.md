# ADR-0003: Repository port, one mutation module, and "screen mirrors database"

## Status

Proposed

## Date

2026-10-04

## Context

Every transaction change was written twice by hand in
`useTransactionHandlers.ts`: a remote payload (where `null` cleared a column)
and a local patch (where `undefined` did). Bulk edits sent one PATCH per row
through `Promise.all`; when one failed, the server was left partly updated
while the screen showed nothing changed (#60). An import was one unbounded
upsert, lost entirely when it was too large (#61). The description and
merchant overrides could half-save. Services read an ambient session
(`supabase/runtime.ts`) that could be a render behind, and handlers wrote to <!-- historical -->
the store after awaits even if another user had signed in meanwhile (#117
residual). Tests mocked persistence at three levels and asserted on payload
shapes (#119).

The owner decided the write-failure rule on 2026-10-04 (#119, #60, #61), with
no schema change.

## Decision

- A **repository port** (`src/services/repository/repository.ts`) bound to one
  user, with two adapters: Supabase (`supabase-repository.ts`) and in-memory
  (`in-memory-repository.ts`, for tests). Batching belongs to the adapters
  (`batching.ts`). Workspace hydrate, preference saves, rule stores and
  transaction writes all go through it; `runtime.ts` is gone. <!-- historical -->
- **One mutation module** (`src/services/mutations/transaction-mutations.ts`).
  Each change is one `TransactionPatch` per row (absent = untouched,
  `null` = clear) applied to the repository and, for the rows the server
  confirmed, to the store.
- **Screen mirrors database.** Same-value bulk writes are one
  `update(...).in('transaction_id', ≤100 ids)` per chunk, each atomic, settled
  independently; the saved chunks are applied and a `PartialWriteError`
  ("Se actualizaron N de M — reintentar") retries only the failed remainder.
  Imports insert sequential 500-row chunks and stop at the first failure;
  committed chunks stay, the store gets exactly those rows, the run is marked
  `failed` with "N de M guardadas". `raw_data` and its index are unchanged.
- **Override pair rollback.** Both overrides go to the server before memory
  changes; if the second fails, the first is compensated on the server; if
  that fails too, memory shows what the server holds.
- **Split / unsplit order** never leaves a split parent without parts
  (a row no list can show): parts before the parent's flag on split, flag
  before parts on unsplit, each with a checked compensation.
- **Account switches.** After every await a write checks the workspace owner
  and drops its in-memory changes for another user; undo and retry stay
  bound to the user who wrote.

## Alternatives considered

### All-or-nothing bulk writes through an RPC

One transaction per bulk edit, no partial state. Needs a Postgres function
(schema change, applied by hand) and turns one bad row into a failed edit of
hundreds. Rejected by the owner in favour of per-chunk atomicity.

### A `partial` import-run status

Clearer audit records, but a schema change; "failed" plus "N de M guardadas"
in `error_message` carries the same information.

### Optimistic local writes with reconcile

Shows changes before the server confirms and reconciles later. Needs a dirty
state per row and a reconcile loop; the screen could show data the server
never got.

## Consequences

- Handlers are thin; apply-scope, split-row rules, override writes and the
  failure rule each live in one place.
- Tests assert on the store and the in-memory repository. The in-memory
  adapter must keep matching Supabase's semantics (chunking, missing rows,
  insert conflicts, RLS by acting user); its divergence is the main risk.
- Users can see "Se actualizaron N de M" and must retry; a bulk edit chain
  (category, then each tag) stops at the first partial step.
- A same user signing out and back in mid-write is still treated as the same
  owner (the guard is on the user id, not the load generation).
