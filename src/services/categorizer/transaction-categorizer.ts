import { Category, TransactionType } from '../../models'
import { getMerchantCategory, normalizeMerchantName } from './merchant-patterns'
import { getMerchantCategoryOverride } from './category-overrides'

const FEE_KEYWORDS = [
  'comision',
  'cargo',
  'fee',
  'interes',
  'mantenimiento',
  'costo producto',
]

const TRANSFER_KEYWORDS = [
  'transferencia',
  'trf',
  'transf',
  'pago supernet',
  'pago electronico tarjeta credito',
  'pago tarjeta credito',
]

const INCOME_KEYWORDS = [
  'sueldo',
  'salario',
  'nomina',
  'haberes',
  'pago sueldos',
  'deposito',
]

function matchesAny(normalized: string, keywords: string[]): boolean {
  return keywords.some((keyword) => normalized.includes(keyword))
}

/**
 * Categorize a transaction using rule-based detection and merchant patterns.
 */
export function categorizeTransaction(
  description: string,
  type: TransactionType
): {
  category: string
  confidence: number
} {
  const normalized = normalizeMerchantName(description)

  if (!normalized) {
    return {
      category: Category.Uncategorized,
      confidence: 0,
    }
  }

  const override = getMerchantCategoryOverride(normalized)
  if (override) {
    return {
      category: override,
      confidence: 1,
    }
  }

  if (matchesAny(normalized, FEE_KEYWORDS)) {
    return {
      category: Category.Fees,
      confidence: 0.95,
    }
  }

  if (matchesAny(normalized, TRANSFER_KEYWORDS)) {
    return {
      category: Category.Transfer,
      confidence: 0.9,
    }
  }

  if (type === 'credit' && matchesAny(normalized, INCOME_KEYWORDS)) {
    return {
      category: Category.Income,
      confidence: 0.9,
    }
  }

  return getMerchantCategory(description)
}
