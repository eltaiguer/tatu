import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../models'
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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

    await repo.updateTransactions(
      new Map([['tx-1', { displayDescription: null, tags: ['x'] }]])
    )

    expect(stored('tx-1')).toMatchObject({
      display_description: null,
      category: 'groceries',
      tags: ['x'],
    })
  })

  it('rewrites the description and raw_data of a repaired row (#192)', async () => {
    db.seed('transactions', [
      row('tx-1', {
        description: 'PE�AROL',
        raw_data: { concepto: 'PE�AROL' },
        display_description: 'Club',
      }),
    ])
    const repo = createSupabaseRepository('user-1')

    const outcome = await repo.updateTransactions(
      new Map([
        ['tx-1', { description: 'PEÑAROL', rawData: { concepto: 'PEÑAROL' } }],
      ])
    )

    expect(outcome.saved).toEqual(['tx-1'])
    expect(stored('tx-1')).toMatchObject({
      description: 'PEÑAROL',
      raw_data: { concepto: 'PEÑAROL' },
      display_description: 'Club',
      category: 'groceries',
    })
  })

  it('groups rows by patch: one request per distinct value', async () => {
    db.seed(
      'transactions',
      ids(4).map((id) => row(id))
    )
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

    await expect(repo.splitTransaction(tx('p'), parts)).rejects.toThrow()

    expect(stored('p_split_0')).toBeUndefined()
    expect(stored('p')?.is_split_parent).toBe(false)
  })

  it('reports a split it could not undo instead of failing silently', async () => {
    db.seed('transactions', [row('p')])
    db.failWhen((r) => r.op === 'update' || r.op === 'delete')
    const repo = createSupabaseRepository('user-1')

    await expect(repo.splitTransaction(tx('p'), parts)).rejects.toBeInstanceOf(
      SplitIncompleteError
    )
  })

  it('refuses to split a parent already split on another device, leaving its parts as they were', async () => {
    // Device 1 split p into 1000 + 200; device 2, still showing p unsplit,
    // splits it into 700 + 500. Part ids are deterministic, so both write
    // p_split_0 and p_split_1.
    db.seed('transactions', [
      row('p', { is_split_parent: true }),
      row('p_split_0', { split_parent_id: 'p', amount: 1000 }),
      row('p_split_1', { split_parent_id: 'p', amount: 200 }),
    ])
    const repo = createSupabaseRepository('user-1')

    await expect(repo.splitTransaction(tx('p'), parts)).rejects.toThrow(
      /Recargá/
    )

    expect(stored('p')?.is_split_parent).toBe(true)
    expect(stored('p_split_0')?.amount).toBe(1000)
    expect(stored('p_split_1')?.amount).toBe(200)
  })

  it("never clears another device's split when its own mark fails", async () => {
    db.seed('transactions', [
      row('p', { is_split_parent: true }),
      row('p_split_0', { split_parent_id: 'p', amount: 1000 }),
      row('p_split_1', { split_parent_id: 'p', amount: 200 }),
    ])
    db.failWhen(
      (r) =>
        r.op === 'update' &&
        (r.payload as { is_split_parent?: boolean }).is_split_parent === true
    )
    const repo = createSupabaseRepository('user-1')

    await expect(repo.splitTransaction(tx('p'), parts)).rejects.toThrow()

    expect(stored('p')?.is_split_parent).toBe(true)
    expect(stored('p_split_0')?.amount).toBe(1000)
  })

  it('unsplits by unmarking the parent and deleting every part pointing at it', async () => {
    db.seed('transactions', [
      row('p', { is_split_parent: true }),
      row('p_split_0', { split_parent_id: 'p' }),
      row('p_split_9', { split_parent_id: 'p' }), // not in this device's store
    ])
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

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
    const repo = createSupabaseRepository('user-1')

    const snapshot = await repo.loadWorkspace()

    expect(snapshot.transactions.map((t) => t.id)).toEqual(['tx-1'])
    expect(snapshot.categoryOverrides).toHaveLength(1)
    expect(snapshot.preferences).toBeNull()
  })
})

describe('Supabase repository — transactions only', () => {
  it("reads only the user's live rows from the transactions table", async () => {
    db.seed('transactions', [
      row('tx-1'),
      row('tx-2', { is_deleted: true }),
      row('tx-3', { user_id: 'user-2' }),
    ])
    const repo = createSupabaseRepository('user-1')

    const rows = await repo.loadTransactions()

    expect(rows.map((t) => t.id)).toEqual(['tx-1'])
    expect(new Set(db.requests.map((r) => r.table))).toEqual(
      new Set(['transactions'])
    )
  })
})

describe('Supabase repository — merchant overrides only', () => {
  it("reads only the user's category overrides", async () => {
    db.seed('category_overrides', [
      {
        user_id: 'user-1',
        merchant_normalized: 'disco',
        merchant_original: 'DISCO',
        category: 'groceries',
        created_at: '',
        updated_at: '',
      },
      {
        user_id: 'user-2',
        merchant_normalized: 'tienda',
        merchant_original: 'TIENDA',
        category: 'groceries',
        created_at: '',
        updated_at: '',
      },
    ])
    const repo = createSupabaseRepository('user-1')

    const overrides = await repo.loadCategoryOverrides()

    expect(overrides.map((o) => o.merchantNormalized)).toEqual(['disco'])
    expect(db.requests.map((r) => r.table)).toEqual(['category_overrides'])
  })
})

describe('Supabase repository — insights cache', () => {
  it('reads no cache as null, and reads back what it saved', async () => {
    const repo = createSupabaseRepository('user-1')
    expect(await repo.loadInsights()).toBeNull()

    await repo.saveInsights({
      inputHash: 'h1',
      model: 'm',
      insights: { insights: [] },
    })
    db.rows('ai_insights')[0].generated_at = '2026-06-30T12:00:00.000Z'

    expect(await repo.loadInsights()).toEqual({
      inputHash: 'h1',
      model: 'm',
      insights: { insights: [] },
      generatedAt: '2026-06-30T12:00:00.000Z',
    })
    expect(db.rows('ai_insights')).toHaveLength(1)
  })
})

describe('Supabase repository — reset all data', () => {
  const RESET_TABLES = [
    'transactions',
    'import_runs',
    'category_overrides',
    'description_overrides',
    'custom_categories',
    'custom_patterns',
    'user_preferences',
    'ai_insights',
  ]

  it("deletes the user's rows from every table, and nobody else's", async () => {
    db.seed('transactions', [row('tx-1'), row('tx-2', { user_id: 'user-2' })])
    db.seed('user_preferences', [{ user_id: 'user-1' }, { user_id: 'user-2' }])
    const repo = createSupabaseRepository('user-1')

    await repo.resetAll()

    const deletes = db.requests.filter((r) => r.op === 'delete')
    expect(deletes.map((r) => r.table)).toEqual(RESET_TABLES)
    expect(deletes.every((r) => r.eq.user_id === 'user-1')).toBe(true)
    expect(db.rows('transactions').map((r) => r.user_id)).toEqual(['user-2'])
    expect(db.rows('user_preferences')).toEqual([{ user_id: 'user-2' }])
  })

  it('stops at the first table that fails', async () => {
    db.failWhen((r) => r.op === 'delete' && r.table === 'custom_categories')
    const repo = createSupabaseRepository('user-1')

    await expect(repo.resetAll()).rejects.toThrow('request failed')

    const deletes = db.requests.filter((r) => r.op === 'delete')
    expect(deletes.map((r) => r.table)).toEqual(RESET_TABLES.slice(0, 5))
  })

  it('still succeeds when the insights table is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.failWhen((r) => r.table === 'ai_insights', { code: '42P01' })
    const repo = createSupabaseRepository('user-1')

    await expect(repo.resetAll()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
