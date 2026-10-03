import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const {
  selectMock,
  eqMock,
  isMock,
  orderMock,
  rangeMock,
  upsertMock,
  updateMock,
  eqForUpdateMock,
  eqForUpdateIdMock,
  fromMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  orderMock: vi.fn(),
  rangeMock: vi.fn(),
  upsertMock: vi.fn(),
  updateMock: vi.fn(),
  eqForUpdateMock: vi.fn(),
  eqForUpdateIdMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('./client', () => ({
  getSupabaseClient: () => ({
    from: fromMock,
  }),
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

describe('supabase transactions service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    rangeMock.mockImplementation(async (from: number) => ({
      data:
        from > 0
          ? []
          : [
              {
                user_id: 'user-1',
                transaction_id: 'tx-1',
                date: '2026-02-01T00:00:00.000Z',
                description: 'Compra',
                amount: 100,
                currency: 'UYU',
                type: 'debit',
                source: 'bank_account',
                category: 'groceries',
                category_confidence: 0.9,
                balance: 2000,
                raw_data: { referencia: '1' },
              },
            ],
      error: null,
    }))

    orderMock.mockReturnValue({ range: rangeMock })
    isMock.mockReturnValue({ order: orderMock })
    eqMock.mockReturnValue({ is: isMock })
    selectMock.mockReturnValue({ eq: eqMock })

    upsertMock.mockResolvedValue({ error: null })

    eqForUpdateIdMock.mockResolvedValue({ error: null })
    eqForUpdateMock.mockReturnValue({ eq: eqForUpdateIdMock })
    updateMock.mockReturnValue({ eq: eqForUpdateMock })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'transactions') {
        throw new Error('unexpected table')
      }
      return {
        select: selectMock,
        upsert: upsertMock,
        update: updateMock,
      }
    })
  })

  it('loads active transactions for current user', async () => {
    const { loadUserTransactions } = await import('./transactions')
    const transactions = await loadUserTransactions(session)

    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(isMock).toHaveBeenCalledWith('is_deleted', false)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].id).toBe('tx-1')
  })

  it('loads every transaction when the account exceeds the server row cap', async () => {
    // PostgREST caps each response at max-rows (1000 by default) without
    // erroring, so a single unpaged select silently drops the rest.
    const SERVER_MAX_ROWS = 1000
    const TOTAL = 1053
    const allRows = Array.from({ length: TOTAL }, (_, i) => ({
      user_id: 'user-1',
      transaction_id: `tx-${String(i).padStart(4, '0')}`,
      date: '2026-02-01T00:00:00.000Z',
      description: 'Compra',
      amount: 100,
      currency: 'UYU',
      type: 'debit',
      source: 'bank_account',
      category: null,
      category_confidence: null,
      balance: null,
      raw_data: {},
    }))
    rangeMock.mockImplementation(async (from: number, to: number) => ({
      data: allRows.slice(from, Math.min(to + 1, from + SERVER_MAX_ROWS)),
      error: null,
    }))

    const { loadUserTransactions } = await import('./transactions')
    const transactions = await loadUserTransactions(session)

    expect(transactions).toHaveLength(TOTAL)
    expect(new Set(transactions.map((tx) => tx.id)).size).toBe(TOTAL)
    expect(orderMock).toHaveBeenCalledWith('transaction_id', {
      ascending: true,
    })
  })

  it('still loads everything when the server cap is below the page size', async () => {
    const SERVER_MAX_ROWS = 300
    const allRows = Array.from({ length: 700 }, (_, i) => ({
      user_id: 'user-1',
      transaction_id: `tx-${String(i).padStart(4, '0')}`,
      date: '2026-02-01T00:00:00.000Z',
      description: 'Compra',
      amount: 1,
      currency: 'UYU',
      type: 'debit',
      source: 'bank_account',
      category: null,
      category_confidence: null,
      balance: null,
      raw_data: {},
    }))
    rangeMock.mockImplementation(async (from: number, to: number) => ({
      data: allRows.slice(from, Math.min(to + 1, from + SERVER_MAX_ROWS)),
      error: null,
    }))

    const { loadUserTransactions } = await import('./transactions')
    const transactions = await loadUserTransactions(session)

    expect(transactions).toHaveLength(700)
  })

  it('throws when any page fails instead of returning a partial list', async () => {
    rangeMock.mockImplementation(async (from: number) =>
      from === 0
        ? {
            data: Array.from({ length: 1000 }, (_, i) => ({
              user_id: 'user-1',
              transaction_id: `tx-${i}`,
              date: '2026-02-01T00:00:00.000Z',
              description: 'Compra',
              amount: 1,
              currency: 'UYU',
              type: 'debit',
              source: 'bank_account',
              category: null,
              category_confidence: null,
              balance: null,
              raw_data: {},
            })),
            error: null,
          }
        : { data: null, error: { message: 'timeout' } }
    )

    const { loadUserTransactions } = await import('./transactions')
    await expect(loadUserTransactions(session)).rejects.toThrow('timeout')
  })

  it('upserts transactions with user ownership', async () => {
    const { persistTransactions } = await import('./transactions')
    await persistTransactions(session, [
      {
        id: 'tx-99',
        date: new Date('2026-02-03T00:00:00.000Z'),
        description: 'Cafe',
        amount: 50,
        currency: 'UYU',
        type: 'debit',
        source: 'credit_card',
        tags: ['coffee', 'work'],
        rawData: {},
      },
    ])

    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(upsertMock.mock.calls[0][1]).toEqual({
      onConflict: 'user_id,transaction_id',
    })
    expect(upsertMock.mock.calls[0][0][0].tags).toEqual(['coffee', 'work'])
  })

  it('does not include is_deleted in upsert payload so soft-deleted transactions are not resurrected on re-import', async () => {
    const { persistTransactions } = await import('./transactions')
    await persistTransactions(session, [
      {
        id: 'tx-deleted',
        date: new Date('2026-02-03T00:00:00.000Z'),
        description: 'Supermercado',
        amount: 200,
        currency: 'UYU',
        type: 'debit',
        source: 'credit_card',
        rawData: {},
      },
    ])

    const row = upsertMock.mock.calls[0][0][0]
    expect(row).not.toHaveProperty('is_deleted')
    expect(row).not.toHaveProperty('deleted_at')
  })

  it('soft deletes a transaction', async () => {
    const { softDeleteTransaction } = await import('./transactions')
    await softDeleteTransaction(session, 'tx-99')

    expect(updateMock).toHaveBeenCalledWith({
      is_deleted: true,
      deleted_at: expect.any(String),
    })
    expect(eqForUpdateMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqForUpdateIdMock).toHaveBeenCalledWith('transaction_id', 'tx-99')
  })

  it('restores a soft-deleted transaction', async () => {
    const { restoreTransaction } = await import('./transactions')
    await restoreTransaction(session, 'tx-99')

    expect(updateMock).toHaveBeenCalledWith({
      is_deleted: false,
      deleted_at: null,
    })
    expect(eqForUpdateMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqForUpdateIdMock).toHaveBeenCalledWith('transaction_id', 'tx-99')
  })

  it('updates editable fields for a transaction', async () => {
    const { updateTransaction } = await import('./transactions')
    await updateTransaction(session, 'tx-99', {
      description: 'Nuevo comercio',
      category: '',
      tags: ['servicio', 'mensual'],
    })

    expect(updateMock).toHaveBeenCalledWith({
      description: 'Nuevo comercio',
      category: null,
      tags: ['servicio', 'mensual'],
    })
    expect(eqForUpdateMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqForUpdateIdMock).toHaveBeenCalledWith('transaction_id', 'tx-99')
  })

  it('does not issue update when no fields are provided', async () => {
    const { updateTransaction } = await import('./transactions')
    await updateTransaction(session, 'tx-99', {})

    expect(updateMock).not.toHaveBeenCalled()
  })
})
