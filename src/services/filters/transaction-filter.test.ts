import { describe, it, expect } from 'vitest'
import type { Transaction } from '../../models'
import { DEFAULT_URL_FILTERS, type UrlFilterState } from './url-filters'
import {
  filterTransactions,
  periodDateRange,
  sortTransactions,
} from './transaction-filter'

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
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

function filters(overrides: Partial<UrlFilterState> = {}): UrlFilterState {
  return { ...DEFAULT_URL_FILTERS, ...overrides }
}

function ids(rows: Transaction[]): string[] {
  return rows.map((row) => row.id)
}

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

describe('filterTransactions — no filters', () => {
  it('returns every countable row, in input order', () => {
    const rows = [tx('b'), tx('a'), tx('c')]
    expect(ids(filterTransactions(rows, filters()))).toEqual(['b', 'a', 'c'])
  })

  it('treats an undefined period and "all" the same: no date bounds', () => {
    const rows = [
      tx('old', { date: day('2019-01-01') }),
      tx('new', { date: day('2026-09-30') }),
    ]
    expect(ids(filterTransactions(rows, filters()))).toEqual(['old', 'new'])
    expect(
      ids(filterTransactions(rows, filters({ period: { mode: 'all' } })))
    ).toEqual(['old', 'new'])
  })
})

describe('filterTransactions — split parents', () => {
  it('never matches a split parent, even when its own fields match', () => {
    const rows = [
      tx('parent', { isSplitParent: true, description: 'SUPER' }),
      tx('part', { splitParentId: 'parent', description: 'SUPER parte' }),
    ]
    expect(ids(filterTransactions(rows, filters({ search: 'super' })))).toEqual(
      ['part']
    )
    expect(
      ids(filterTransactions(rows, filters({ showIgnored: true })))
    ).toEqual(['part'])
  })
})

describe('filterTransactions — category', () => {
  it('normalizes ids the way Resumen counts: missing, empty, other, casing', () => {
    const rows = [
      tx('missing', { category: undefined }),
      tx('empty', { category: '' }),
      tx('other', { category: 'other' }),
      tx('upper', { category: 'GROCERIES' }),
      tx('food', { category: 'restaurants' }),
    ]
    expect(
      ids(filterTransactions(rows, filters({ categories: ['other'] })))
    ).toEqual(['missing', 'empty', 'other'])
    expect(
      ids(filterTransactions(rows, filters({ categories: ['Groceries'] })))
    ).toEqual(['upper'])
  })

  it('matches any of several categories', () => {
    const rows = [
      tx('g', { category: 'groceries' }),
      tx('r', { category: 'restaurants' }),
      tx('u', { category: 'utilities' }),
    ]
    expect(
      ids(
        filterTransactions(
          rows,
          filters({ categories: ['groceries', 'restaurants'] })
        )
      )
    ).toEqual(['g', 'r'])
  })
})

describe('filterTransactions — search and merchant', () => {
  const rows = [
    tx('raw', { description: 'FARMACIA SAN ROQUE' }),
    tx('display', {
      description: 'PAGO VARIOS',
      displayDescription: 'Farmashop',
    }),
    tx('tag', { description: 'OTRA COSA', tags: ['farmacia-mes'] }),
    tx('none', { description: 'SUPERMERCADO DISCO' }),
  ]

  it('searches display name, raw description and tags, case-insensitively', () => {
    expect(ids(filterTransactions(rows, filters({ search: 'FARMA' })))).toEqual(
      ['raw', 'display', 'tag']
    )
  })

  it('matches the merchant by exact display name, not substring', () => {
    const merchants = [
      tx('exact', { displayDescription: 'Disco' }),
      tx('longer', { displayDescription: 'Disco Pocitos' }),
    ]
    expect(
      ids(filterTransactions(merchants, filters({ merchant: 'Disco' })))
    ).toEqual(['exact'])
  })
})

describe('filterTransactions — account, currency, type', () => {
  const rows = [
    tx('card-usd-debit', { source: 'credit_card' }),
    tx('bank-uyu-credit', {
      source: 'bank_account',
      currency: 'UYU',
      type: 'credit',
    }),
  ]

  it('filters by account source', () => {
    expect(
      ids(filterTransactions(rows, filters({ accounts: ['credit_card'] })))
    ).toEqual(['card-usd-debit'])
  })

  it('filters by currency', () => {
    expect(ids(filterTransactions(rows, filters({ currency: 'UYU' })))).toEqual(
      ['bank-uyu-credit']
    )
  })

  it('filters by type', () => {
    expect(ids(filterTransactions(rows, filters({ type: 'debit' })))).toEqual([
      'card-usd-debit',
    ])
  })
})

describe('filterTransactions — amounts', () => {
  const rows = [
    tx('small', { amount: 50 }),
    tx('edge', { amount: 100 }),
    tx('refund', { amount: -150 }),
    tx('big', { amount: 200 }),
  ]

  it('compares absolute amounts against inclusive bounds', () => {
    expect(
      ids(filterTransactions(rows, filters({ min: '100', max: '150' })))
    ).toEqual(['edge', 'refund'])
  })
})

describe('filterTransactions — ignored rows', () => {
  const rows = [
    tx('spend', { category: 'groceries' }),
    tx('transfer', { category: 'transfer' }),
  ]

  it('hides rows that do not count toward totals unless showIgnored', () => {
    expect(ids(filterTransactions(rows, filters()))).toEqual(['spend'])
    expect(
      ids(filterTransactions(rows, filters({ showIgnored: true })))
    ).toEqual(['spend', 'transfer'])
  })
})

describe('filterTransactions — period (UTC calendar days)', () => {
  const rows = [
    tx('feb-last', { date: new Date('2026-02-28T23:59:59.999Z') }),
    tx('mar-first', { date: day('2026-03-01') }),
    // Stored before #58 at Uruguay's local midnight: still 1 March.
    tx('mar-legacy', { date: new Date('2026-03-01T03:00:00.000Z') }),
    tx('mar-last', { date: new Date('2026-03-31T23:59:59.999Z') }),
    tx('apr-first', { date: day('2026-04-01') }),
  ]

  it('bounds a month by its first and last UTC day', () => {
    expect(
      ids(
        filterTransactions(
          rows,
          filters({ period: { mode: 'month', y: 2026, m: 2 } })
        )
      )
    ).toEqual(['mar-first', 'mar-legacy', 'mar-last'])
  })

  it('counts "recent n" back from the anchor month, anchor included', () => {
    const recent = [
      tx('dec', { date: day('2025-12-31') }),
      tx('jan', { date: day('2026-01-01') }),
      tx('mar', { date: day('2026-03-31') }),
    ]
    expect(
      ids(
        filterTransactions(
          recent,
          filters({ period: { mode: 'recent', n: 3 } }),
          {
            recentAnchor: day('2026-03-10'),
          }
        )
      )
    ).toEqual(['jan', 'mar'])
  })

  it('anchors "recent n" on the newest row when no anchor is given', () => {
    const recent = [
      tx('nov', { date: day('2025-11-30') }),
      tx('dec', { date: day('2025-12-01') }),
      tx('jan', { date: day('2026-01-20') }),
    ]
    expect(
      ids(
        filterTransactions(
          recent,
          filters({ period: { mode: 'recent', n: 2 } })
        )
      )
    ).toEqual(['dec', 'jan'])
  })

  it('applies a range with both ends inclusive', () => {
    expect(
      ids(
        filterTransactions(
          rows,
          filters({
            period: { mode: 'range', from: '2026-03-01', to: '2026-03-31' },
          })
        )
      )
    ).toEqual(['mar-first', 'mar-legacy', 'mar-last'])
  })

  it('applies an open-ended range', () => {
    expect(
      ids(
        filterTransactions(
          rows,
          filters({ period: { mode: 'range', from: '2026-03-31', to: '' } })
        )
      )
    ).toEqual(['mar-last', 'apr-first'])
    expect(
      ids(
        filterTransactions(
          rows,
          filters({ period: { mode: 'range', from: '', to: '2026-02-28' } })
        )
      )
    ).toEqual(['feb-last'])
  })

  it('ignores an inverted range rather than returning nothing', () => {
    expect(
      filterTransactions(
        rows,
        filters({
          period: { mode: 'range', from: '2026-12-31', to: '2026-01-01' },
        })
      )
    ).toHaveLength(rows.length)
  })
})

describe('periodDateRange', () => {
  const anchor = day('2026-03-10')

  it('gives a month as its first and last day', () => {
    expect(periodDateRange({ mode: 'month', y: 2024, m: 1 }, anchor)).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    })
  })

  it('gives "recent n" as n whole months ending with the anchor month', () => {
    expect(periodDateRange({ mode: 'recent', n: 3 }, anchor)).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    })
  })

  it('passes a range through and leaves "all" / no period unbounded', () => {
    expect(
      periodDateRange({ mode: 'range', from: '2026-01-05', to: '' }, anchor)
    ).toEqual({ from: '2026-01-05', to: '' })
    expect(periodDateRange({ mode: 'all' }, anchor)).toEqual({
      from: '',
      to: '',
    })
    expect(periodDateRange(undefined, anchor)).toEqual({ from: '', to: '' })
  })
})

describe('sortTransactions', () => {
  const rows = [
    tx('b', {
      date: day('2026-03-02'),
      amount: -300,
      displayDescription: 'Ñandú',
      category: 'utilities',
    }),
    tx('a', {
      date: day('2026-03-01'),
      amount: 200,
      displayDescription: 'Nube',
      category: 'groceries',
    }),
    tx('c', {
      date: day('2026-03-03'),
      amount: 100,
      displayDescription: 'Oca',
      category: 'restaurants',
    }),
  ]

  it('sorts by date', () => {
    expect(ids(sortTransactions(rows, 'date', 'desc'))).toEqual(['c', 'b', 'a'])
    expect(ids(sortTransactions(rows, 'date', 'asc'))).toEqual(['a', 'b', 'c'])
  })

  it('sorts by absolute amount', () => {
    expect(ids(sortTransactions(rows, 'amount', 'desc'))).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('sorts by display name in Spanish collation (ñ after n)', () => {
    expect(ids(sortTransactions(rows, 'description', 'asc'))).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('sorts by category id', () => {
    expect(ids(sortTransactions(rows, 'category', 'asc'))).toEqual([
      'a',
      'c',
      'b',
    ])
  })

  it('does not reorder its input', () => {
    sortTransactions(rows, 'date', 'asc')
    expect(ids(rows)).toEqual(['b', 'a', 'c'])
  })
})
