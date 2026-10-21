import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllDescriptionOverrides,
  clearDescriptionOverride,
  getDescriptionOverride,
  listDescriptionOverrides,
  setDescriptionOverride,
  replaceDescriptionOverrides,
} from './description-overrides'

describe('Description overrides', () => {
  beforeEach(() => {
    clearAllDescriptionOverrides()
  })

  it('sets and retrieves overrides', () => {
    setDescriptionOverride({
      description: 'AUT 998877 DEVOTO',
      friendlyDescription: 'Devoto',
      category: 'groceries',
    })

    const override = getDescriptionOverride('AUT 12345 DEVOTO')
    expect(override?.friendlyDescription).toBe('Devoto')
    expect(override?.category).toBe('groceries')
    expect(listDescriptionOverrides()).toHaveProperty('devoto')
  })

  it('clears overrides', () => {
    setDescriptionOverride({
      description: 'UBER*TRIP 123',
      friendlyDescription: 'Uber',
    })
    clearDescriptionOverride('UBER*TRIP 555')

    expect(getDescriptionOverride('UBER*TRIP 999')).toBeNull()
  })

  it('supports symbol-only descriptions via raw fallback key', () => {
    setDescriptionOverride({
      description: '---- 123456 ----',
      friendlyDescription: 'Ajuste bancario',
    })

    const override = getDescriptionOverride('---- 999999 ----')
    expect(override).toBeNull()
    expect(
      getDescriptionOverride('---- 123456 ----')?.friendlyDescription
    ).toBe('Ajuste bancario')
  })
})

describe('overrides stored under the pre-fix key (review of #222)', () => {
  it('still finds a rename stored under the key that ate a merchant word', () => {
    replaceDescriptionOverrides({
      disco: {
        descriptionOriginal: 'AUTOSERVICIO DISCO 12/03',
        friendlyDescription: 'Disco',
        updatedAt: '',
      },
    })

    expect(
      getDescriptionOverride('AUTOSERVICIO DISCO 20/03')?.friendlyDescription
    ).toBe('Disco')
  })
})
