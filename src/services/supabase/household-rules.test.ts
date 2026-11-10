import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  selectMock,
  eqMock,
  upsertMock,
  deleteMock,
  eqDeleteUserMock,
  eqDeleteMerchantMock,
  fromMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  upsertMock: vi.fn(),
  deleteMock: vi.fn(),
  eqDeleteUserMock: vi.fn(),
  eqDeleteMerchantMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('./client', () => ({
  getSupabaseClient: () => ({ from: fromMock }),
}))

const userId = 'user-1'

describe('supabase household rules service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    eqMock.mockResolvedValue({
      data: [
        {
          user_id: 'user-1',
          merchant_normalized: 'devoto',
          merchant_original: 'Devoto',
          is_household: true,
          updated_at: '2026-02-20T00:00:00.000Z',
          created_at: '2026-02-20T00:00:00.000Z',
        },
      ],
      error: null,
    })
    selectMock.mockReturnValue({ eq: eqMock })

    upsertMock.mockResolvedValue({ error: null })

    eqDeleteMerchantMock.mockResolvedValue({ error: null })
    eqDeleteUserMock.mockReturnValue({ eq: eqDeleteMerchantMock })
    deleteMock.mockReturnValue({ eq: eqDeleteUserMock })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'household_rules') {
        throw new Error('unexpected table')
      }
      return {
        select: selectMock,
        upsert: upsertMock,
        delete: deleteMock,
      }
    })
  })

  it('lists rules for current user', async () => {
    const { listHouseholdRules } = await import('./household-rules')
    const overrides = await listHouseholdRules(userId)

    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(overrides).toEqual([
      {
        merchantNormalized: 'devoto',
        merchantOriginal: 'Devoto',
        isHousehold: true,
        createdAt: '2026-02-20T00:00:00.000Z',
        updatedAt: '2026-02-20T00:00:00.000Z',
      },
    ])
  })

  it('upserts a rule', async () => {
    const { upsertHouseholdRule } = await import('./household-rules')
    await upsertHouseholdRule(userId, {
      merchantNormalized: 'devoto',
      merchantOriginal: 'Devoto',
      isHousehold: true,
    })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        merchant_normalized: 'devoto',
        is_household: true,
      }),
      { onConflict: 'user_id,merchant_normalized' }
    )
  })

  it('deletes a rule', async () => {
    const { deleteHouseholdRule } = await import('./household-rules')
    await deleteHouseholdRule(userId, 'devoto')

    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(eqDeleteUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqDeleteMerchantMock).toHaveBeenCalledWith(
      'merchant_normalized',
      'devoto'
    )
  })
})
