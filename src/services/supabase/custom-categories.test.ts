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

  describe('household default (#251, ADR-0005)', () => {
    const row = (extra: Record<string, unknown>) => ({
      user_id: 'user-1',
      id: 'mates',
      label: 'Mates',
      color: '#00AA11',
      icon: null,
      is_ignored: false,
      is_archived: false,
      created_at: '2026-02-20T00:00:00.000Z',
      updated_at: '2026-02-20T00:00:00.000Z',
      ...extra,
    })

    it('reads is_household true / false / null / missing as true / false / none / none', async () => {
      isMock.mockResolvedValueOnce({
        data: [
          row({ id: 'a', is_household: true }),
          row({ id: 'b', is_household: false }),
          row({ id: 'c', is_household: null }),
          row({ id: 'd' }),
        ],
        error: null,
      })
      const { listCustomCategories } = await import('./custom-categories')
      const categories = await listCustomCategories(userId)

      expect(categories.map((c) => c.isHousehold)).toEqual([
        true,
        false,
        undefined,
        undefined,
      ])
    })

    it('sends no is_household key when the choice is not given', async () => {
      const { upsertCustomCategory } = await import('./custom-categories')
      await upsertCustomCategory(userId, {
        id: 'mates',
        label: 'Mates',
        color: '#00AA11',
        isHousehold: undefined,
      })

      // A database without the column must keep accepting category edits, and
      // an upsert that omits a column leaves it as it was on conflict.
      expect(upsertMock.mock.calls[0][0]).not.toHaveProperty('is_household')
    })

    it('sends false as false and null as null', async () => {
      const { upsertCustomCategory } = await import('./custom-categories')
      const base = { id: 'mates', label: 'Mates', color: '#00AA11' }

      await upsertCustomCategory(userId, { ...base, isHousehold: false })
      await upsertCustomCategory(userId, { ...base, isHousehold: true })
      await upsertCustomCategory(userId, { ...base, isHousehold: null })

      expect(upsertMock.mock.calls[0][0].is_household).toBe(false)
      expect(upsertMock.mock.calls[1][0].is_household).toBe(true)
      expect(upsertMock.mock.calls[2][0]).toHaveProperty('is_household', null)
    })
  })

  it('archives custom category', async () => {
    const { archiveCustomCategory } = await import('./custom-categories')
    await archiveCustomCategory(userId, 'mates')

    expect(updateMock).toHaveBeenCalledWith({ is_archived: true })
    expect(eqUpdateUserMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqUpdateIdMock).toHaveBeenCalledWith('id', 'mates')
  })
})
