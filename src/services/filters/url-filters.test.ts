import { describe, expect, it } from 'vitest'
import {
  DEFAULT_URL_FILTERS,
  filterToSearch,
  hasActiveFilters,
  parseFilterParams,
  serializeFilterParams,
  type UrlFilterState,
} from './url-filters'

describe('url filters', () => {
  it('round-trips every filter field', () => {
    const state: UrlFilterState = {
      search: 'uber eats',
      merchant: 'Cantina 25',
      categories: ['restaurants', 'custom_cat_123'],
      accounts: ['credit_card'],
      currency: 'UYU',
      type: 'debit',
      min: '100',
      max: '5000',
      showIgnored: true,
      period: { mode: 'month', y: 2026, m: 2 },
    }

    expect(parseFilterParams(serializeFilterParams(state))).toEqual(state)
  })

  it('omits defaults so plain views keep a clean URL', () => {
    expect(serializeFilterParams(DEFAULT_URL_FILTERS)).toBe('')
  })

  it('encodes "Restaurantes en marzo" as category + month', () => {
    const search = serializeFilterParams({
      ...DEFAULT_URL_FILTERS,
      categories: ['restaurants'],
      period: { mode: 'month', y: 2026, m: 2 },
    })
    expect(search).toBe('categoria=restaurants&periodo=2026-03')
  })

  it('round-trips the other period kinds', () => {
    for (const period of [
      { mode: 'all' as const },
      { mode: 'recent' as const, n: 3 },
      { mode: 'range' as const, from: '2026-01-01', to: '2026-06-30' },
    ]) {
      const state = { ...DEFAULT_URL_FILTERS, period }
      expect(parseFilterParams(serializeFilterParams(state)).period).toEqual(
        period
      )
    }
  })

  it('ignores invalid enum, number and period values instead of failing', () => {
    const parsed = parseFilterParams(
      'cuenta=wallet&moneda=EUR&tipo=x&min=abc&periodo=2026-13&desde=nope'
    )
    expect(parsed).toEqual(DEFAULT_URL_FILTERS)
  })

  it('keeps unknown category ids (custom categories load after the URL is read)', () => {
    expect(parseFilterParams('categoria=mi_categoria').categories).toEqual([
      'mi_categoria',
    ])
  })

  it('builds exact drill-through links', () => {
    expect(filterToSearch({ merchant: 'UBER', type: 'debit' })).toBe(
      'comercio=UBER&tipo=debit&periodo=todo'
    )
    expect(
      filterToSearch({
        categories: ['travel', 'education'],
        type: 'debit',
      })
    ).toBe('categoria=travel&categoria=education&tipo=debit&periodo=todo')
    expect(
      filterToSearch({
        period: { mode: 'month', y: 2026, m: 2 },
        type: 'credit',
      })
    ).toBe('tipo=credit&periodo=2026-03')
  })

  it('builds a deep link from a dashboard filter, defaulting to all time', () => {
    expect(
      filterToSearch({ category: 'restaurants', accountType: 'all' })
    ).toBe('categoria=restaurants&periodo=todo')
    expect(filterToSearch({})).toBe('')
  })
})

function filters(overrides: Partial<UrlFilterState> = {}): UrlFilterState {
  return { ...DEFAULT_URL_FILTERS, ...overrides }
}

describe('hasActiveFilters', () => {
  it('is false for the defaults', () => {
    expect(hasActiveFilters(filters())).toBe(false)
  })

  it.each<[string, Partial<UrlFilterState>]>([
    ['a search', { search: 'disco' }],
    ['a merchant', { merchant: 'uber' }],
    ['a category', { categories: ['groceries'] }],
    ['an account', { accounts: ['credit_card'] }],
    ['a currency', { currency: 'UYU' }],
    ['a type', { type: 'debit' }],
    ['a minimum amount', { min: '10' }],
    ['a maximum amount', { max: '10' }],
  ])('is true with %s', (_, overrides) => {
    expect(hasActiveFilters(filters(overrides))).toBe(true)
  })

  it('ignores a search of only spaces', () => {
    expect(hasActiveFilters(filters({ search: '   ' }))).toBe(false)
  })

  // The period is shown by the month navigator and "show ignored" is a
  // table toggle: neither makes the view "filtrado".
  it('does not count the period or showing ignored rows', () => {
    expect(
      hasActiveFilters(
        filters({
          period: { mode: 'month', y: 2026, m: 2 },
          showIgnored: true,
        })
      )
    ).toBe(false)
  })
})
