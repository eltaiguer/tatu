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

    expect(result[0].category).toBe(Category.InternalTransfer)
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

    expect(result.every((tx) => tx.category === Category.InternalTransfer)).toBe(true)
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
    expect(isTransferCategory('internal_transfer')).toBe(true)
    expect(isTransferCategory('external_transfer')).toBe(true)
    expect(isTransferCategory('groceries')).toBe(false)
    expect(isTransferCategory(undefined)).toBe(false)
  })

  it('marks TRANSFERENCIA ENVIADA TRF. PLAZA- NAME as external transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('debit-ext', {
        description:
          'TRANSFERENCIA ENVIADA 797258TT55557944 TRF. PLAZA- FEDERICO GAZZANO',
        type: 'debit',
        amount: 476.81,
        currency: 'UYU',
      }),
    ])

    const debit = result.find((tx) => tx.id === 'debit-ext')!
    expect(debit.category).toBe(Category.ExternalTransfer)
  })

  it('marks TRANSF INSTANTANEA ENVIADA NRR: NAME as external transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('debit-ext', {
        description:
          'TRANSF INSTANTANEA ENVIADA 381239LE NRR:182500517 JOSE PREX',
        type: 'debit',
        amount: 250,
        currency: 'UYU',
      }),
    ])

    const debit = result.find((tx) => tx.id === 'debit-ext')!
    expect(debit.category).toBe(Category.ExternalTransfer)
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

    expect(result.every((tx) => tx.category === Category.InternalTransfer)).toBe(true)
  })

  it('does not mark an unpaired credit supernet as Transfer (external incoming payment)', () => {
    // "CREDITO POR OPERACION EN SUPERNET TAIRTAGS/NAME" has no matching debit —
    // it is an external payment received, not a self-transfer, so it should
    // remain uncategorized and count as income in charts.
    const result = inferInternalTransfers([
      makeTransaction('credit-ext', {
        description:
          'CREDITO POR OPERACION EN SUPERNET TAIRTAGS/HARGUINDEGUY MARIA CONSTANZA',
        type: 'credit',
        amount: 145,
        currency: 'USD',
      }),
    ])

    const credit = result.find((tx) => tx.id === 'credit-ext')!
    expect(credit.category).not.toBe(Category.InternalTransfer)
  })

  it('pairs CREDITO POR OPERACION EN SUPERNET P--/NAME with matching debit (self-transfer)', () => {
    // Same amount, same day — the debit/credit pair is an own-account transfer.
    const result = inferInternalTransfers([
      makeTransaction('debit-self', {
        description: 'DEBITO OPERACION EN SUPERNET O SMS NRO FAMILIA 5506',
        type: 'debit',
        amount: 6820,
        currency: 'UYU',
        rawData: { referencia: '000000' },
      }),
      makeTransaction('credit-self', {
        description:
          'CREDITO POR OPERACION EN SUPERNET P--/GAZZANO ARISMENDI JOSE',
        type: 'credit',
        amount: 6820,
        currency: 'UYU',
        rawData: { referencia: '000000' },
      }),
    ])

    expect(result.every((tx) => tx.category === Category.InternalTransfer)).toBe(true)
  })

  it('pairs a credit card payment credit (AI-tagged) with a bank account debit', () => {
    // Credit card shows "PAGO RECIBIDO" — AI tagged it as transfer (confidence 0.85).
    // Bank account shows "PAGO ELECTRONICO TARJETA CREDITO" — rule-based transfer.
    // The fix to candidates filter allows the credit card tx to be a pairing candidate.
    const result = inferInternalTransfers([
      makeTransaction('cc-payment', {
        description: 'PAGO RECIBIDO',
        type: 'credit',
        source: 'credit_card',
        amount: 1500,
        currency: 'UYU',
        category: Category.InternalTransfer,
        categoryConfidence: 0.85,
        date: new Date('2025-03-15T00:00:00.000Z'),
      }),
      makeTransaction('bank-debit', {
        description: 'PAGO ELECTRONICO TARJETA CREDITO',
        type: 'debit',
        source: 'bank_account',
        amount: 1500,
        currency: 'UYU',
        date: new Date('2025-03-15T00:00:00.000Z'),
      }),
    ])

    expect(result.every((tx) => tx.category === Category.InternalTransfer)).toBe(true)
  })

  it('does not pair unrelated debit and credit across currencies just because both are transfer descriptions', () => {
    // PAGO ELECTRONICO TARJETA CREDITO (USD) and TRANSFERENCIA RECIBIDA (UYU)
    // happen near the same date but are unrelated; score should not reach threshold.
    const result = inferInternalTransfers([
      makeTransaction('debit-cc', {
        description: 'PAGO ELECTRONICO TARJETA CREDITO',
        type: 'debit',
        amount: 2238.54,
        currency: 'USD',
        date: new Date('2025-11-06T00:00:00.000Z'),
        category: Category.InternalTransfer,
        categoryConfidence: 0.9,
      }),
      makeTransaction('credit-received', {
        description:
          'TRANSFERENCIA RECIBIDA 569729TT RECIBIDA /GAZZANO DE MARCO, FEDERICO J',
        type: 'credit',
        amount: 2350,
        currency: 'UYU',
        date: new Date('2025-11-04T00:00:00.000Z'),
      }),
    ])

    const credit = result.find((tx) => tx.id === 'credit-received')!
    expect(credit.category).not.toBe(Category.InternalTransfer)
  })
})

describe('split transaction guards in transfer inference', () => {
  it('does not auto-tag a split parent as a transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('parent', {
        description: 'Transferencia supernet',
        type: 'debit',
        source: 'bank_account',
        isSplitParent: true,
      }),
    ])
    const parent = result.find((tx) => tx.id === 'parent')!
    expect(parent.category).not.toBe(Category.InternalTransfer)
  })

  it('does not auto-tag a split child as a transfer', () => {
    const result = inferInternalTransfers([
      makeTransaction('child', {
        description: 'Transferencia supernet',
        type: 'debit',
        source: 'bank_account',
        splitParentId: 'some-parent',
      }),
    ])
    const child = result.find((tx) => tx.id === 'child')!
    expect(child.category).not.toBe(Category.InternalTransfer)
  })
})
