import { describe, expect, it } from 'vitest'
import {
  DEFAULT_URL_FILTERS,
  filterToSearch,
  parseFilterParams,
  serializeFilterParams,
  type UrlFilterState,
} from './url-filters'

describe('url filters', () => {
  it('round-trips every filter field', () => {
    const state: UrlFilterState = {
      search: 'uber eats',
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

  it('builds a deep link from a dashboard filter, defaulting to all time', () => {
    expect(
      filterToSearch({ category: 'restaurants', accountType: 'all' })
    ).toBe('categoria=restaurants&periodo=todo')
    expect(filterToSearch({})).toBe('')
  })
})
