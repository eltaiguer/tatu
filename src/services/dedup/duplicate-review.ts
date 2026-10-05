import type { Transaction } from '../../models'
import { cardNumber, transactionFingerprint } from './import-dedup'

/**
 * The one-off "Buscar posibles duplicados" review (#167): rows stored before
 * content dedup (#57) shipped, when an overlapping export inserted the same
 * bank row a second time under a new id.
 *
 * Rows are grouped by the import fingerprint (`transactionFingerprint`), then
 * split by the statement's own per-movement reference, which the fingerprint
 * leaves out: card number + authorization number on card rows, `referencia`
 * on bank rows. Two rows whose references differ are different movements —
 * e.g. the same charge on the same day on two cards, whose statements are
 * separate files and so separate import runs (the import keeps those apart
 * too, reading the card through the same `cardNumber`; unlike the import, a
 * row lacking its reference sends the group to hand review instead of
 * matching either side). Conservative by design —
 * nothing is deleted without the user:
 * - A group whose rows all come from one import run is a genuine identical
 *   pair inside one statement: never shown.
 * - A group with a split copy, or a copy without a reference to compare, is
 *   left to review by hand (`review`), nothing pre-selected. A split parent
 *   is never offered for deletion at all: deleting it removes its parts for
 *   good, which the review's undo could not bring back.
 * - A group with any row whose import run is unknown (stored before runs
 *   were recorded) can't be told apart from a genuine pair: it is shown in
 *   its own section with nothing pre-selected.
 * - Any other group from two or more import runs is flagged. Each run's copy
 *   of the statement is complete, so the group really holds as many rows as
 *   the largest single run stored; those are kept (the oldest ones) and every
 *   other copy is pre-selected for deletion. For two copies that is "all but
 *   the oldest".
 *
 * Split parts are never grouped: they have no fingerprint (not bank rows).
 */
export interface DuplicateGroup {
  /** Oldest stored first. */
  rows: Transaction[]
  /** Ids pre-selected for deletion. */
  preselected: string[]
}

/** Why a group is left to review by hand. */
export type ReviewReason = 'split' | 'no_reference'

export interface DuplicateScan {
  /** Stored by different import runs: overlapping exports. */
  flagged: DuplicateGroup[]
  /** At least one row's import run is unknown; nothing pre-selected. */
  unknownOrigin: DuplicateGroup[]
  /** A split copy, or a copy with no reference to compare; none pre-selected. */
  review: Array<DuplicateGroup & { reason: ReviewReason }>
}

export function findPossibleDuplicates(
  transactions: Transaction[]
): DuplicateScan {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const fingerprint = transactionFingerprint(tx)
    if (fingerprint === null) continue
    const group = groups.get(fingerprint) ?? []
    group.push(tx)
    groups.set(fingerprint, group)
  }

  const scan: DuplicateScan = { flagged: [], unknownOrigin: [], review: [] }
  for (const group of groups.values()) {
    for (const candidates of splitByReference(group)) {
      classify(candidates, scan)
    }
  }
  scan.flagged.sort(byMovementDate)
  scan.unknownOrigin.sort(byMovementDate)
  scan.review.sort(byMovementDate)
  return scan
}

function classify(
  candidates: { rows: Transaction[]; referenced: boolean },
  scan: DuplicateScan
): void {
  if (candidates.rows.length < 2) return
  const rows = [...candidates.rows].sort(byStoredTime)
  const runs = new Set(rows.map((tx) => tx.importId))
  // One known run: a genuine identical pair inside one statement.
  if (runs.size === 1 && rows[0].importId) return
  if (rows.some((tx) => tx.isSplitParent)) {
    scan.review.push({ rows, preselected: [], reason: 'split' })
    return
  }
  if (!candidates.referenced) {
    scan.review.push({ rows, preselected: [], reason: 'no_reference' })
    return
  }
  if (rows.some((tx) => !tx.importId)) {
    scan.unknownOrigin.push({ rows, preselected: [] })
    return
  }
  const perRun = new Map<string, number>()
  for (const tx of rows) {
    perRun.set(tx.importId!, (perRun.get(tx.importId!) ?? 0) + 1)
  }
  const keep = Math.max(...perRun.values())
  scan.flagged.push({
    rows,
    preselected: rows.slice(keep).map((tx) => tx.id),
  })
}

/**
 * Splits a fingerprint group into the rows that may be the same movement.
 * When every row carries its reference, rows with different references are
 * different movements. When some row lacks it, nothing can be ruled out: the
 * whole group stays together, marked unreferenced.
 */
function splitByReference(
  group: Transaction[]
): Array<{ rows: Transaction[]; referenced: boolean }> {
  const references = group.map(movementReference)
  if (references.some((ref) => ref === null)) {
    return [{ rows: group, referenced: false }]
  }
  const byReference = new Map<string, Transaction[]>()
  group.forEach((tx, i) => {
    const key = references[i]!
    byReference.set(key, [...(byReference.get(key) ?? []), tx])
  })
  return [...byReference.values()].map((rows) => ({ rows, referenced: true }))
}

// The statement's own id for a movement: card + authorization number on card
// rows, `referencia` on bank rows. null when the stored raw data lacks it.
// The card number is read by the import's own `cardNumber`, so the review
// never groups rows the import keeps apart as two cards' charges.
function movementReference(tx: Transaction): string | null {
  const raw = (tx.rawData ?? {}) as Record<string, unknown>
  const fields =
    tx.source === 'credit_card'
      ? [cardNumber(tx) ?? '', raw.numeroAutorizacion]
      : [raw.referencia]
  const values = fields.map((value) =>
    typeof value === 'string' ? value.trim() : ''
  )
  return values.every((value) => value !== '') ? JSON.stringify(values) : null
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
