import { describe, it, expect } from 'vitest'
import type { Transaction } from '../../models'
import { buildSearchSuggestions } from './search'

function makeTransaction(id: string, description: string): Transaction {
  return {
    id,
    date: new Date('2025-01-01T00:00:00.000Z'),
    description,
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }
}

describe('buildSearchSuggestions', () => {
  it('returns the most frequent descriptions first', () => {
    const transactions = [
      makeTransaction('tx-1', 'Netflix'),
      makeTransaction('tx-2', 'NETFLIX'),
      makeTransaction('tx-3', 'Devoto'),
      makeTransaction('tx-4', 'Devoto'),
    ]

    const result = buildSearchSuggestions(transactions, 2)

    expect(result).toEqual(['Devoto', 'Netflix'])
  })

  it('skips blank descriptions', () => {
    const transactions = [
      makeTransaction('tx-1', ' '),
      makeTransaction('tx-2', 'Spotify'),
    ]

    const result = buildSearchSuggestions(transactions, 3)

    expect(result).toEqual(['Spotify'])
  })
})
