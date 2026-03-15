import type { Transaction } from '../../models'
import { Category } from '../../models'

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

  return true
}

function markTransfer(transaction: Transaction, confidence: number): Transaction {
  return {
    ...transaction,
    category: Category.Transfer,
    categoryConfidence: Math.max(transaction.categoryConfidence ?? 0, confidence),
  }
}

function dayDistance(left: Date, right: Date): number {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.abs(left.getTime() - right.getTime()) / dayMs
}

export function isTransferCategory(category: string | undefined): boolean {
  return normalizeText(category) === Category.Transfer
}

/**
 * Heuristically tags internal bank movements as transfers.
 * The pass is idempotent and only updates auto-categorizable rows.
 */
export function inferInternalTransfers(transactions: Transaction[]): Transaction[] {
  const next = transactions.map((transaction) => ({ ...transaction }))
  const byId = new Map(next.map((transaction) => [transaction.id, transaction]))
  const pairedIds = new Set<string>()

  next.forEach((transaction) => {
    if (
      canAutoAssignTransfer(transaction) &&
      isTransferDescription(transaction.description)
    ) {
      byId.set(transaction.id, markTransfer(transaction, 0.9))
    }
  })

  const candidates = next.filter(
    (transaction) =>
      isBankTransaction(transaction) &&
      (isTransferCategory(transaction.category) ||
        isTransferDescription(transaction.description))
  )

  for (const left of candidates) {
    if (left.type !== 'debit' || pairedIds.has(left.id)) {
      continue
    }

    let bestMatch: Transaction | null = null
    let bestScore = -1

    for (const right of candidates) {
      if (left.id === right.id || pairedIds.has(right.id) || right.type !== 'credit') {
        continue
      }

      const distance = dayDistance(left.date, right.date)
      if (distance > 2) {
        continue
      }

      const sameCurrency = left.currency === right.currency
      const sameAmount = Math.abs(left.amount - right.amount) <= 0.01
      const leftIsTransfer = isTransferDescription(left.description)
      const rightIsTransfer = isTransferDescription(right.description)
      const sameReference =
        extractReferenceToken(left) !== null &&
        extractReferenceToken(left) === extractReferenceToken(right)

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
      (left.currency !== bestMatch.currency && bestScore >= 5)

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

  return transactions.map((transaction) => byId.get(transaction.id) ?? transaction)
}
