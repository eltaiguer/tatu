import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllDescriptionOverrides,
  clearDescriptionOverride,
  clearDescriptionOverrideWithSync,
  getDescriptionOverride,
  listDescriptionOverrides,
  setDescriptionOverride,
  setDescriptionOverrideWithSync,
} from './description-overrides'

const {
  getActiveSupabaseSessionMock,
  upsertDescriptionOverrideMock,
  deleteDescriptionOverrideMock,
} = vi.hoisted(() => ({
  getActiveSupabaseSessionMock: vi.fn(),
  upsertDescriptionOverrideMock: vi.fn(),
  deleteDescriptionOverrideMock: vi.fn(),
}))

vi.mock('../supabase/runtime', () => ({
  getActiveSupabaseSession: getActiveSupabaseSessionMock,
}))

vi.mock('../supabase/description-overrides', () => ({
  upsertDescriptionOverride: upsertDescriptionOverrideMock,
  deleteDescriptionOverride: deleteDescriptionOverrideMock,
}))

describe('Description overrides', () => {
  beforeEach(() => {
    clearAllDescriptionOverrides()
    vi.clearAllMocks()
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

  it('syncs override changes when session exists', async () => {
    getActiveSupabaseSessionMock.mockReturnValue({
      user: { id: 'user-1' },
    })
    upsertDescriptionOverrideMock.mockResolvedValue(undefined)
    deleteDescriptionOverrideMock.mockResolvedValue(undefined)

    await setDescriptionOverrideWithSync({
      description: 'AUT 998877 DEVOTO',
      friendlyDescription: 'Devoto',
      category: 'groceries',
    })
    await clearDescriptionOverrideWithSync('AUT 998877 DEVOTO')

    expect(upsertDescriptionOverrideMock).toHaveBeenCalledTimes(1)
    expect(deleteDescriptionOverrideMock).toHaveBeenCalledTimes(1)
  })

  it('supports symbol-only descriptions via raw fallback key', () => {
    setDescriptionOverride({
      description: '---- 123456 ----',
      friendlyDescription: 'Ajuste bancario',
    })

    const override = getDescriptionOverride('---- 999999 ----')
    expect(override).toBeNull()
    expect(getDescriptionOverride('---- 123456 ----')?.friendlyDescription).toBe(
      'Ajuste bancario'
    )
  })
})
