import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Transaction } from '../../models'
import { removeCustomCategory, replaceCustomCategories } from './category-store'
import { CategoryBadge } from '../../components/CategoryBadge'
import { buildCsv } from '../export/export'
import { toCategorySpendRows } from '../charts/dashboard-rows'
import { buildCategorySpendingConverted } from '../charts/chart-data'
import { filterTransactions } from '../filters/transaction-filter'
import { DEFAULT_URL_FILTERS } from '../filters/url-filters'
import { needsCategoryReview } from '../../utils/transaction-display'
import { getCategoryTransactionCount } from './category-counts'
import { countsTowardTotals } from '../spending/spending-rules'

// One row whose custom category was deleted (archived): every surface must
// tell the same story about it — its own category, labelled from its id,
// counted in totals, never "Sin categoría".
function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2026-03-10T00:00:00.000Z'),
    description: 'Pasajes Buquebus',
    amount: 120,
    currency: 'USD',
    type: 'debit',
    source: 'credit_card',
    category: 'viajes-familia',
    categoryConfidence: 1,
    rawData: {},
    ...overrides,
  }
}

beforeEach(() => {
  replaceCustomCategories([
    { id: 'viajes-familia', label: 'Viajes', color: '#123456', icon: '✈️' },
  ])
  removeCustomCategory('viajes-familia')
})

afterEach(() => {
  replaceCustomCategories([])
})

describe('a row in an archived custom category, on every surface', () => {
  it('the badge shows the same label as the filter, donut and export', () => {
    const row = tx()
    render(<CategoryBadge categoryId={row.category} />)

    expect(screen.getByText('Viajes familia')).toBeInTheDocument()
    expect(screen.queryByText('Sin categoría')).not.toBeInTheDocument()

    const [donutRow] = toCategorySpendRows(
      buildCategorySpendingConverted([row], 'USD', 40)
    )
    expect(donutRow).toMatchObject({
      categoryId: 'viajes-familia',
      label: 'Viajes familia',
      emoji: '🏷️',
      value: 120,
    })

    const csv = buildCsv([row]).split('\n')[1]
    expect(csv).toContain('"Viajes familia"')
  })

  it('counts in totals and never as uncategorized', () => {
    const row = tx()

    expect(countsTowardTotals(row)).toBe(true)
    expect(needsCategoryReview(row)).toBe(false)
    expect(
      filterTransactions([row], {
        ...DEFAULT_URL_FILTERS,
        categories: ['uncategorized'],
      })
    ).toEqual([])
    expect(
      filterTransactions([row], {
        ...DEFAULT_URL_FILTERS,
        categories: ['viajes-familia'],
      })
    ).toEqual([row])
    expect(getCategoryTransactionCount([row], 'viajes-familia')).toBe(1)
    expect(getCategoryTransactionCount([row], 'uncategorized')).toBe(0)
  })
})

describe("a row marked with Ignorar ('ignored')", () => {
  it('reads "Ignorada" on the badge and in the export, in Spanish', () => {
    const row = tx({ category: 'ignored' })
    render(<CategoryBadge categoryId={row.category} />)

    expect(screen.getByText('Ignorada')).toBeInTheDocument()
    expect(buildCsv([row]).split('\n')[1]).toContain('"Ignorada"')
    expect(countsTowardTotals(row)).toBe(false)
  })
})
