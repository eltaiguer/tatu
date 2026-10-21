import { afterEach, describe, expect, it } from 'vitest'
import { currentUserRules, emptyUserRules, hasUserRule } from './user-rules'
import { addCustomPattern, clearAllCustomPatterns } from './custom-patterns'
import { userRules } from '../../test/user-rules'

describe('hasUserRule — does a rule the user wrote cover this row?', () => {
  it('is false with no rules', () => {
    expect(hasUserRule(emptyUserRules(), 'DEVOTO SUPERMERCADO')).toBe(false)
  })

  it('is true for a row with a description override that sets a category', () => {
    const rules = userRules({
      descriptionOverrides: [
        {
          description: 'COMPRA DEVOTO AUT 998877',
          friendlyDescription: 'Devoto',
          category: 'groceries',
        },
      ],
    })

    // Same key once the auth code is stripped
    expect(hasUserRule(rules, 'COMPRA DEVOTO AUT 123456')).toBe(true)
  })

  // The user renamed the row: the AI must not rename it again, even though
  // the categorizer gets no category from this override.
  it('is true for a description override that only renames the row', () => {
    const rules = userRules({
      descriptionOverrides: [
        {
          description: 'KIOSCO 25',
          friendlyDescription: 'Kiosco de la esquina',
        },
      ],
    })

    expect(hasUserRule(rules, 'KIOSCO 25')).toBe(true)
  })

  it('is true for a row whose merchant has an override', () => {
    const rules = userRules({
      merchantOverrides: [
        {
          merchantName: 'COMPRA CON TARJETA DEBITO KIOSCO X 12/03 15:22',
          category: 'personal',
        },
      ],
    })

    expect(
      hasUserRule(rules, 'COMPRA CON TARJETA DEBITO KIOSCO X 01/04 09:10')
    ).toBe(true)
  })

  it('is true for a row a custom pattern matches', () => {
    const rules = userRules({
      customPatterns: [
        { pattern: 'netflix', matchType: 'contains', category: 'shopping' },
      ],
    })

    expect(hasUserRule(rules, 'NETFLIX.COM 866-579-7172')).toBe(true)
    expect(hasUserRule(rules, 'SPOTIFY P12345')).toBe(false)
  })
})

describe('currentUserRules', () => {
  afterEach(() => clearAllCustomPatterns())

  it('reads the rules the stores hold now', () => {
    addCustomPattern({
      pattern: 'netflix',
      matchType: 'contains',
      category: 'shopping',
    })

    expect(hasUserRule(currentUserRules(), 'NETFLIX.COM')).toBe(true)
  })
})
