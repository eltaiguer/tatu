import { describe, expect, it } from 'vitest'
import {
  DEFAULT_URL_FILTERS,
  filterToSearch,
  hasActiveFilters,
  householdModeFromSearch,
  householdModeToSearch,
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
      household: 'household',
      review: true,
      reviewMode: true,
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

describe('url filters — A revisar', () => {
  it('reads ?revisar=si, anything else is off', () => {
    expect(parseFilterParams('revisar=si').review).toBe(true)
    expect(parseFilterParams('revisar=1').review).toBe(false)
    expect(parseFilterParams('').review).toBe(false)
  })

  it('writes it back and leaves the default out', () => {
    expect(
      serializeFilterParams({ ...DEFAULT_URL_FILTERS, review: true })
    ).toBe('revisar=si')
    expect(
      serializeFilterParams({ ...DEFAULT_URL_FILTERS, review: false })
    ).toBe('')
    expect(
      serializeFilterParams(parseFilterParams('revisar=si&tipo=credit'))
    ).toBe('tipo=credit&revisar=si')
  })

  it('counts as an active filter', () => {
    expect(hasActiveFilters({ ...DEFAULT_URL_FILTERS, review: true })).toBe(
      true
    )
  })

  it('builds a link with the period after the token', () => {
    expect(
      filterToSearch({
        review: true,
        period: { mode: 'range', from: '2025-03-01', to: '2025-12-31' },
      })
    ).toBe('revisar=si&desde=2025-03-01&hasta=2025-12-31')
    expect(filterToSearch({ review: true })).toBe('revisar=si&periodo=todo')
  })
})

describe('url filters — review mode', () => {
  it('reads ?modo=revisar only beside revisar=si', () => {
    const on = parseFilterParams('revisar=si&modo=revisar')
    expect(on.review).toBe(true)
    expect(on.reviewMode).toBe(true)
    const alone = parseFilterParams('modo=revisar')
    expect(alone.review).toBe(false)
    expect(alone.reviewMode).toBe(false)
    expect(parseFilterParams('revisar=si&modo=otro').reviewMode).toBe(false)
  })

  it('writes modo right after revisar, only when both are on', () => {
    expect(
      serializeFilterParams(filters({ review: true, reviewMode: true }))
    ).toBe('revisar=si&modo=revisar')
    expect(serializeFilterParams(filters({ review: true }))).toBe('revisar=si')
    expect(serializeFilterParams(filters({ reviewMode: true }))).toBe('')
  })

  it('is not a filter', () => {
    expect(hasActiveFilters(filters({ reviewMode: true }))).toBe(false)
    expect(hasActiveFilters(filters({ review: true, reviewMode: true }))).toBe(
      true
    )
  })

  it('builds the link the Revisar entries open', () => {
    expect(
      filterToSearch({
        categories: ['uncategorized'],
        type: 'debit',
        reviewMode: true,
      })
    ).toBe(
      'categoria=uncategorized&tipo=debit&revisar=si&modo=revisar&periodo=todo'
    )
  })
})

describe('url filters — Hogar', () => {
  it('reads ?hogar=si, anything else is all', () => {
    expect(parseFilterParams('hogar=si').household).toBe('household')
    expect(parseFilterParams('hogar=x').household).toBe('all')
    expect(parseFilterParams('').household).toBe('all')
  })

  it('writes the values back and leaves the default out', () => {
    expect(
      serializeFilterParams({ ...DEFAULT_URL_FILTERS, household: 'household' })
    ).toBe('hogar=si')
    expect(
      serializeFilterParams({ ...DEFAULT_URL_FILTERS, household: 'all' })
    ).toBe('')
  })

  it('ignores ?hogar=sin-definir like any unknown value', () => {
    expect(parseFilterParams('hogar=sin-definir').household).toBe('all')
    expect(serializeFilterParams(parseFilterParams('hogar=sin-definir'))).toBe(
      ''
    )
  })

  it('drops hogar when the type is income: that mix lists nothing', () => {
    expect(parseFilterParams('tipo=credit&hogar=si').household).toBe('all')
    expect(parseFilterParams('tipo=debit&hogar=si').household).toBe('household')
    expect(filterToSearch({ type: 'credit', household: 'household' })).toBe(
      'tipo=credit&periodo=todo'
    )
  })

  it('builds a deep link that filters all time', () => {
    expect(filterToSearch({ household: 'household' })).toBe(
      'hogar=si&periodo=todo'
    )
  })
})

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
    ['the household filter', { household: 'household' }],
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

  describe('Resumen household mode', () => {
    it('is on only for hogar=si', () => {
      expect(householdModeFromSearch('?hogar=si')).toBe(true)
      expect(householdModeFromSearch('?hogar=x')).toBe(false)
      expect(householdModeFromSearch('?hogar=sin-definir')).toBe(false)
      expect(householdModeFromSearch('')).toBe(false)
    })

    it('writes the query it reads back', () => {
      expect(householdModeToSearch(true)).toBe('?hogar=si')
      expect(householdModeToSearch(false)).toBe('')
      expect(householdModeFromSearch(householdModeToSearch(true))).toBe(true)
    })
  })
  describe('amount bound in a deep link (#286)', () => {
    it('writes min and max as the native amount, with the period defaulting to all', () => {
      const params = new URLSearchParams(
        filterToSearch({
          merchant: 'netflix',
          min: 416.5,
          max: 416.5,
          currency: 'USD',
        })
      )
      expect(params.get('comercio')).toBe('netflix')
      expect(params.get('min')).toBe('416.5')
      expect(params.get('max')).toBe('416.5')
      expect(params.get('moneda')).toBe('USD')
      expect(params.get('periodo')).toBe('todo')
    })

    it('reads a lone min back as the view state', () => {
      const state = parseFilterParams(filterToSearch({ min: 10 }))
      expect(state.min).toBe('10')
      expect(state.max).toBe('')
    })
  })
})
