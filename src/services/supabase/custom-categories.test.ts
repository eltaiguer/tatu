import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const {
  selectMock,
  eqMock,
  isMock,
  upsertMock,
  updateMock,
  eqUpdateUserMock,
  eqUpdateIdMock,
  fromMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  upsertMock: vi.fn(),
  updateMock: vi.fn(),
  eqUpdateUserMock: vi.fn(),
  eqUpdateIdMock: vi.fn(),
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

describe('supabase custom categories service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    isMock.mockResolvedValue({
      data: [
        {
          user_id: 'user-1',
          id: 'mates',
          label: 'Mates',
          color: '#00AA11',
          icon: '🧉',
          is_archived: false,
          created_at: '2026-02-20T00:00:00.000Z',
          updated_at: '2026-02-20T00:00:00.000Z',
        },
      ],
      error: null,
    })

    eqMock.mockReturnValue({ is: isMock })
    selectMock.mockReturnValue({ eq: eqMock })

    upsertMock.mockResolvedValue({ error: null })

    eqUpdateIdMock.mockResolvedValue({ error: null })
    eqUpdateUserMock.mockReturnValue({ eq: eqUpdateIdMock })
    updateMock.mockReturnValue({ eq: eqUpdateUserMock })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'custom_categories') {
        throw new Error('unexpected table')
      }
      return {
        select: selectMock,
        upsert: upsertMock,
        update: updateMock,
      }
    })
  })

  it('lists active custom categories', async () => {
    const { listCustomCategories } = await import('./custom-categories')
    const categories = await listCustomCategories(session)

    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(isMock).toHaveBeenCalledWith('is_archived', false)
    expect(categories).toHaveLength(1)
  })

  it('upserts custom category', async () => {
    const { upsertCustomCategory } = await import('./custom-categories')
    await upsertCustomCategory(session, {
      id: 'mates',
      label: 'Mates',
      color: '#00AA11',
      icon: '🧉',
      isArchived: false,
    })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mates' }),
      { onConflict: 'user_id,id' }
    )
  })

  it('archives custom category', async () => {
    const { archiveCustomCategory } = await import('./custom-categories')
    await archiveCustomCategory(session, 'mates')

    expect(updateMock).toHaveBeenCalledWith({ is_archived: true })
    expect(eqUpdateUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqUpdateIdMock).toHaveBeenCalledWith('id', 'mates')
  })
})
