import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const userId = 'user-1'

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
          is_ignored: true,
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
    const categories = await listCustomCategories(userId)

    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(isMock).toHaveBeenCalledWith('is_archived', false)
    expect(categories).toHaveLength(1)
  })

  it('reads the is_ignored flag from stored rows', async () => {
    const { listCustomCategories } = await import('./custom-categories')
    const categories = await listCustomCategories(userId)

    expect(categories[0].isIgnored).toBe(true)
  })

  it('leaves is_ignored undefined when the column is null', async () => {
    isMock.mockResolvedValueOnce({
      data: [
        {
          user_id: 'user-1',
          id: 'mates',
          label: 'Mates',
          color: '#00AA11',
          icon: '🧉',
          is_ignored: null,
          is_archived: false,
          created_at: '2026-02-20T00:00:00.000Z',
          updated_at: '2026-02-20T00:00:00.000Z',
        },
      ],
      error: null,
    })

    const { listCustomCategories } = await import('./custom-categories')
    const categories = await listCustomCategories(userId)

    // NULL means "no preference recorded" and must stay distinct from an
    // explicit false, which would override a built-in's own default.
    expect(categories[0].isIgnored).toBeUndefined()
  })

  it('upserts custom category', async () => {
    const { upsertCustomCategory } = await import('./custom-categories')
    await upsertCustomCategory(userId, {
      id: 'mates',
      label: 'Mates',
      color: '#00AA11',
      icon: '🧉',
      isIgnored: false,
      isArchived: false,
    })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mates' }),
      { onConflict: 'user_id,id' }
    )
  })

  it('writes false, never null, when no ignore preference is set', async () => {
    // custom_categories.is_ignored is NOT NULL DEFAULT false in schema.sql —
    // a null here is rejected by Postgres at runtime.
    const { upsertCustomCategory } = await import('./custom-categories')
    await upsertCustomCategory(userId, {
      id: 'mates',
      label: 'Mates',
      color: '#00AA11',
    })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mates', is_ignored: false }),
      expect.anything()
    )
  })

  it('persists the is_ignored flag on upsert', async () => {
    const { upsertCustomCategory } = await import('./custom-categories')
    await upsertCustomCategory(userId, {
      id: 'mates',
      label: 'Mates',
      color: '#00AA11',
      icon: '🧉',
      isIgnored: true,
      isArchived: false,
    })

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mates', is_ignored: true }),
      { onConflict: 'user_id,id' }
    )
  })

  it('archives custom category', async () => {
    const { archiveCustomCategory } = await import('./custom-categories')
    await archiveCustomCategory(userId, 'mates')

    expect(updateMock).toHaveBeenCalledWith({ is_archived: true })
    expect(eqUpdateUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqUpdateIdMock).toHaveBeenCalledWith('id', 'mates')
  })
})
