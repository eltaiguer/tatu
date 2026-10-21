import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../models'
import { createInMemoryRepository } from './in-memory-repository'

const tx = (id: string): Transaction => ({
  id,
  date: new Date('2026-03-15T00:00:00Z'),
  description: 'DISCO',
  amount: 100,
  currency: 'UYU',
  type: 'debit',
  source: 'bank_account',
  category: 'groceries',
  rawData: {},
})

// The in-memory adapter stands in for Supabase in every mutation test, so it
// must refuse what RLS + `.eq('user_id')` refuse there.
describe('in-memory repository fidelity', () => {
  it("changes nothing when the client sends another user's token", async () => {
    const repo = createInMemoryRepository({ transactions: [tx('a')] })
    repo.actingUserId = 'someone-else'

    const update = await repo.updateTransactions(
      new Map([['a', { category: 'food' }]])
    )
    const insert = await repo.insertTransactions([tx('b')])

    expect(update).toMatchObject({ saved: [], missing: ['a'] })
    expect(insert.saved).toEqual([])
    expect(repo.row('a')?.category).toBe('groceries')
    expect(repo.has('b')).toBe(false)
  })

  it("reads nothing under another user's token, as RLS filters it", async () => {
    const repo = createInMemoryRepository({
      transactions: [tx('a')],
      preferences: {
        theme: 'dark',
        currency: 'UYU',
        fxRate: 41,
        claudeApiKey: 'sk',
        aiEnabled: true,
        aiModel: 'm',
      },
    })
    repo.actingUserId = 'someone-else'

    expect(await repo.loadWorkspace()).toEqual({
      transactions: [],
      categoryOverrides: [],
      descriptionOverrides: [],
      customPatterns: [],
      customCategories: [],
      preferences: null,
    })
    expect(repo.requests.load).toBe(1)
  })

  it("resets nothing under another user's token, but still sends every request", async () => {
    const repo = createInMemoryRepository({ transactions: [tx('a')] })
    repo.actingUserId = 'someone-else'

    await repo.resetAll()

    expect(repo.has('a')).toBe(true)
    expect(repo.requests.resetAll).toBe(8)

    repo.failOn('resetAll', { when: ([table]) => table === 'transactions' })
    await expect(repo.resetAll()).rejects.toThrow('resetAll failed')
  })

  it('never shares row objects with the caller', async () => {
    const repo = createInMemoryRepository({ transactions: [tx('a')] })

    repo.rows()[0].category = 'mutated'

    expect(repo.row('a')?.category).toBe('groceries')
  })

  it('loads the import run that inserted each row, as Supabase does', async () => {
    const repo = createInMemoryRepository()

    await repo.insertTransactions([tx('a')], { importId: 'run-1' })
    await repo.insertTransactions([tx('b')])
    const { transactions } = await repo.loadWorkspace()

    expect(transactions.find((t) => t.id === 'a')?.importId).toBe('run-1')
    expect(transactions.find((t) => t.id === 'b')?.importId).toBeUndefined()
  })
})

describe('in-memory repository — transactions only', () => {
  it('reads the live rows, as stored, in one request', async () => {
    const repo = createInMemoryRepository({
      transactions: [tx('a')],
      deleted: [tx('b')],
    })

    const rows = await repo.loadTransactions()

    expect(rows.map((t) => t.id)).toEqual(['a'])
    expect(repo.requests).toEqual({ loadTransactions: 1 })
  })

  it('hands out copies, as loadWorkspace does', async () => {
    const repo = createInMemoryRepository({ transactions: [tx('a')] })

    const [row] = await repo.loadTransactions()
    row.category = 'mutated'
    row.date.setUTCFullYear(1999)

    expect(repo.row('a')?.category).toBe('groceries')
    expect(repo.row('a')?.date.getUTCFullYear()).toBe(2026)
  })
})

describe('in-memory repository — insights cache', () => {
  it('has no cached insights until some are saved, then reads them back', async () => {
    const repo = createInMemoryRepository()
    expect(await repo.loadInsights()).toBeNull()

    await repo.saveInsights({
      inputHash: 'h1',
      model: 'm',
      insights: { insights: [] },
    })

    expect(await repo.loadInsights()).toMatchObject({
      inputHash: 'h1',
      model: 'm',
      insights: { insights: [] },
      generatedAt: expect.any(String),
    })
  })
})

describe('in-memory repository — reset all data', () => {
  function seeded() {
    return createInMemoryRepository({
      transactions: [tx('a')],
      deleted: [tx('b')],
      categoryOverrides: [
        {
          merchantNormalized: 'disco',
          category: 'groceries',
          createdAt: '',
          updatedAt: '',
        },
      ],
      customCategories: [
        {
          id: 'mine',
          label: 'Mía',
          color: '#f00',
          isIgnored: false,
          isArchived: false,
          createdAt: '',
          updatedAt: '',
        },
      ],
      preferences: {
        theme: 'dark',
        currency: 'UYU',
        fxRate: 41,
        claudeApiKey: 'sk',
        aiEnabled: true,
        aiModel: 'm',
      },
    })
  }

  it('deletes everything the user has stored', async () => {
    const repo = seeded()
    await repo.saveInsights({
      inputHash: 'h',
      model: 'm',
      insights: { insights: [] },
    })

    await repo.resetAll()

    expect(repo.has('a') || repo.has('b')).toBe(false)
    expect(await repo.loadWorkspace()).toMatchObject({
      transactions: [],
      categoryOverrides: [],
      customCategories: [],
      preferences: null,
    })
    expect(await repo.loadInsights()).toBeNull()
  })

  it('stops at the first table that fails, keeping what it did not reach', async () => {
    const repo = seeded()
    repo.failOn('resetAll', {
      when: ([table]) => table === 'custom_categories',
    })

    await expect(repo.resetAll()).rejects.toThrow('resetAll failed')

    expect(repo.has('a')).toBe(false)
    expect(repo.categoryOverrides.size).toBe(0)
    expect(repo.customCategories.size).toBe(1)
    expect(repo.preferences).not.toBeNull()
  })

  it('still succeeds when only the insights cache cannot be cleared', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo = seeded()
    repo.failOn('resetAll', { when: ([table]) => table === 'ai_insights' })

    await expect(repo.resetAll()).resolves.toBeUndefined()

    expect(repo.preferences).toBeNull()
    expect(warn).toHaveBeenCalled()
  })
})
