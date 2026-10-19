import { describe, expect, it } from 'vitest'
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
