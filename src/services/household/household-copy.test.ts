import { describe, expect, it } from 'vitest'
import {
  followOptionLabel,
  householdLine,
  householdShareLine,
  householdValueLabel,
} from './household-copy'

describe('household copy', () => {
  it('names the value compactly', () => {
    expect(householdValueLabel(true)).toBe('Hogar: Sí')
    expect(householdValueLabel(false)).toBe('Hogar: No')
  })

  it('says value and source in one line', () => {
    expect(
      householdLine('groceries', { status: 'household', source: 'category' })
    ).toBe('Hogar · según Alimentación')
    expect(
      householdLine('groceries', { status: 'not_household', source: 'row' })
    ).toBe('No es del hogar · elegido a mano')
    expect(
      householdLine(undefined, { status: 'household', source: 'merchant' })
    ).toBe('Hogar · según comercio')
  })

  it('labels the "follow" option of the edit dialog', () => {
    expect(followOptionLabel('comercio', true)).toBe('Según comercio (Sí)')
    expect(followOptionLabel('categoría', false)).toBe('Según categoría (No)')
  })

  describe('householdShareLine', () => {
    it('says the rounded share of the total', () => {
      expect(householdShareLine(1426, 2300, 'USD')).toBe(
        'Hogar 62% de US$ 2.300,00'
      )
    })

    it('formats the total in the home currency', () => {
      expect(householdShareLine(10000, 40000, 'UYU')).toBe(
        'Hogar 25% de $U 40.000,00'
      )
    })

    it('says <1% when there is a share that rounds to nothing', () => {
      expect(householdShareLine(1, 1000, 'USD')).toBe(
        'Hogar <1% de US$ 1.000,00'
      )
    })

    it('rounds a half percent up to 1%', () => {
      expect(householdShareLine(5, 1000, 'USD')).toBe(
        'Hogar 1% de US$ 1.000,00'
      )
    })

    it('says 0% when the house spent nothing', () => {
      expect(householdShareLine(0, 300, 'USD')).toBe('Hogar 0% de US$ 300,00')
    })

    it('never says 100% of a total the house is not all of', () => {
      expect(householdShareLine(2295, 2300, 'USD')).toBe(
        'Hogar 99% de US$ 2.300,00'
      )
    })

    it('says 100% only when the house is the whole total', () => {
      expect(householdShareLine(300, 300, 'USD')).toBe(
        'Hogar 100% de US$ 300,00'
      )
    })

    it('has nothing to say about an empty total', () => {
      expect(householdShareLine(0, 0, 'USD')).toBeNull()
    })
  })
})
