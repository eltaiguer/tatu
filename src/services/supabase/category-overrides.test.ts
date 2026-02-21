import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

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

const session: SupabaseSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  user: { id: 'user-1', email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
}

describe('supabase category overrides service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    eqMock.mockResolvedValue({
      data: [
        {
          user_id: 'user-1',
          merchant_normalized: 'devoto',
          merchant_original: 'Devoto',
          category: 'groceries',
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
      if (table !== 'category_overrides') {
        throw new Error('unexpected table')
      }
      return {
        select: selectMock,
        upsert: upsertMock,
        delete: deleteMock,
      }
    })
  })

  it('lists overrides for current user', async () => {
    const { listCategoryOverrides } = await import('./category-overrides')
    const overrides = await listCategoryOverrides(session)

    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(overrides).toHaveLength(1)
  })

  it('upserts an override', async () => {
    const { upsertCategoryOverride } = await import('./category-overrides')
    await upsertCategoryOverride(session, {
      merchantNormalized: 'devoto',
      merchantOriginal: 'Devoto',
      category: 'groceries',
    })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_normalized: 'devoto' }),
      { onConflict: 'user_id,merchant_normalized' }
    )
  })

  it('deletes an override', async () => {
    const { deleteCategoryOverride } = await import('./category-overrides')
    await deleteCategoryOverride(session, 'devoto')

    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(eqDeleteUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqDeleteMerchantMock).toHaveBeenCalledWith(
      'merchant_normalized',
      'devoto'
    )
  })
})
