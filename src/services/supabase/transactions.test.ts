import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const mockFetch = vi.fn()

const session: SupabaseSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  user: { id: 'user-1', email: 'test@example.com' },
}

describe('supabase transactions service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test-key')
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('loads transactions for current user', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
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
    })

    const { loadUserTransactions } = await import('./transactions')
    const transactions = await loadUserTransactions(session)

    expect(transactions).toHaveLength(1)
    expect(transactions[0].id).toBe('tx-1')
    expect(transactions[0].date).toBeInstanceOf(Date)
  })

  it('upserts transactions with user ownership', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => null,
    })

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
        rawData: {},
      },
    ])

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/transactions?on_conflict=user_id,transaction_id',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })
})
