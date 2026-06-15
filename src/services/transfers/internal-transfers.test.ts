import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { Category } from '../../models'
import { inferInternalTransfers, isTransferCategory } from './internal-transfers'

function makeTransaction(
  id: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2025-01-10T00:00:00.000Z'),
    description: `transaction ${id}`,
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

describe('internal transfer inference', () => {
  it('marks transfer-like bank descriptions as transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('tx-1', {
        description: 'Pago tarjeta credito santander',
        type: 'debit',
      }),
    ])

    expect(result[0].category).toBe(Category.Transfer)
    expect((result[0].categoryConfidence ?? 0) > 0).toBe(true)
  })

  it('matches debit/credit pair with same amount as internal transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('debit-1', {
        description: 'Transferencia enviada supernet ref 123456',
        type: 'debit',
        amount: 1500,
        currency: 'UYU',
        rawData: { referencia: '123456' },
      }),
      makeTransaction('credit-1', {
        description: 'Transferencia recibida supernet ref 123456',
        type: 'credit',
        amount: 1500,
        currency: 'UYU',
        rawData: { referencia: '123456' },
      }),
    ])

    expect(result.every((tx) => tx.category === Category.Transfer)).toBe(true)
  })

  it('does not override explicit non-transfer category with confidence 1', () => {
    const result = inferInternalTransfers([
      makeTransaction('tx-1', {
        description: 'Transferencia enviada a cuenta propia',
        category: Category.Utilities,
        categoryConfidence: 1,
      }),
    ])

    expect(result[0].category).toBe(Category.Utilities)
  })

  it('checks transfer category helper', () => {
    expect(isTransferCategory('transfer')).toBe(true)
    expect(isTransferCategory('groceries')).toBe(false)
    expect(isTransferCategory(undefined)).toBe(false)
  })

  it('does not mark TRANSFERENCIA ENVIADA TRF. PLAZA- NAME as Transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('debit-ext', {
        description:
          'TRANSFERENCIA ENVIADA 797258TT55557944 TRF. PLAZA- FEDERICO GAZZANO',
        type: 'debit',
        amount: 476.81,
        currency: 'UYU',
        // No initial category — simulating fresh import
      }),
    ])

    const debit = result.find((tx) => tx.id === 'debit-ext')!
    expect(debit.category).not.toBe(Category.Transfer)
  })

  it('does not mark TRANSF INSTANTANEA ENVIADA NRR: NAME as Transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('debit-ext', {
        description:
          'TRANSF INSTANTANEA ENVIADA 381239LE NRR:182500517 JOSE PREX',
        type: 'debit',
        amount: 250,
        currency: 'UYU',
        // No initial category — simulating fresh import
      }),
    ])

    const debit = result.find((tx) => tx.id === 'debit-ext')!
    expect(debit.category).not.toBe(Category.Transfer)
  })

  it('still marks legitimate internal transfers as Transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('debit-int', {
        description: 'Transferencia enviada supernet ref 999999',
        type: 'debit',
        amount: 1500,
        currency: 'UYU',
        rawData: { referencia: '999999' },
      }),
      makeTransaction('credit-int', {
        description: 'Transferencia recibida supernet ref 999999',
        type: 'credit',
        amount: 1500,
        currency: 'UYU',
        rawData: { referencia: '999999' },
      }),
    ])

    expect(result.every((tx) => tx.category === Category.Transfer)).toBe(true)
  })
})
