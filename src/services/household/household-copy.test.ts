import { describe, expect, it } from 'vitest'
import {
  followOptionLabel,
  householdLine,
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
})
