import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const {
  selectMock,
  eqMock,
  isMock,
  gtMock,
  orderMock,
  limitMock,
  upsertMock,
  insertMock,
  updateMock,
  eqForUpdateMock,
  eqForUpdateIdMock,
  inForUpdateMock,
  selectAfterUpdateMock,
  fromMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  isMock: vi.fn(),
  gtMock: vi.fn(),
  orderMock: vi.fn(),
  limitMock: vi.fn(),
  upsertMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  eqForUpdateMock: vi.fn(),
  eqForUpdateIdMock: vi.fn(),
  inForUpdateMock: vi.fn(),
  selectAfterUpdateMock: vi.fn(),
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

type FakeRow = Record<string, unknown> & { transaction_id: string }

function makeRow(i: number): FakeRow {
  return {
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
  }
}

// In-memory stand-in for the transactions table behind PostgREST: each read
// returns rows with transaction_id above the .gt() bound, sorted, and capped at
// the server's max-rows no matter what .limit() asks for. `beforePage` lets a
// test change the table between page requests, as another device would.
const table = {
  rows: [] as FakeRow[],
  maxRows: 1000,
  beforePage: (() => {}) as (page: number) => void,
  failOnPage: -1,
}

function installFakeTable() {
  let page = 0
  let after: string | undefined
  const builder = {
    eq: eqMock,
    is: isMock,
    gt: gtMock,
    order: orderMock,
    limit: limitMock,
  }
  selectMock.mockReturnValue(builder)
  eqMock.mockReturnValue(builder)
  isMock.mockReturnValue(builder)
  orderMock.mockReturnValue(builder)
  gtMock.mockImplementation((_column: string, value: string) => {
    after = value
    return builder
  })
  limitMock.mockImplementation(async (n: number) => {
    table.beforePage(page)
    const current = page++
    const bound = after
    after = undefined
    if (current === table.failOnPage) {
      return { data: null, error: { message: 'timeout' } }
    }
    const data = [...table.rows]
      .sort((a, b) => a.transaction_id.localeCompare(b.transaction_id))
      .filter((row) => bound === undefined || row.transaction_id > bound)
      .slice(0, Math.min(n, table.maxRows))
    return { data, error: null }
  })
}

describe('supabase transactions service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    table.rows = [
      {
        ...makeRow(1),
        transaction_id: 'tx-1',
        category: 'groceries',
        category_confidence: 0.9,
        balance: 2000,
        raw_data: { referencia: '1' },
      },
    ]
    table.maxRows = 1000
    table.beforePage = () => {}
    table.failOnPage = -1
    installFakeTable()

    upsertMock.mockResolvedValue({ error: null })
    insertMock.mockResolvedValue({ error: null })

    // UPDATE ... RETURNING transaction_id: one matched row unless a test
    // says otherwise.
    selectAfterUpdateMock.mockResolvedValue({
      data: [{ transaction_id: 'tx-99' }],
      error: null,
    })
    eqForUpdateIdMock.mockReturnValue({ select: selectAfterUpdateMock })
    inForUpdateMock.mockReturnValue({ select: selectAfterUpdateMock })
    eqForUpdateMock.mockReturnValue({
      eq: eqForUpdateIdMock,
      in: inForUpdateMock,
    })
    updateMock.mockReturnValue({ eq: eqForUpdateMock })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'transactions') {
        throw new Error('unexpected table')
      }
      return {
        select: selectMock,
        upsert: upsertMock,
        insert: insertMock,
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
    table.rows = Array.from({ length: 1053 }, (_, i) => makeRow(i))

    const { loadUserTransactions } = await import('./transactions')
    const transactions = await loadUserTransactions(session)

    expect(transactions).toHaveLength(1053)
    expect(new Set(transactions.map((tx) => tx.id)).size).toBe(1053)
  })

  it('still loads everything when the server cap is below the page size', async () => {
    table.maxRows = 300
    table.rows = Array.from({ length: 700 }, (_, i) => makeRow(i))

    const { loadUserTransactions } = await import('./transactions')
    const transactions = await loadUserTransactions(session)

    expect(transactions).toHaveLength(700)
  })

  it('neither skips nor duplicates rows when the table changes mid-load', async () => {
    table.rows = Array.from({ length: 1053 }, (_, i) => makeRow(i))
    table.beforePage = (page) => {
      if (page === 1) {
        // Another device deletes an already-read row and inserts one that
        // sorts before the cursor, between our first and second request.
        table.rows = table.rows.filter((r) => r.transaction_id !== 'tx-0000')
        table.rows.push({ ...makeRow(0), transaction_id: 'tx-0000a' })
      }
    }

    const { loadUserTransactions } = await import('./transactions')
    const ids = (await loadUserTransactions(session)).map((tx) => tx.id)

    expect(new Set(ids).size).toBe(ids.length)
    for (let i = 1; i < 1053; i++) {
      expect(ids).toContain(`tx-${String(i).padStart(4, '0')}`)
    }
  })

  it('throws when any page fails instead of returning a partial list', async () => {
    table.rows = Array.from({ length: 1500 }, (_, i) => makeRow(i))
    table.failOnPage = 1

    const { loadUserTransactions } = await import('./transactions')
    await expect(loadUserTransactions(session)).rejects.toThrow('timeout')
  })

  it('inserts imported transactions with user ownership', async () => {
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

    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock.mock.calls[0][0][0]).toMatchObject({
      user_id: 'user-1',
      transaction_id: 'tx-99',
      tags: ['coffee', 'work'],
    })
  })

  it('never overwrites a stored row: an id already taken fails the import', async () => {
    // An upsert would silently replace another transaction's content (or
    // give a deleted row new content) if a taken id ever slipped through.
    insertMock.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value' },
    })
    const { persistTransactions } = await import('./transactions')

    await expect(
      persistTransactions(session, [
        {
          id: 'tx-taken',
          date: new Date('2026-02-03T00:00:00.000Z'),
          description: 'Supermercado',
          amount: 200,
          currency: 'UYU',
          type: 'debit',
          source: 'credit_card',
          rawData: {},
        },
      ])
    ).rejects.toThrow(/ya estaban guardadas/)
    expect(upsertMock).not.toHaveBeenCalled()
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

  it('reports a soft delete that matched no row instead of succeeding', async () => {
    selectAfterUpdateMock.mockResolvedValue({ data: [], error: null })
    const { softDeleteTransaction } = await import('./transactions')

    await expect(softDeleteTransaction(session, 'tx-gone')).rejects.toThrow(
      /ya no existe/
    )
  })

  it('restores soft-deleted transactions in one request', async () => {
    selectAfterUpdateMock.mockResolvedValue({
      data: [{ transaction_id: 'tx-1' }, { transaction_id: 'tx-2' }],
      error: null,
    })
    const { restoreTransactions } = await import('./transactions')
    await restoreTransactions(session, ['tx-1', 'tx-2'])

    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock).toHaveBeenCalledWith({
      is_deleted: false,
      deleted_at: null,
    })
    expect(eqForUpdateMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(inForUpdateMock).toHaveBeenCalledWith('transaction_id', [
      'tx-1',
      'tx-2',
    ])
  })

  it('fails a restore when not every row came back', async () => {
    selectAfterUpdateMock.mockResolvedValue({
      data: [{ transaction_id: 'tx-1' }],
      error: null,
    })
    const { restoreTransactions } = await import('./transactions')

    await expect(
      restoreTransactions(session, ['tx-1', 'tx-2'])
    ).rejects.toThrow(/No se pudieron restaurar/)
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

  it('reports an update that matched no row instead of succeeding', async () => {
    selectAfterUpdateMock.mockResolvedValue({ data: [], error: null })
    const { updateTransaction } = await import('./transactions')

    await expect(
      updateTransaction(session, 'tx-gone', { category: 'food' })
    ).rejects.toThrow(/ya no existe/)
  })

  it('does not issue update when no fields are provided', async () => {
    const { updateTransaction } = await import('./transactions')
    await updateTransaction(session, 'tx-99', {})

    expect(updateMock).not.toHaveBeenCalled()
  })

  describe('findExistingTransactionIds', () => {
    it('splits existing ids into active and deleted, in chunks', async () => {
      const inMock = vi.fn(async (_col: string, chunk: string[]) => ({
        data: chunk
          .filter((id) => id !== 'new')
          .map((id) => ({
            transaction_id: id,
            is_deleted: id.startsWith('gone'),
          })),
        error: null,
      }))
      fromMock.mockImplementation(() => ({
        select: () => ({ eq: () => ({ in: inMock }) }),
      }))
      const ids = [
        'new',
        'gone-1',
        ...Array.from({ length: 250 }, (_, i) => `kept-${i}`),
      ]

      const { findExistingTransactionIds } = await import('./transactions')
      const result = await findExistingTransactionIds(session, ids)

      expect(inMock).toHaveBeenCalledTimes(2)
      expect([...result.deleted]).toEqual(['gone-1'])
      expect(result.active.size).toBe(250)
      expect(result.active.has('new')).toBe(false)
    })

    it('throws when the lookup fails', async () => {
      fromMock.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            in: async () => ({ data: null, error: { message: 'timeout' } }),
          }),
        }),
      }))
      const { findExistingTransactionIds } = await import('./transactions')
      await expect(findExistingTransactionIds(session, ['a'])).rejects.toThrow(
        'timeout'
      )
    })
  })
})

// A chainable stand-in for a PostgREST select that applies the filters it is
// given to `rows` and caps each response at `maxRows`, as the server does.
function installQueryableTable(rows: FakeRow[], maxRows = 1000) {
  fromMock.mockImplementation(() => ({
    select: () => {
      const filters: Array<[string, string, unknown]> = []
      let limit = Infinity
      const run = () => {
        let data = [...rows]
        for (const [op, col, value] of filters) {
          data = data.filter((row) => {
            const v = row[col] as string
            if (op === 'eq') return v === value
            if (op === 'is') return (v ?? null) === value
            if (op === 'in') return (value as unknown[]).includes(v)
            if (op === 'gt') return v > (value as string)
            if (op === 'gte') return v >= (value as string)
            if (op === 'lte') return v <= (value as string)
            return true
          })
        }
        data.sort((a, b) => a.transaction_id.localeCompare(b.transaction_id))
        return { data: data.slice(0, Math.min(limit, maxRows)), error: null }
      }
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => void) => resolve(run()),
        order: () => builder,
        limit: (n: number) => {
          limit = n
          return builder
        },
      }
      for (const op of ['eq', 'is', 'in', 'gt', 'gte', 'lte']) {
        builder[op] = (col: string, value: unknown) => {
          filters.push([op, col, value])
          return builder
        }
      }
      return builder
    },
  }))
}

describe('findImportCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const incoming = (id: string, date: string) => ({
    id,
    date: new Date(date),
    description: 'Compra',
    amount: 100,
    currency: 'UYU' as const,
    type: 'debit' as const,
    source: 'bank_account' as const,
    rawData: { fecha: '01/02/2026' },
  })

  function row(id: string, overrides: Partial<FakeRow> = {}): FakeRow {
    return {
      ...makeRow(0),
      transaction_id: id,
      date: '2026-02-01T03:00:00.000Z',
      raw_data: { fecha: '01/02/2026' },
      is_deleted: false,
      split_parent_id: null,
      ...overrides,
    }
  }

  it('returns live and deleted rows around the file dates, with their content', async () => {
    installQueryableTable([
      row('live'),
      row('gone', {
        date: '2026-02-02T03:00:00.000Z',
        is_deleted: true,
        deleted_at: '2026-03-01T00:00:00.000Z',
      }),
      row('long-ago', { date: '2025-06-01T03:00:00.000Z' }),
      row('other-user', { user_id: 'user-2' }),
      row('card', { source: 'credit_card' }),
    ])

    const { findImportCandidates } = await import('./transactions')
    const found = await findImportCandidates(session, [
      incoming('new', '2026-02-01T03:00:00.000Z'),
    ])

    const byId = new Map(found.map((r) => [r.tx.id, r]))
    expect([...byId.keys()].sort()).toEqual(['gone', 'live'])
    expect(byId.get('gone')?.deleted).toBe(true)
    expect(byId.get('live')?.deleted).toBe(false)
    expect(byId.get('live')?.tx.rawData).toEqual({ fecha: '01/02/2026' })
  })

  it('reads every row in the window past the server row cap', async () => {
    installQueryableTable(
      Array.from({ length: 1053 }, (_, i) =>
        row(`tx-${String(i).padStart(4, '0')}`, { is_deleted: i % 2 === 0 })
      ),
      300
    )

    const { findImportCandidates } = await import('./transactions')
    const found = await findImportCandidates(session, [
      incoming('new', '2026-02-01T00:00:00.000Z'),
    ])

    expect(found).toHaveLength(1053)
    expect(found.filter((r) => r.deleted)).toHaveLength(527)
  })

  it('also returns a row holding an incoming id outside the window', async () => {
    installQueryableTable([
      row('same-id', { date: '2020-01-01T03:00:00.000Z' }),
    ])

    const { findImportCandidates } = await import('./transactions')
    const found = await findImportCandidates(session, [
      incoming('same-id', '2026-02-01T03:00:00.000Z'),
    ])

    expect(found.map((r) => r.tx.id)).toEqual(['same-id'])
  })

  it('leaves split parts out of the window', async () => {
    installQueryableTable([
      row('p', { is_split_parent: true }),
      row('p_split_0', { split_parent_id: 'p', raw_data: {} }),
    ])

    const { findImportCandidates } = await import('./transactions')
    const found = await findImportCandidates(session, [
      incoming('new', '2026-02-01T00:00:00.000Z'),
    ])

    expect(found.map((r) => r.tx.id)).toEqual(['p'])
  })

  it('returns nothing without querying for an empty import', async () => {
    const { findImportCandidates } = await import('./transactions')
    expect(await findImportCandidates(session, [])).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })
})
