import { describe, expect, it } from 'vitest'
import { buildCorrectionContext } from './correction-context'
import { userRules } from '../../test/user-rules'

describe('buildCorrectionContext', () => {
  // Built from the rules snapshot the import gates with, not from the stores
  // (empty here), so the examples and the gate agree.
  it('takes its examples and rules from the snapshot it is given', () => {
    const rules = userRules({
      descriptionOverrides: [
        {
          description: 'KIOSCO 25',
          friendlyDescription: 'Kiosco',
          category: 'personal',
        },
      ],
      merchantOverrides: [
        { merchantName: 'DEVOTO EXPRESS', category: 'groceries' },
      ],
      customPatterns: [
        { pattern: 'netflix', matchType: 'contains', category: 'shopping' },
      ],
    })
    const categories = [{ id: 'mascotas', label: 'Mascotas', color: '#000' }]

    const context = buildCorrectionContext(rules, categories)

    expect(context.descriptionExamples).toEqual([
      { raw: 'KIOSCO 25', friendly: 'Kiosco', category: 'personal' },
    ])
    expect(context.categoryExamples).toEqual([
      { merchant: 'DEVOTO EXPRESS', category: 'groceries' },
    ])
    expect(context.customPatterns).toBe(rules.customPatterns)
    expect(context.customCategories).toBe(categories)
  })
})
