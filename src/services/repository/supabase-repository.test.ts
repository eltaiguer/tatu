import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../models'
import type { SupabaseSession } from '../supabase/client'
import { createFakePostgrest } from '../../test/fake-postgrest'
import { SplitIncompleteError, UnsplitIncompleteError } from './repository'

const fake = vi.hoisted(() => ({
  current: null as null | ReturnType<
    typeof import('../../test/fake-postgrest').createFakePostgrest
  >,
}))

vi.mock('../supabase/client', () => ({
  getSupabaseClient: () => fake.current!.client,
}))

import { createSupabaseRepository } from './supabase-repository'

const session = { user: { id: 'user-1' } } as SupabaseSession

function row(id: string, extra: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    transaction_id: id,
    date: '2026-03-15T00:00:00.000Z',
    description: 'SUPERMERCADO DISCO',
    display_description: null,
    amount: 1200,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    tags: [],
    category_confidence: 0.8,
    balance: null,
    raw_data: {},
    is_deleted: false,
    is_split_parent: false,
    split_parent_id: null,
    ...extra,
  }
}

function tx(id: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: new Date('2026-03-15T00:00:00.000Z'),
    description: 'SUPERMERCADO DISCO',
    amount: 1200,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    categoryConfidence: 0.8,
    tags: [],
    rawData: {},
    ...extra,
  }
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `tx-${i}`)

let db: ReturnType<typeof createFakePostgrest>
beforeEach(() => {
  db = createFakePostgrest()
  fake.current = db
})

function stored(id: string) {
  return db.rows('transactions').find((r) => r.transaction_id === id)
}

describe('Supabase repository — bulk updates (#60)', () => {
  it('sends a same-value edit as one .in() update per 100 rows, scoped to the user', async () => {
    db.seed(
      'transactions',
      ids(250).map((id) => row(id))
    )
    const repo = createSupabaseRepository(session)

    const outcome = await repo.updateTransactions(
      new Map(
        ids(250).map((id) => [id, { category: 'food', categoryConfidence: 1 }])
      )
    )

    expect(outcome.saved).toHaveLength(250)
    const updates = db.requests.filter((r) => r.op === 'update')
    expect(updates.map((r) => r.in.transaction_id.length)).toEqual([
      100, 100, 50,
    ])
    expect(updates.every((r) => r.eq.user_id === 'user-1')).toBe(true)
    expect(stored('tx-249')).toMatchObject({
      category: 'food',
      category_confidence: 1,
    })
  })

  it('keeps the chunks that saved when one fails, and says which ids failed', async () => {
    db.seed(
      'transactions',
      ids(300).map((id) => row(id))
    )
    db.failWhen(
      (r) => r.op === 'update' && (r.in.transaction_id ?? []).includes('tx-150')
    )
    const repo = createSupabaseRepository(session)

    const outcome = await repo.updateTransactions(
      new Map(ids(300).map((id) => [id, { category: 'food' }]))
    )

    expect(outcome.saved).toHaveLength(200)
    expect(outcome.failed).toEqual(ids(300).slice(100, 200))
    expect(stored('tx-150')?.category).toBe('groceries')
    expect(stored('tx-250')?.category).toBe('food')
  })

  it('reports a row deleted elsewhere as missing, not failed', async () => {
    db.seed('transactions', [row('tx-1')])
    const repo = createSupabaseRepository(session)

    const outcome = await repo.updateTransactions(
      new Map([
        ['tx-1', { tags: ['a'] }],
        ['tx-gone', { tags: ['a'] }],
      ])
    )

    expect(outcome).toMatchObject({
      saved: ['tx-1'],
      failed: [],
      missing: ['tx-gone'],
    })
  })

  it('clears a field for null and leaves it alone when the key is absent', async () => {
    db.seed('transactions', [
      row('tx-1', { display_description: 'Disco', category: 'groceries' }),
    ])
    const repo = createSupabaseRepository(session)

    await repo.updateTransactions(
      new Map([['tx-1', { displayDescription: null, tags: ['x'] }]])
    )

    expect(stored('tx-1')).toMatchObject({
      display_description: null,
      category: 'groceries',
      tags: ['x'],
    })
  })

  it('groups rows by patch: one request per distinct value', async () => {
    db.seed(
      'transactions',
      ids(4).map((id) => row(id))
    )
    const repo = createSupabaseRepository(session)

    await repo.updateTransactions(
      new Map([
        ['tx-0', { category: 'food', categoryConfidence: 0.9 }],
        ['tx-1', { category: 'food', categoryConfidence: 0.9 }],
        ['tx-2', { category: 'fees', categoryConfidence: 0.95 }],
        ['tx-3', { category: 'food', categoryConfidence: 0.9 }],
      ])
    )

    expect(db.requests.filter((r) => r.op === 'update')).toHaveLength(2)
  })

  it('soft-deletes and restores in chunks, reporting what it changed', async () => {
    db.seed(
      'transactions',
      ids(120).map((id) => row(id))
    )
    const repo = createSupabaseRepository(session)

    const deleted = await repo.softDeleteTransactions(ids(120))
    expect(deleted.saved).toHaveLength(120)
    expect(stored('tx-5')?.is_deleted).toBe(true)

    const restored = await repo.restoreTransactions(['tx-5'])
    expect(restored.saved).toEqual(['tx-5'])
    expect(stored('tx-5')).toMatchObject({
      is_deleted: false,
      deleted_at: null,
    })
  })
})

describe('Supabase repository — imports (#61)', () => {
  it('inserts in sequential 500-row chunks and stops at the first failure', async () => {
    let inserts = 0
    db.failWhen(
      (r) => r.table === 'transactions' && r.op === 'insert' && ++inserts === 2
    )
    const repo = createSupabaseRepository(session)

    const { saved, error } = await repo.insertTransactions(
      ids(1200).map((id) => tx(id)),
      { importId: 'run-1' }
    )

    expect(saved.map((t) => t.id)).toEqual(ids(500))
    expect(error).toBeDefined()
    expect(db.rows('transactions')).toHaveLength(500)
    expect(db.requests.filter((r) => r.op === 'insert')).toHaveLength(2)
    expect(stored('tx-0')).toMatchObject({
      import_id: 'run-1',
      user_id: 'user-1',
    })
  })

  it('never overwrites a stored row: a taken id fails its chunk', async () => {
    db.seed('transactions', [row('tx-1', { category: 'travel' })])
    const repo = createSupabaseRepository(session)

    const { saved, error } = await repo.insertTransactions([tx('tx-1')])

    expect(saved).toEqual([])
    expect((error as Error).message).toMatch(/ya estaban guardadas/)
    expect(stored('tx-1')?.category).toBe('travel')
  })
})

describe('Supabase repository — split and unsplit (#60)', () => {
  const parts = [
    tx('p_split_0', { splitParentId: 'p', amount: 700 }),
    tx('p_split_1', { splitParentId: 'p', amount: 500 }),
  ]

  it('saves the parts, then marks the parent split', async () => {
    db.seed('transactions', [row('p', { category: 'travel' })])
    const repo = createSupabaseRepository(session)

    await repo.splitTransaction(tx('p'), parts)

    expect(stored('p')).toMatchObject({
      is_split_parent: true,
      category: 'travel',
    })
    expect(stored('p_split_0')).toMatchObject({
      split_parent_id: 'p',
      is_deleted: false,
    })
  })

  it('removes the parts again when the parent cannot be marked', async () => {
    db.seed('transactions', [row('p')])
    db.failWhen(
      (r) =>
        r.op === 'update' &&
        r.eq.transaction_id === 'p' &&
        (r.payload as { is_split_parent?: boolean }).is_split_parent === true
    )
    const repo = createSupabaseRepository(session)

    await expect(repo.splitTransaction(tx('p'), parts)).rejects.toThrow()

    expect(stored('p_split_0')).toBeUndefined()
    expect(stored('p')?.is_split_parent).toBe(false)
  })

  it('reports a split it could not undo instead of failing silently', async () => {
    db.seed('transactions', [row('p')])
    db.failWhen((r) => r.op === 'update' || r.op === 'delete')
    const repo = createSupabaseRepository(session)

    await expect(repo.splitTransaction(tx('p'), parts)).rejects.toBeInstanceOf(
      SplitIncompleteError
    )
  })

  it('refuses to split a parent already split elsewhere, leaving its parts alone', async () => {
    db.seed('transactions', [
      row('p', { is_split_parent: true }),
      row('p_split_0', { split_parent_id: 'p', amount: 1000 }),
      row('p_split_1', { split_parent_id: 'p', amount: 200 }),
    ])
    const repo = createSupabaseRepository(session)

    await expect(repo.splitTransaction(tx('p'), [parts[0]])).rejects.toThrow(
      /Recargá/
    )
    // The part it wrote is removed; the other device's second part stays.
    expect(stored('p_split_1')).toBeDefined()
    expect(stored('p')?.is_split_parent).toBe(true)
  })

  it('unsplits by unmarking the parent and deleting every part pointing at it', async () => {
    db.seed('transactions', [
      row('p', { is_split_parent: true }),
      row('p_split_0', { split_parent_id: 'p' }),
      row('p_split_9', { split_parent_id: 'p' }), // not in this device's store
    ])
    const repo = createSupabaseRepository(session)

    await repo.unsplitTransaction(tx('p', { isSplitParent: true }))

    expect(stored('p')?.is_split_parent).toBe(false)
    expect(db.rows('transactions').map((r) => r.transaction_id)).toEqual(['p'])
  })

  it('marks the parent again when the parts cannot be deleted', async () => {
    db.seed('transactions', [
      row('p', { is_split_parent: true }),
      row('p_split_0', { split_parent_id: 'p' }),
    ])
    db.failWhen((r) => r.op === 'delete')
    const repo = createSupabaseRepository(session)

    await expect(
      repo.unsplitTransaction(tx('p', { isSplitParent: true }))
    ).rejects.toThrow()
    expect(stored('p')?.is_split_parent).toBe(true)
  })

  it('reports an unsplit it could not undo', async () => {
    db.seed('transactions', [
      row('p', { is_split_parent: true }),
      row('p_split_0', { split_parent_id: 'p' }),
    ])
    let updates = 0
    db.failWhen(
      (r) => r.op === 'delete' || (r.op === 'update' && ++updates > 1)
    )
    const repo = createSupabaseRepository(session)

    await expect(
      repo.unsplitTransaction(tx('p', { isSplitParent: true }))
    ).rejects.toBeInstanceOf(UnsplitIncompleteError)
  })
})

describe('Supabase repository — workspace', () => {
  it('loads the live rows and the rules of its user', async () => {
    db.seed('transactions', [
      row('tx-1'),
      row('tx-2', { is_deleted: true }),
      row('tx-3', { user_id: 'user-2' }),
    ])
    db.seed('category_overrides', [
      {
        user_id: 'user-1',
        merchant_normalized: 'disco',
        merchant_original: 'DISCO',
        category: 'groceries',
        created_at: '',
        updated_at: '',
      },
    ])
    const repo = createSupabaseRepository(session)

    const snapshot = await repo.loadWorkspace()

    expect(snapshot.transactions.map((t) => t.id)).toEqual(['tx-1'])
    expect(snapshot.categoryOverrides).toHaveLength(1)
    expect(snapshot.preferences).toBeNull()
  })
})
