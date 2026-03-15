import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const {
  selectMock,
  eqMock,
  upsertMock,
  deleteMock,
  eqDeleteUserMock,
  eqDeleteDescriptionMock,
  fromMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  upsertMock: vi.fn(),
  deleteMock: vi.fn(),
  eqDeleteUserMock: vi.fn(),
  eqDeleteDescriptionMock: vi.fn(),
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
  user: {
    id: 'user-1',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '',
  },
}

describe('supabase description overrides service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    eqMock.mockResolvedValue({
      data: [
        {
          user_id: 'user-1',
          description_normalized: 'devoto',
          description_original: 'AUT 998877 DEVOTO',
          friendly_description: 'Devoto',
          category: 'groceries',
          updated_at: '2026-02-20T00:00:00.000Z',
          created_at: '2026-02-20T00:00:00.000Z',
        },
      ],
      error: null,
    })
    selectMock.mockReturnValue({ eq: eqMock })

    upsertMock.mockResolvedValue({ error: null })

    eqDeleteDescriptionMock.mockResolvedValue({ error: null })
    eqDeleteUserMock.mockReturnValue({ eq: eqDeleteDescriptionMock })
    deleteMock.mockReturnValue({ eq: eqDeleteUserMock })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'description_overrides') {
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
    const { listDescriptionOverrides } = await import('./description-overrides')
    const overrides = await listDescriptionOverrides(session)

    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(overrides).toHaveLength(1)
  })

  it('upserts an override', async () => {
    const { upsertDescriptionOverride } = await import(
      './description-overrides'
    )
    await upsertDescriptionOverride(session, {
      descriptionNormalized: 'devoto',
      descriptionOriginal: 'AUT 998877 DEVOTO',
      friendlyDescription: 'Devoto',
      category: 'groceries',
    })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ description_normalized: 'devoto' }),
      { onConflict: 'user_id,description_normalized' }
    )
  })

  it('deletes an override', async () => {
    const { deleteDescriptionOverride } = await import(
      './description-overrides'
    )
    await deleteDescriptionOverride(session, 'devoto')

    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(eqDeleteUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqDeleteDescriptionMock).toHaveBeenCalledWith(
      'description_normalized',
      'devoto'
    )
  })
})

