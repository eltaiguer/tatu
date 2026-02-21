import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const {
  selectMock,
  eqMock,
  isMock,
  upsertMock,
  updateMock,
  eqForUpdateMock,
  eqForUpdateIdMock,
  fromMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
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
  user: { id: 'user-1', email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
}

describe('supabase transactions service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    isMock.mockResolvedValue({
      data: [
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
    })

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

  it('soft deletes a transaction', async () => {
    const { softDeleteTransaction } = await import('./transactions')
    await softDeleteTransaction(session, 'tx-99')

    expect(updateMock).toHaveBeenCalledWith({ is_deleted: true })
    expect(eqForUpdateMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqForUpdateIdMock).toHaveBeenCalledWith('transaction_id', 'tx-99')
  })

  it('restores a soft-deleted transaction', async () => {
    const { restoreTransaction } = await import('./transactions')
    await restoreTransaction(session, 'tx-99')

    expect(updateMock).toHaveBeenCalledWith({ is_deleted: false })
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
