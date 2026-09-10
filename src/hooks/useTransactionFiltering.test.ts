import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Transaction } from '../models'
import { useTransactionFiltering } from './useTransactionFiltering'

function makeTransaction(
  id: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2026-03-15T00:00:00.000Z'),
    description: `TX ${id}`,
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    rawData: {},
    ...overrides,
  }
}

function setup(transactions: Transaction[]) {
  return renderHook(() => useTransactionFiltering({ transactions }))
}

describe('useTransactionFiltering — search', () => {
  const transactions = [
    makeTransaction('a', { description: 'FARMACIA SAN ROQUE' }),
    makeTransaction('b', { description: 'SUPERMERCADO DISCO' }),
    makeTransaction('c', {
      description: 'PAGO VARIOS',
      displayDescription: 'Farmashop',
    }),
    makeTransaction('d', { description: 'OTRA COSA', tags: ['farmacia-mes'] }),
  ]

  it('returns everything when the search box is empty', () => {
    const { result } = setup(transactions)
    expect(result.current.filteredTransactions).toHaveLength(4)
  })

  it('matches the raw description, case-insensitively', () => {
    const { result } = setup(transactions)
    act(() => result.current.setSearchTerm('farmacia san'))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual(['a'])
  })

  it('matches the friendly display description', () => {
    const { result } = setup(transactions)
    act(() => result.current.setSearchTerm('farmashop'))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual(['c'])
  })

  it('matches tags', () => {
    const { result } = setup(transactions)
    act(() => result.current.setSearchTerm('farmacia-mes'))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual(['d'])
  })

  it('returns nothing when nothing matches', () => {
    const { result } = setup(transactions)
    act(() => result.current.setSearchTerm('zzzz'))
    expect(result.current.filteredTransactions).toHaveLength(0)
  })
})

describe('useTransactionFiltering — filters', () => {
  const transactions = [
    makeTransaction('usd-debit', { currency: 'USD', type: 'debit' }),
    makeTransaction('uyu-debit', { currency: 'UYU', type: 'debit' }),
    makeTransaction('usd-credit', { currency: 'USD', type: 'credit' }),
    makeTransaction('card', { source: 'credit_card' }),
    makeTransaction('restaurant', { category: 'restaurants' }),
  ]

  it('filters by currency', () => {
    const { result } = setup(transactions)
    act(() => result.current.setCurrencyFilter('UYU'))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual([
      'uyu-debit',
    ])
  })

  it('filters by type', () => {
    const { result } = setup(transactions)
    act(() => result.current.setTypeFilter('credit'))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual([
      'usd-credit',
    ])
  })

  it('filters by account source', () => {
    const { result } = setup(transactions)
    act(() => result.current.setAccountFilters(['credit_card']))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual([
      'card',
    ])
  })

  it('filters by category', () => {
    const { result } = setup(transactions)
    act(() => result.current.setCategoryFilters(['restaurants']))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual([
      'restaurant',
    ])
  })

  it('clears every filter at once', () => {
    const { result } = setup(transactions)
    act(() => {
      result.current.setCurrencyFilter('UYU')
      result.current.setSearchTerm('nope')
    })
    expect(result.current.hasActiveFilters).toBe(true)

    act(() => result.current.clearAllFilters())
    expect(result.current.hasActiveFilters).toBe(false)
    expect(result.current.filteredTransactions).toHaveLength(
      transactions.length
    )
  })
})

describe('useTransactionFiltering — amount and date ranges', () => {
  const transactions = [
    makeTransaction('cheap', { amount: 10 }),
    makeTransaction('mid', { amount: 100 }),
    makeTransaction('pricey', { amount: 1000 }),
    makeTransaction('old', { date: new Date('2026-01-05T00:00:00.000Z') }),
  ]

  it('applies an inclusive minimum amount', () => {
    const { result } = setup(transactions)
    act(() => result.current.setMinAmount('100'))
    expect(result.current.filteredTransactions.map((t) => t.id).sort()).toEqual(
      ['mid', 'old', 'pricey']
    )
  })

  it('applies an inclusive maximum amount', () => {
    const { result } = setup(transactions)
    act(() => result.current.setMaxAmount('100'))
    expect(result.current.filteredTransactions.map((t) => t.id).sort()).toEqual(
      ['cheap', 'mid', 'old']
    )
  })

  it('filters by a date range', () => {
    const { result } = setup(transactions)
    act(() => {
      result.current.setDateFromFilter('2026-03-01')
      result.current.setDateToFilter('2026-03-31')
    })
    expect(result.current.filteredTransactions.map((t) => t.id)).not.toContain(
      'old'
    )
  })

  it('ignores an inverted date range rather than returning nothing', () => {
    const { result } = setup(transactions)
    act(() => {
      result.current.setDateFromFilter('2026-12-31')
      result.current.setDateToFilter('2026-01-01')
    })
    expect(result.current.filteredTransactions).toHaveLength(
      transactions.length
    )
  })
})

describe('useTransactionFiltering — sorting', () => {
  const transactions = [
    makeTransaction('b', {
      amount: 200,
      date: new Date('2026-03-02T00:00:00.000Z'),
    }),
    makeTransaction('a', {
      amount: 100,
      date: new Date('2026-03-01T00:00:00.000Z'),
    }),
    makeTransaction('c', {
      amount: 300,
      date: new Date('2026-03-03T00:00:00.000Z'),
    }),
  ]

  it('sorts by date descending by default', () => {
    const { result } = setup(transactions)
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual([
      'c',
      'b',
      'a',
    ])
  })

  it('toggles direction when the same field is sorted twice', () => {
    const { result } = setup(transactions)
    act(() => result.current.handleSort('amount'))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual([
      'c',
      'b',
      'a',
    ])

    act(() => result.current.handleSort('amount'))
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})

describe('useTransactionFiltering — pagination', () => {
  const transactions = Array.from({ length: 30 }, (_, i) =>
    makeTransaction(`tx-${String(i).padStart(2, '0')}`, {
      date: new Date(Date.UTC(2026, 2, i + 1)),
    })
  )

  it('paginates into pages of 12', () => {
    const { result } = setup(transactions)
    expect(result.current.paginatedTransactions).toHaveLength(12)
    expect(result.current.totalPages).toBe(3)
  })

  it('returns the remainder on the last page', () => {
    const { result } = setup(transactions)
    act(() => result.current.setCurrentPage(3))
    expect(result.current.paginatedTransactions).toHaveLength(6)
  })

  it('exposes ids for the current page and for the whole filtered set', () => {
    const { result } = setup(transactions)
    expect(result.current.paginatedTransactionIds).toHaveLength(12)
    expect(result.current.filteredTransactionIds).toHaveLength(30)
  })

  it('clamps the current page when filtering shrinks the result set', () => {
    const { result } = setup(transactions)
    act(() => result.current.setCurrentPage(3))
    expect(result.current.currentPage).toBe(3)

    act(() => result.current.setSearchTerm('tx-00'))
    expect(result.current.currentPage).toBe(1)
    expect(result.current.paginatedTransactions).toHaveLength(1)
  })
})

describe('useTransactionFiltering — derived array identity', () => {
  // These arrays are handed to memoized children. Recreating them on every
  // render defeats that memoization entirely, so identity is behavior here.
  const transactions = Array.from({ length: 20 }, (_, i) =>
    makeTransaction(`tx-${i}`)
  )

  it('keeps paginated results stable across a re-render with no input change', () => {
    const { result, rerender } = setup(transactions)

    const before = result.current.paginatedTransactions
    const beforeIds = result.current.paginatedTransactionIds
    const beforeFilteredIds = result.current.filteredTransactionIds

    rerender()

    expect(result.current.paginatedTransactions).toBe(before)
    expect(result.current.paginatedTransactionIds).toBe(beforeIds)
    expect(result.current.filteredTransactionIds).toBe(beforeFilteredIds)
  })

  it('produces new results when the filter actually changes', () => {
    const { result } = setup(transactions)
    const before = result.current.paginatedTransactions

    act(() => result.current.setSearchTerm('tx-1'))

    expect(result.current.paginatedTransactions).not.toBe(before)
  })
})

describe('useTransactionFiltering — initialFilter', () => {
  const transactions = [
    makeTransaction('a', { category: 'groceries', currency: 'USD' }),
    makeTransaction('b', { category: 'restaurants', currency: 'UYU' }),
  ]

  it('applies an initial category and currency', () => {
    const { result } = renderHook(() =>
      useTransactionFiltering({
        transactions,
        initialFilter: { category: 'restaurants', currency: 'UYU' },
      })
    )
    expect(result.current.filteredTransactions.map((t) => t.id)).toEqual(['b'])
  })

  it('does not reset a user filter change when the parent re-renders', () => {
    // A parent passing an inline object literal gives a new identity on every
    // render; keying the effect on identity would silently undo the user's
    // own filter edits mid-session.
    const { result, rerender } = renderHook(
      ({ category }: { category: string }) =>
        useTransactionFiltering({
          transactions,
          initialFilter: { category, currency: 'UYU' },
        }),
      { initialProps: { category: 'restaurants' } }
    )

    act(() => result.current.setCategoryFilters(['groceries']))
    expect(result.current.categoryFilters).toEqual(['groceries'])

    rerender({ category: 'restaurants' })

    expect(result.current.categoryFilters).toEqual(['groceries'])
  })
})

describe('useTransactionFiltering — split grouping through the hook', () => {
  // The existing grouping test asserts against a copy of this logic rather
  // than the hook, so it cannot catch a regression in the hook itself.
  const transactions = [
    makeTransaction('parent', { isSplitParent: true }),
    makeTransaction('other'),
    makeTransaction('child-1', { splitParentId: 'parent' }),
    makeTransaction('child-2', { splitParentId: 'parent' }),
  ]

  it('emits split children directly after their parent', () => {
    const { result } = setup(transactions)
    const ids = result.current.paginatedTransactions.map((t) => t.id)

    expect(ids.indexOf('child-1')).toBe(ids.indexOf('parent') + 1)
    expect(ids.indexOf('child-2')).toBe(ids.indexOf('parent') + 2)
  })

  it('emits every transaction exactly once', () => {
    const { result } = setup(transactions)
    const ids = result.current.paginatedTransactions.map((t) => t.id)

    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
  })
})
