import type { Transaction } from '../../models'
import { Category, isSplitParentTx, isSplitChildTx } from '../../models'

const TRANSFER_DESCRIPTION_KEYWORDS = [
  'transfer',
  'transf',
  'supernet',
  'pago tarjeta credito',
  'pago electronico tarjeta credito',
  'compra dolares',
  'venta dolares',
  'compra divisas',
  'venta divisas',
  'cambio moneda',
]

// Matches "TRF. PLAZA- NAME", "TRF. BROU- NAME", or "NRR:182500517 JOSE PREX"
// These patterns indicate a named external beneficiary, so the transaction cannot
// be an internal (own-account) transfer.
const EXTERNAL_BENEFICIARY_RE = /trf\.\s*\w+\s*-\s*[a-z]|nrr:[a-z0-9]+\s+[a-z]/

function normalizeText(value: string | undefined): string {
  return (value ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function extractReferenceToken(transaction: Transaction): string | null {
  const raw = transaction.rawData as { referencia?: string }
  const reference = normalizeText(raw?.referencia)
  if (reference.length >= 6) {
    return reference
  }

  const match = normalizeText(transaction.description).match(/\d{6,}/)
  return match ? match[0] : null
}

function isBankTransaction(transaction: Transaction): boolean {
  return transaction.source === 'bank_account'
}

function isTransferDescription(description: string): boolean {
  const normalized = normalizeText(description)
  if (!normalized) {
    return false
  }

  return TRANSFER_DESCRIPTION_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  )
}

function hasExternalBeneficiary(description: string): boolean {
  return EXTERNAL_BENEFICIARY_RE.test(normalizeText(description))
}

function canAutoAssignTransfer(transaction: Transaction): boolean {
  if (!isBankTransaction(transaction)) {
    return false
  }

  if (isTransferCategory(transaction.category)) {
    return false
  }

  // Respect explicit user/override assignment when confidence is locked.
  if (transaction.category && transaction.categoryConfidence === 1) {
    return false
  }

  if (isSplitParentTx(transaction) || isSplitChildTx(transaction)) {
    return false
  }

  return true
}

function markTransfer(
  transaction: Transaction,
  confidence: number
): Transaction {
  return {
    ...transaction,
    category: Category.InternalTransfer,
    categoryConfidence: Math.max(
      transaction.categoryConfidence ?? 0,
      confidence
    ),
  }
}

function markExternalTransfer(
  transaction: Transaction,
  confidence: number
): Transaction {
  return {
    ...transaction,
    category: Category.ExternalTransfer,
    categoryConfidence: Math.max(
      transaction.categoryConfidence ?? 0,
      confidence
    ),
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

function dayDistance(left: Date, right: Date): number {
  return Math.abs(left.getTime() - right.getTime()) / DAY_MS
}

export function isTransferCategory(category: string | undefined): boolean {
  const c = normalizeText(category)
  return c === Category.InternalTransfer || c === Category.ExternalTransfer
}

/**
 * Heuristically tags internal bank movements as transfers.
 * The pass is idempotent and only updates auto-categorizable rows.
 */
export function inferInternalTransfers(
  transactions: Transaction[]
): Transaction[] {
  const next = transactions.map((transaction) => ({ ...transaction }))
  const byId = new Map(next.map((transaction) => [transaction.id, transaction]))
  const pairedIds = new Set<string>()

  next.forEach((transaction) => {
    // Only speculatively mark debit transactions in the first pass.
    // Credits are handled by the pairing pass so that unpaired incoming
    // transfers from external parties are not excluded from income.
    if (
      canAutoAssignTransfer(transaction) &&
      transaction.type !== 'credit' &&
      isTransferDescription(transaction.description)
    ) {
      if (hasExternalBeneficiary(transaction.description)) {
        byId.set(transaction.id, markExternalTransfer(transaction, 0.9))
      } else {
        byId.set(transaction.id, markTransfer(transaction, 0.9))
      }
    }
  })

  const candidates = next.filter(
    (transaction) =>
      !hasExternalBeneficiary(transaction.description) &&
      (isTransferCategory(transaction.category) ||
        (isBankTransaction(transaction) &&
          isTransferDescription(transaction.description)))
  )

  // Per-candidate values that the pairing loop would otherwise recompute on
  // every comparison — extractReferenceToken and isTransferDescription each
  // normalise a string and scan a keyword list, and the original code called
  // extractReferenceToken(left) twice per pair. Hoisting them turns the inner
  // loop into numeric comparisons.
  const meta = new Map<
    string,
    { refToken: string | null; isTransfer: boolean; day: number }
  >()
  for (const candidate of candidates) {
    meta.set(candidate.id, {
      refToken: extractReferenceToken(candidate),
      isTransfer: isTransferDescription(candidate.description),
      day: Math.floor(candidate.date.getTime() / DAY_MS),
    })
  }

  // Credits bucketed by day, so a debit only looks at the ±2 day window
  // instead of scanning every candidate. Buckets keep insertion order, and
  // the merged window is re-sorted by original index below, so the loop
  // still evaluates candidates in exactly the order it did before — which
  // matters, because ties are resolved by `score > bestScore` (strict), i.e.
  // first-best-wins.
  const creditIndexByDay = new Map<number, number[]>()
  candidates.forEach((candidate, index) => {
    if (candidate.type !== 'credit') return
    const { day } = meta.get(candidate.id)!
    const bucket = creditIndexByDay.get(day)
    if (bucket) bucket.push(index)
    else creditIndexByDay.set(day, [index])
  })

  for (const left of candidates) {
    if (left.type !== 'debit' || pairedIds.has(left.id)) {
      continue
    }

    let bestMatch: Transaction | null = null
    let bestScore = -1

    const leftMeta = meta.get(left.id)!
    const windowIndexes: number[] = []
    // ±2 is provably sufficient, not merely generous: if |a-b| <= 2*DAY_MS
    // then |floor(a/DAY_MS) - floor(b/DAY_MS)| <= 2. (A difference of 3 would
    // need floor(b/D) >= floor(a/D)+3, which forces b-a > 2*DAY_MS.) So no
    // pair the exact dayDistance check would accept can fall outside this
    // window. Narrowing it would start dropping real pairs.
    for (let offset = -2; offset <= 2; offset++) {
      const bucket = creditIndexByDay.get(leftMeta.day + offset)
      if (bucket) windowIndexes.push(...bucket)
    }
    windowIndexes.sort((a, b) => a - b)

    for (const rightIndex of windowIndexes) {
      const right = candidates[rightIndex]
      if (left.id === right.id || pairedIds.has(right.id)) {
        continue
      }

      // Day bucketing is a coarse filter (whole-day boundaries); the exact
      // distance check below is still authoritative.
      const distance = dayDistance(left.date, right.date)
      if (distance > 2) {
        continue
      }

      const rightMeta = meta.get(right.id)!
      const sameCurrency = left.currency === right.currency
      const sameAmount = Math.abs(left.amount - right.amount) <= 0.01
      const leftIsTransfer = leftMeta.isTransfer
      const rightIsTransfer = rightMeta.isTransfer
      const sameReference =
        leftMeta.refToken !== null && leftMeta.refToken === rightMeta.refToken

      let score = 0
      if (sameCurrency && sameAmount) {
        score += 4
      } else if (!sameCurrency && leftIsTransfer && rightIsTransfer) {
        score += 2
      }

      score += distance <= 1 ? 2 : 1

      if (leftIsTransfer && rightIsTransfer) {
        score += 2
      } else if (leftIsTransfer || rightIsTransfer) {
        score += 1
      }

      if (sameReference) {
        score += 2
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = right
      }
    }

    if (!bestMatch) {
      continue
    }

    const confidence = bestScore >= 8 ? 0.98 : bestScore >= 6 ? 0.95 : 0.92
    const isStrongEnough =
      (left.currency === bestMatch.currency &&
        Math.abs(left.amount - bestMatch.amount) <= 0.01 &&
        bestScore >= 6) ||
      (left.currency !== bestMatch.currency && bestScore >= 6)

    if (!isStrongEnough) {
      continue
    }

    const leftCurrent = byId.get(left.id)
    const rightCurrent = byId.get(bestMatch.id)

    if (leftCurrent && canAutoAssignTransfer(leftCurrent)) {
      byId.set(left.id, markTransfer(leftCurrent, confidence))
    }

    if (rightCurrent && canAutoAssignTransfer(rightCurrent)) {
      byId.set(bestMatch.id, markTransfer(rightCurrent, confidence))
    }

    pairedIds.add(left.id)
    pairedIds.add(bestMatch.id)
  }

  return transactions.map(
    (transaction) => byId.get(transaction.id) ?? transaction
  )
}
