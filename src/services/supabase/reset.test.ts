import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const { deleteMock, eqMock, fromMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  eqMock: vi.fn(),
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

describe('supabase reset service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    eqMock.mockResolvedValue({ error: null })
    deleteMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ delete: deleteMock })
  })

  it('deletes all user data from supabase tables', async () => {
    const { resetUserSupabaseData } = await import('./reset')
    await resetUserSupabaseData(session)

    expect(fromMock).toHaveBeenCalledTimes(4)
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
  })
})
