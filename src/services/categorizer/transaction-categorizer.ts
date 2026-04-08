import { Category, type Currency, type TransactionType } from '../../models'
import { getMerchantCategory, normalizeMerchantName } from './merchant-patterns'
import { getMerchantCategoryOverride } from './category-overrides'
import { getDescriptionOverride } from '../descriptions/description-overrides'
import { matchCustomPattern } from './custom-patterns'
import { matchLearnedPattern } from './learned-patterns'
import {
  findSimilarMerchant,
  type CategorizedMerchant,
} from './similar-merchant'
import { categorizeByAmount } from './amount-heuristics'
import {
  getTemporalSuggestion,
  type TemporalPattern,
} from './temporal-patterns'

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
  'transf instantanea enviada',
  'transf instantanea recibida',
  'transferencia recibida',
  'credito por operacion en supernet',
  'debito operacion en supernet',
  'retiro corresponsales',
  'nro familia',
  'pago supernet',
  'pago electronico tarjeta credito',
  'pago tarjeta credito',
  'compra dolares',
  'venta dolares',
  'compra divisas',
  'venta divisas',
  'cambio moneda',
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
 * Optional context for enhanced categorization.
 * When provided, enables smart features like similar-merchant
 * matching, amount heuristics, and temporal pattern detection.
 */
export interface CategorizationContext {
  amount?: number
  currency?: Currency
  categorizedMerchants?: CategorizedMerchant[]
  temporalPatterns?: Map<string, TemporalPattern>
}

/**
 * Categorize a transaction using the full pipeline:
 *
 * 1. Description override (confidence 1.0)
 * 2. Merchant override (confidence 1.0)
 * 3. Custom user patterns (confidence 0.95)
 * 4. Fee keywords (confidence 0.95)
 * 5. Transfer keywords (confidence 0.9)
 * 6. Income keywords (confidence 0.9)
 * 7. Merchant patterns — substring + fuzzy (confidence varies)
 * 8. Learned patterns from overrides (confidence ≤ 0.75)
 * 9. Temporal patterns (confidence ≤ 0.65)
 * 10. Similar merchant (confidence ≤ 0.6)
 * 11. Amount heuristics (confidence ≤ 0.25)
 * 12. Uncategorized (confidence 0)
 */
export function categorizeTransaction(
  description: string,
  type: TransactionType,
  context?: CategorizationContext
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

  // 1. Description override
  const descriptionOverride = getDescriptionOverride(description)
  if (descriptionOverride?.category) {
    return {
      category: descriptionOverride.category,
      confidence: 1,
    }
  }

  // 2. Merchant override
  const override = getMerchantCategoryOverride(normalized)
  if (override) {
    return {
      category: override,
      confidence: 1,
    }
  }

  // 3. Custom user patterns
  const customMatch = matchCustomPattern(description)
  if (customMatch) {
    return {
      category: customMatch.category,
      confidence: customMatch.confidence,
    }
  }

  // 4. Fee keywords
  if (matchesAny(normalized, FEE_KEYWORDS)) {
    return {
      category: Category.Fees,
      confidence: 0.95,
    }
  }

  // 5. Transfer keywords
  if (matchesAny(normalized, TRANSFER_KEYWORDS)) {
    return {
      category: Category.Transfer,
      confidence: 0.9,
    }
  }

  // 6. Income keywords (credits only)
  if (type === 'credit' && matchesAny(normalized, INCOME_KEYWORDS)) {
    return {
      category: Category.Income,
      confidence: 0.9,
    }
  }

  // 7. Merchant patterns (substring + fuzzy fallback)
  const merchantResult = getMerchantCategory(description)
  if (merchantResult.category !== Category.Uncategorized) {
    return merchantResult
  }

  // 8. Learned patterns from user overrides
  const learnedMatch = matchLearnedPattern(description)
  if (learnedMatch) {
    return {
      category: learnedMatch.category,
      confidence: learnedMatch.confidence,
    }
  }

  // 9. Temporal patterns (requires context)
  if (context?.temporalPatterns) {
    const temporalMatch = getTemporalSuggestion(
      description,
      context.temporalPatterns
    )
    if (temporalMatch) {
      return {
        category: temporalMatch.category,
        confidence: temporalMatch.confidence,
      }
    }
  }

  // 10. Similar merchant (requires context)
  if (context?.categorizedMerchants) {
    const similarMatch = findSimilarMerchant(
      description,
      context.categorizedMerchants
    )
    if (similarMatch) {
      return {
        category: similarMatch.category,
        confidence: similarMatch.confidence,
      }
    }
  }

  // 11. Amount heuristics (requires context)
  if (
    context?.amount !== undefined &&
    context?.currency
  ) {
    const amountMatch = categorizeByAmount(
      context.amount,
      context.currency,
      type
    )
    if (amountMatch) {
      return {
        category: amountMatch.category,
        confidence: amountMatch.confidence,
      }
    }
  }

  // 12. Uncategorized
  return {
    category: Category.Uncategorized,
    confidence: 0,
  }
}
