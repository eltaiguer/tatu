import type { Transaction } from '../../models'

/**
 * Content dedup at import (#57).
 *
 * Transaction ids hash the row's position in the file, so the same bank row
 * gets a new id when an overlapping export shifts it. Imports therefore match
 * rows by *content* — the fingerprint below — and keep the id scheme as is.
 *
 * The fingerprint is (source, raw date string, raw description, signed
 * amount in cents, currency):
 * - date: the raw `fecha` cell (`rawData.fecha`), never the parsed `Date`, so
 *   a change in how dates are parsed (#58) can't turn a stored row into a new
 *   one. Rows stored without `raw_data.fecha` (none are expected: raw_data has
 *   been written since the first Supabase commit) fall back to the stored
 *   date's calendar day, rounded to the nearest UTC midnight — right for
 *   local-midnight dates in any zone and for UTC-midnight ones.
 * - description: the parser's `description` (never the friendly name), with
 *   padding trimmed and runs of whitespace collapsed — credit card cells are
 *   raw and space-padded. It is never rewritten after import.
 * - amount: `amount` is always positive; the sign comes from `type`. Rounded
 *   to cents, so 1200, 1200.00 and float noise agree with numeric(14,2).
 *
 * Assumption: two genuinely different charges never share all five fields
 * across statements. Credit card installments carry the purchase date, but
 * Santander's description has a changing "Cuota N M" counter. Rows that do
 * share them (a genuine identical pair) are counted as a multiset, so they
 * still import as many times as the file holds them beyond what is stored.
 * Not covered: two cards (or two same-currency accounts) with an identical row
 * on the same day are one fingerprint — see #167.
 */
export function transactionFingerprint(tx: Transaction): string | null {
  if (tx.splitParentId) {
    // Split parts are subdivisions of a bank row, not bank rows; the parent
    // keeps the original fields and stands for the row.
    return null
  }
  return JSON.stringify([
    tx.source,
    fingerprintDate(tx),
    normalizeDescription(tx.description),
    signedCents(tx),
    tx.currency,
  ])
}

/** The fingerprint minus the date: what an id match must also agree on. */
function contentWithoutDate(tx: Transaction): string {
  return JSON.stringify([
    tx.source,
    normalizeDescription(tx.description),
    signedCents(tx),
    tx.currency,
  ])
}

function normalizeDescription(description: string): string {
  return description.trim().replace(/\s+/g, ' ')
}

function signedCents(tx: Transaction): number {
  const cents = Math.round(Math.abs(tx.amount) * 100)
  return tx.type === 'debit' ? -cents : cents
}

const RAW_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

function fingerprintDate(tx: Transaction): string {
  const fecha = tx.rawData?.fecha
  if (typeof fecha === 'string') {
    const match = RAW_DATE.exec(fecha.trim())
    if (match) {
      return `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`
    }
  }
  const date = tx.date instanceof Date ? tx.date : new Date(tx.date)
  const day = new Date(date.getTime() + 12 * 60 * 60 * 1000)
  const dd = String(day.getUTCDate()).padStart(2, '0')
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${day.getUTCFullYear()}`
}

/** A stored row the import is matched against; deleted rows count too. */
export interface ExistingTransaction {
  tx: Transaction
  deleted: boolean
}

export interface ImportClassification {
  /** Rows to insert, with a salted id where theirs was taken. */
  added: Transaction[]
  /** Rows already stored and live. */
  duplicates: Transaction[]
  /** Rows the user deleted before; skipped so they stay deleted. */
  previouslyDeleted: Transaction[]
  /**
   * Live stored rows whose garbled text (#192) the incoming row repairs: the
   * stored row (its id, category, names, tags) with the incoming row's
   * `description` and `rawData`. Not inserted; the caller updates them.
   */
  repaired: Transaction[]
}

/**
 * Rows imported before #192 read a Latin-1 file as UTF-8, so each accented
 * letter was stored as U+FFFD (one per byte). A stored row matches an
 * incoming row when everything but the description agrees and its normalized
 * description equals the incoming one with each U+FFFD standing for exactly
 * one non-ASCII character (the bytes that turned into U+FFFD were all
 * >= 0x80, so it can't stand for an ASCII letter, nor for another U+FFFD).
 *
 * Known misses (the row then imports as new, next to the garbled one): an
 * accented letter directly followed by a 0x80-0xBF byte (NBSP, º, ª, «, »,
 * cp1252 quotes) decodes to one U+FFFD for two characters or to a wrong but
 * valid character, and an NBSP is whitespace on the correct side only.
 */
const REPLACEMENT = '\uFFFD'

function repairKey(tx: Transaction): string {
  return JSON.stringify([
    tx.source,
    fingerprintDate(tx),
    signedCents(tx),
    tx.currency,
  ])
}

function garbledPattern(description: string): RegExp | null {
  const normalized = normalizeDescription(description)
  if (!normalized.includes(REPLACEMENT)) return null
  const source = Array.from(normalized, (char) =>
    char === REPLACEMENT
      ? '[^\\x00-\\x7F\\uFFFD]'
      : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ).join('')
  return new RegExp(`^${source}$`, 'u')
}

/**
 * Splits an import into new rows, duplicates and rows the user deleted.
 *
 * Each stored row absorbs at most one incoming row: a fingerprint stored k
 * times absorbs k copies and the rest import. An incoming row first claims
 * the stored row with its own id (an exact re-import) when everything but the
 * date agrees; the others then claim any unclaimed row with their fingerprint,
 * live rows before deleted ones.
 *
 * A new row whose id is taken — by any stored row, by `takenIds`, or by a row
 * salted earlier in this import — gets `${id}_c${n}`, smallest free n, instead
 * of being dropped or overwriting the other row.
 */
export function classifyImport(
  incoming: Transaction[],
  existing: ExistingTransaction[],
  takenIds: ReadonlySet<string> = new Set()
): ImportClassification {
  const claimed = new Set<ExistingTransaction>()
  const byId = new Map<string, ExistingTransaction>()
  const pools = new Map<string, ExistingTransaction[]>()
  for (const row of existing) {
    byId.set(row.tx.id, row)
    const fingerprint = transactionFingerprint(row.tx)
    if (fingerprint === null) continue
    const pool = pools.get(fingerprint) ?? []
    pool.push(row)
    pools.set(fingerprint, pool)
  }
  // Live rows first, so a re-import reports duplicates before deleted rows.
  for (const pool of pools.values()) {
    pool.sort((a, b) => Number(a.deleted) - Number(b.deleted))
  }

  const match = new Map<Transaction, ExistingTransaction>()
  for (const tx of incoming) {
    const sameId = byId.get(tx.id)
    if (
      sameId &&
      !claimed.has(sameId) &&
      transactionFingerprint(sameId.tx) !== null &&
      contentWithoutDate(sameId.tx) === contentWithoutDate(tx)
    ) {
      claimed.add(sameId)
      match.set(tx, sameId)
    }
  }
  for (const tx of incoming) {
    if (match.has(tx)) continue
    const fingerprint = transactionFingerprint(tx)
    const pool = fingerprint === null ? undefined : pools.get(fingerprint)
    const row = pool?.find((candidate) => !claimed.has(candidate))
    if (row) {
      claimed.add(row)
      match.set(tx, row)
    }
  }

  // Repair pass (#192): rows stored garbled, matched with U+FFFD as a
  // one-character wildcard — only by rows no exact match took.
  const garbled = new Map<
    string,
    Array<{ row: ExistingTransaction; pattern: RegExp }>
  >()
  for (const row of existing) {
    if (claimed.has(row) || transactionFingerprint(row.tx) === null) continue
    const pattern = garbledPattern(row.tx.description)
    if (!pattern) continue
    const key = repairKey(row.tx)
    const pool = garbled.get(key) ?? []
    pool.push({ row, pattern })
    garbled.set(key, pool)
  }
  for (const pool of garbled.values()) {
    pool.sort((a, b) => Number(a.row.deleted) - Number(b.row.deleted))
  }
  const repairs = new Set<Transaction>()
  if (garbled.size > 0) {
    for (const tx of incoming) {
      if (match.has(tx) || transactionFingerprint(tx) === null) continue
      const description = normalizeDescription(tx.description)
      const candidate = garbled
        .get(repairKey(tx))
        ?.find(
          ({ row, pattern }) => !claimed.has(row) && pattern.test(description)
        )
      if (candidate) {
        claimed.add(candidate.row)
        match.set(tx, candidate.row)
        repairs.add(tx)
      }
    }
  }

  const taken = new Set([...byId.keys(), ...takenIds])
  const result: ImportClassification = {
    added: [],
    duplicates: [],
    previouslyDeleted: [],
    repaired: [],
  }
  for (const tx of incoming) {
    const row = match.get(tx)
    if (row) {
      if (row.deleted) result.previouslyDeleted.push(tx)
      else if (repairs.has(tx)) {
        result.repaired.push({
          ...row.tx,
          description: tx.description,
          rawData: tx.rawData,
        })
      } else result.duplicates.push(tx)
      continue
    }
    let id = tx.id
    for (let n = 1; taken.has(id); n++) {
      id = `${tx.id}_c${n}`
    }
    taken.add(id)
    result.added.push(id === tx.id ? tx : { ...tx, id })
  }
  return result
}
