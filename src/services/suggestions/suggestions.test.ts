import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildCategorySuggestions,
  buildTagSuggestions,
  filterCategorySuggestions,
  filterTagSuggestions,
} from './suggestions'
import { Category } from '../../models'
import { replaceCustomCategories } from '../categories/category-store'
import { getCategoryDisplay } from '../../utils/category-display'

describe('buildCategorySuggestions', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('lists every built-in category once, sorted by Spanish label', () => {
    const suggestions = buildCategorySuggestions()

    expect(new Set(suggestions)).toEqual(new Set(Object.values(Category)))
    const labels = suggestions.map((id) => getCategoryDisplay(id).label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'es')))
  })

  it('includes custom categories and extra ids, trimmed and deduplicated', () => {
    replaceCustomCategories([
      { id: 'custom_mascotas', label: 'Mascotas', color: '#000', icon: '🐶' },
    ])

    const suggestions = buildCategorySuggestions([
      ' legacy_cat ',
      '',
      Category.Groceries,
    ])

    expect(suggestions).toContain('custom_mascotas')
    expect(suggestions).toContain('legacy_cat')
    expect(suggestions).not.toContain('')
    expect(suggestions.filter((id) => id === Category.Groceries)).toHaveLength(
      1
    )
  })
})

describe('filterCategorySuggestions', () => {
  beforeEach(() => {
    replaceCustomCategories([])
  })

  it('returns every category for an empty query', () => {
    expect(
      filterCategorySuggestions(['groceries', 'restaurants'], '  ')
    ).toEqual(['groceries', 'restaurants'])
  })

  it('matches the id or the label, ignoring case and spaces around', () => {
    const restaurantsLabel = getCategoryDisplay('restaurants').label

    expect(
      filterCategorySuggestions(['groceries', 'restaurants'], ' GROC ')
    ).toEqual(['groceries'])
    expect(
      filterCategorySuggestions(
        ['groceries', 'restaurants'],
        restaurantsLabel.toUpperCase()
      )
    ).toEqual(['restaurants'])
  })
})

describe('buildTagSuggestions', () => {
  it('trims, drops empties, deduplicates and sorts in Spanish order', () => {
    expect(
      buildTagSuggestions(['viaje', ' ñandú', '', 'auto', 'viaje '])
    ).toEqual(['auto', 'ñandú', 'viaje'])
  })
})

describe('filterTagSuggestions', () => {
  it('returns every tag for an empty query', () => {
    expect(filterTagSuggestions(['auto', 'viaje'], '')).toEqual([
      'auto',
      'viaje',
    ])
  })

  it('matches a case-insensitive substring', () => {
    expect(filterTagSuggestions(['auto', 'Viaje'], ' via')).toEqual(['Viaje'])
  })
})
