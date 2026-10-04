import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedData, Transaction } from '../../models'

const { categorizeTransactionMock } = vi.hoisted(() => ({
  categorizeTransactionMock: vi.fn(),
}))

vi.mock('./transaction-categorizer', () => ({
  categorizeTransaction: categorizeTransactionMock,
}))

import {
  categorizeImportedTransactions,
  categorizeParsedData,
} from './import-categorization'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn_1',
    date: new Date(2026, 0, 15),
    description: 'Devoto Supermercado',
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'credit_card',
    rawData: {},
    ...overrides,
  }
}

describe('categorizeImportedTransactions', () => {
  beforeEach(() => {
    categorizeTransactionMock.mockReset()
  })

  it('calls the categorizer with only the description and type — no context', () => {
    categorizeTransactionMock.mockReturnValue({
      category: 'groceries',
      confidence: 0.9,
    })

    categorizeImportedTransactions([
      makeTx({ description: 'Devoto Supermercado', type: 'debit' }),
      makeTx({ id: 'txn_2', description: 'Sueldo', type: 'credit' }),
    ])

    expect(categorizeTransactionMock.mock.calls).toEqual([
      ['Devoto Supermercado', 'debit'],
      ['Sueldo', 'credit'],
    ])
  })

  it('fills category, confidence and display description from the categorizer', () => {
    categorizeTransactionMock.mockReturnValue({
      category: 'restaurants',
      confidence: 0.8,
      description: 'Café del barrio',
    })

    const [tx] = categorizeImportedTransactions([makeTx()])

    expect(tx).toMatchObject({
      id: 'txn_1',
      description: 'Devoto Supermercado',
      amount: 100,
      category: 'restaurants',
      categoryConfidence: 0.8,
      displayDescription: 'Café del barrio',
    })
  })

  it('leaves the display description unset when the categorizer gives none', () => {
    categorizeTransactionMock.mockReturnValue({
      category: 'uncategorized',
      confidence: 0,
    })

    const [tx] = categorizeImportedTransactions([makeTx()])

    expect(tx.displayDescription).toBeUndefined()
    expect(tx.category).toBe('uncategorized')
    expect(tx.categoryConfidence).toBe(0)
  })

  it('categorizeParsedData keeps the parser metadata and categorizes its rows', () => {
    categorizeTransactionMock.mockReturnValue({
      category: 'groceries',
      confidence: 0.9,
    })
    const parsed = {
      fileType: 'credit_card',
      transactions: [makeTx()],
      metadata: {},
      fileName: 'cc.csv',
      parsedAt: new Date(2026, 0, 31),
    } as unknown as ParsedData

    const result = categorizeParsedData(parsed)

    expect(result.fileType).toBe('credit_card')
    expect(result.fileName).toBe('cc.csv')
    expect(result.metadata).toBe(parsed.metadata)
    expect(result.transactions[0].category).toBe('groceries')
  })
})
