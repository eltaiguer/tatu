import type { Transaction } from '../../models'
import { transactionFingerprint } from './import-dedup'

/**
 * The one-off "Buscar posibles duplicados" review (#167): rows stored before
 * content dedup (#57) shipped, when an overlapping export inserted the same
 * bank row a second time under a new id.
 *
 * Rows are grouped by the import fingerprint (`transactionFingerprint`), so a
 * group is exactly what a re-import today would have recognised as the same
 * row. Conservative by design — nothing is deleted without the user:
 * - A group whose rows all come from one import run is a genuine identical
 *   pair inside one statement: never shown.
 * - A group whose rows come from two or more import runs is flagged. Each
 *   run's copy of the statement is complete, so the group really holds as
 *   many rows as the largest single run stored; those are kept (the oldest
 *   ones) and every other copy is pre-selected for deletion. For two copies
 *   that is "all but the oldest".
 * - A group with any row whose import run is unknown (stored before runs
 *   were recorded) can't be told apart from a genuine pair: it is shown in
 *   its own section with nothing pre-selected.
 *
 * Split rows are left out: parts have no fingerprint (they are not bank
 * rows), and deleting a split parent removes its parts for good, which the
 * review's undo could not bring back.
 */
export interface DuplicateGroup {
  /** Oldest stored first. */
  rows: Transaction[]
  /** Ids pre-selected for deletion. */
  preselected: string[]
}

export interface DuplicateScan {
  /** Stored by different import runs: overlapping exports. */
  flagged: DuplicateGroup[]
  /** At least one row's import run is unknown; nothing pre-selected. */
  unknownOrigin: DuplicateGroup[]
}

export function findPossibleDuplicates(
  transactions: Transaction[]
): DuplicateScan {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.isSplitParent) continue
    const fingerprint = transactionFingerprint(tx)
    if (fingerprint === null) continue
    const group = groups.get(fingerprint) ?? []
    group.push(tx)
    groups.set(fingerprint, group)
  }

  const scan: DuplicateScan = { flagged: [], unknownOrigin: [] }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const rows = [...group].sort(byStoredTime)
    if (rows.some((tx) => !tx.importId)) {
      scan.unknownOrigin.push({ rows, preselected: [] })
      continue
    }
    const perRun = new Map<string, number>()
    for (const tx of rows) {
      perRun.set(tx.importId!, (perRun.get(tx.importId!) ?? 0) + 1)
    }
    if (perRun.size < 2) continue
    const keep = Math.max(...perRun.values())
    scan.flagged.push({
      rows,
      preselected: rows.slice(keep).map((tx) => tx.id),
    })
  }
  scan.flagged.sort(byMovementDate)
  scan.unknownOrigin.sort(byMovementDate)
  return scan
}

// Oldest stored first; a row without a stored time was imported in this
// session, so it is the newest. Ties keep a stable, id-based order.
function byStoredTime(a: Transaction, b: Transaction): number {
  const at = a.createdAt?.getTime() ?? Infinity
  const bt = b.createdAt?.getTime() ?? Infinity
  if (at !== bt) return at < bt ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// Most recent movement first, as Transacciones lists them.
function byMovementDate(a: DuplicateGroup, b: DuplicateGroup): number {
  return b.rows[0].date.getTime() - a.rows[0].date.getTime()
}
