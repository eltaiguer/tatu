import { describe, it, expect, beforeEach } from 'vitest'
import { categorizeTransaction } from './transaction-categorizer'
import {
  clearAllCategoryOverrides,
  setMerchantCategoryOverride,
} from './category-overrides'
import { Category } from '../../models'

describe('Transaction Categorizer', () => {
  beforeEach(() => {
    clearAllCategoryOverrides()
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
})
