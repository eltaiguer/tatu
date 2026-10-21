// How both repository adapters cut large writes (#60, #61). Kept apart from
// the adapters so the in-memory one fails and succeeds in exactly the same
// slices as Supabase does — a test that fails "the second chunk" means the
// same rows in both.
import type { TransactionPatch, WriteOutcome } from './repository'

/**
 * Ids per `update(...).in('transaction_id', ids)` request. Each request is
 * one statement, so it is atomic. Transaction ids are ~20 characters
 * (`txn_<hash>-<row>`, maybe `_cN`/`_split_N`), so 100 of them keep the URL
 * near 3 KB, well inside PostgREST/gateway limits (~8 KB).
 */
export const UPDATE_CHUNK_SIZE = 100

/** Rows per import INSERT request; each carries its `raw_data` blob. */
export const INSERT_CHUNK_SIZE = 500

/** Chunk requests in flight at once, so a 5,000-row edit isn't 50 at once. */
export const MAX_CONCURRENT_CHUNKS = 4

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Rows whose patches are identical travel together: a same-value edit of
 * 300 rows is 3 requests, and auto-categorize is one request per (category,
 * confidence) per 100 rows.
 */
export function groupByPatch(
  changes: ReadonlyMap<string, TransactionPatch>
): Array<{ patch: TransactionPatch; ids: string[] }> {
  const groups = new Map<string, { patch: TransactionPatch; ids: string[] }>()
  for (const [id, patch] of changes) {
    const key = patchKey(patch)
    const group = groups.get(key)
    if (group) group.ids.push(id)
    else groups.set(key, { patch, ids: [id] })
  }
  return Array.from(groups.values())
}

function patchKey(patch: TransactionPatch): string {
  return JSON.stringify(
    Object.keys(patch)
      .filter((key) => patch[key as keyof TransactionPatch] !== undefined)
      .sort()
      .map((key) => [key, patch[key as keyof TransactionPatch]])
  )
}

/**
 * Runs `write` once per chunk of ids — at most MAX_CONCURRENT_CHUNKS at a
 * time — and waits for every chunk, successful or not (allSettled). `write`
 * resolves with the ids the server reports it changed; an id in a chunk that
 * succeeded but isn't reported is `missing` (the row is gone), an id in a
 * chunk that failed is `failed` (retrying may work).
 */
export async function settleChunks(
  jobs: Array<{ ids: string[]; write: (ids: string[]) => Promise<string[]> }>
): Promise<WriteOutcome> {
  const tasks = jobs.flatMap(({ ids, write }) =>
    chunk(ids, UPDATE_CHUNK_SIZE).map((ids) => ({ ids, write }))
  )
  const outcome: WriteOutcome = { saved: [], failed: [], missing: [] }
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const { ids, write } = tasks[next++]
      try {
        const written = new Set(await write(ids))
        for (const id of ids) {
          if (written.has(id)) outcome.saved.push(id)
          else outcome.missing.push(id)
        }
      } catch (error) {
        outcome.failed.push(...ids)
        outcome.error ??= error
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_CHUNKS, tasks.length) },
      worker
    )
  )
  return outcome
}

/**
 * Inserts `rows` in sequential chunks and stops at the first chunk that
 * fails (#61). Chunks before it stay committed; `saved` is exactly those
 * rows, in order. `shouldContinue` is asked before each chunk (an import
 * stops when the user signed out meanwhile).
 */
export async function insertSequentially<T>(
  rows: readonly T[],
  insert: (rows: T[]) => Promise<void>,
  shouldContinue: () => boolean = () => true
): Promise<{ saved: T[]; error?: unknown }> {
  const saved: T[] = []
  for (const part of chunk(rows, INSERT_CHUNK_SIZE)) {
    if (!shouldContinue()) {
      return { saved, error: new Error('import stopped') }
    }
    try {
      await insert(part)
    } catch (error) {
      return { saved, error }
    }
    saved.push(...part)
  }
  return { saved }
}
