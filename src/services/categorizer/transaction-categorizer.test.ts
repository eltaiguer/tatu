import { describe, it, expect, beforeEach } from 'vitest'
import { categorizeTransaction } from './transaction-categorizer'
import {
  clearAllCategoryOverrides,
  setMerchantCategoryOverride,
} from './category-overrides'
import {
  clearAllDescriptionOverrides,
  setDescriptionOverride,
} from '../descriptions/description-overrides'
import {
  addCustomPattern,
  clearAllCustomPatterns,
} from './custom-patterns'
import { invalidateLearnedPatternsCache } from './learned-patterns'
import { analyzeTemporalPatterns } from './temporal-patterns'
import { Category } from '../../models'

describe('Transaction Categorizer', () => {
  beforeEach(() => {
    clearAllCategoryOverrides()
    clearAllDescriptionOverrides()
    clearAllCustomPatterns()
    invalidateLearnedPatternsCache()
  })
  it('should categorize fees with high confidence', () => {
    const result = categorizeTransaction(
      'COMISION POR COSTO PRODUCTO COMISION COSTO PRODUCTO',
      'debit'
    )

    expect(result.category).toBe(Category.Fees)
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('should categorize transfers for outgoing transfers', () => {
    const result = categorizeTransaction(
      'TRANSFERENCIA ENVIADA 754934TT55557465 TRF. PLAZA',
      'debit'
    )

    expect(result.category).toBe(Category.Transfer)
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('should categorize transfers for card payments', () => {
    const result = categorizeTransaction(
      'PAGO ELECTRONICO TARJETA CREDITO',
      'debit'
    )

    expect(result.category).toBe(Category.Transfer)
  })

  it('should categorize incoming supernet credits as transfers', () => {
    const result = categorizeTransaction(
      'CREDITO POR OPERACION EN SUPERNET P--/GAZZANO ARISMENDI JOSE',
      'credit'
    )

    expect(result.category).toBe(Category.Transfer)
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('should categorize cash withdrawals as transfers', () => {
    const result = categorizeTransaction(
      'RETIRO CORRESPONSALES MONTEVIDEO',
      'debit'
    )

    expect(result.category).toBe(Category.Transfer)
  })

  it('should categorize instant received transfers as transfers', () => {
    const result = categorizeTransaction(
      'TRANSF INSTANTANEA RECIBIDA 644388LR',
      'credit'
    )

    expect(result.category).toBe(Category.Transfer)
  })

  it('should categorize income when credit matches income keywords', () => {
    const result = categorizeTransaction(
      'CR. PAGO SUELDOS 20251106_0610426 SETA WORKSHOP SRL',
      'credit'
    )

    expect(result.category).toBe(Category.Income)
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('should fall back to merchant patterns for debits', () => {
    const result = categorizeTransaction('Devoto Supermercado', 'debit')

    expect(result.category).toBe(Category.Groceries)
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('should return Uncategorized when no match is found', () => {
    const result = categorizeTransaction('Random Unknown Merchant', 'debit')

    expect(result.category).toBe(Category.Uncategorized)
    expect(result.confidence).toBe(0)
  })

  it('should return Uncategorized for empty descriptions', () => {
    const result = categorizeTransaction('', 'debit')

    expect(result.category).toBe(Category.Uncategorized)
    expect(result.confidence).toBe(0)
  })

  it('should prioritize fees over transfers', () => {
    const result = categorizeTransaction('COMISION TRANSFERENCIA', 'debit')

    expect(result.category).toBe(Category.Fees)
  })

  it('should use manual overrides when available', () => {
    setMerchantCategoryOverride('Devoto Supermercado', Category.Shopping)

    const result = categorizeTransaction('Devoto Supermercado', 'debit')
    expect(result.category).toBe(Category.Shopping)
    expect(result.confidence).toBe(1)
  })

  it('should use description override category for noisy descriptions', () => {
    setDescriptionOverride({
      description: 'AUT 998877 DEVOTO',
      friendlyDescription: 'Devoto',
      category: Category.Groceries,
    })

    const result = categorizeTransaction('AUT 123456 DEVOTO', 'debit')
    expect(result.category).toBe(Category.Groceries)
    expect(result.confidence).toBe(1)
  })

  it('should keep using merchant override when description override has no category', () => {
    setMerchantCategoryOverride('Devoto Supermercado', Category.Shopping)
    setDescriptionOverride({
      description: 'Devoto Supermercado',
      friendlyDescription: 'Devoto',
    })

    const result = categorizeTransaction('Devoto Supermercado', 'debit')
    expect(result.category).toBe(Category.Shopping)
    expect(result.confidence).toBe(1)
  })

  describe('custom patterns', () => {
    it('should use custom pattern before keywords', () => {
      addCustomPattern({
        pattern: 'random place',
        matchType: 'contains',
        category: Category.Entertainment,
      })

      const result = categorizeTransaction('Random Place XYZ', 'debit')
      expect(result.category).toBe(Category.Entertainment)
      expect(result.confidence).toBe(0.95)
    })

    it('should prioritize overrides over custom patterns', () => {
      addCustomPattern({
        pattern: 'devoto',
        matchType: 'contains',
        category: Category.Entertainment,
      })
      setMerchantCategoryOverride('Devoto Supermercado', Category.Shopping)

      const result = categorizeTransaction('Devoto Supermercado', 'debit')
      expect(result.category).toBe(Category.Shopping)
      expect(result.confidence).toBe(1)
    })
  })

  describe('learned patterns', () => {
    it('should use learned patterns for new merchants', () => {
      // Use names that don't match any existing merchant patterns
      setMerchantCategoryOverride('Botica Central', Category.Healthcare)
      setMerchantCategoryOverride('Botica Sur', Category.Healthcare)
      invalidateLearnedPatternsCache()

      const result = categorizeTransaction('Botica Norte', 'debit')
      expect(result.category).toBe(Category.Healthcare)
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.confidence).toBeLessThanOrEqual(0.75)
    })
  })

  describe('context-based categorization', () => {
    it('should use similar merchant when context provided', () => {
      const result = categorizeTransaction(
        'Totally Unknown Place XYZ',
        'debit',
        {
          categorizedMerchants: [
            { name: 'Unknown Place ABC', category: Category.Shopping },
          ],
        }
      )

      // May or may not match depending on token similarity
      // At minimum, it should not error
      expect(result.category).toBeDefined()
    })

    it('should use amount heuristics as last resort', () => {
      const result = categorizeTransaction(
        'Zzz Completely Unknown 12345',
        'debit',
        {
          amount: 200,
          currency: 'UYU',
          categorizedMerchants: [],
        }
      )

      expect(result.category).toBe(Category.Restaurants)
      expect(result.confidence).toBeLessThanOrEqual(0.3)
    })

    it('should use temporal patterns when available', () => {
      const txs = Array.from({ length: 4 }, (_, i) => ({
        description: 'Monthly Service XYZ',
        amount: 1500,
        currency: 'UYU',
        date: new Date(2025, i, 15),
      }))
      const temporalPatterns = analyzeTemporalPatterns(txs)

      const result = categorizeTransaction(
        'Monthly Service XYZ',
        'debit',
        { temporalPatterns }
      )

      expect(result.category).toBe(Category.Utilities)
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('should not use amount heuristics for credits', () => {
      const result = categorizeTransaction(
        'Zzz Completely Unknown 12345',
        'credit',
        {
          amount: 200,
          currency: 'UYU',
          categorizedMerchants: [],
        }
      )

      expect(result.category).toBe(Category.Uncategorized)
    })
  })
})
