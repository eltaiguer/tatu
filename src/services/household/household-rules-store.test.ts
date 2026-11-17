import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearHouseholdRules,
  deleteHouseholdRuleWithSync,
  restoreHouseholdRuleWithSync,
  listHouseholdRuleRecords,
  listMerchantHouseholdRules,
  loadHouseholdRules,
  putMerchantHouseholdRule,
} from './household-rules-store'
import type { HouseholdRuleRecord } from '../supabase/household-rules'
import { createInMemoryRepository } from '../repository/in-memory-repository'
import { workspaceStore } from '../../stores/workspace-state'
import { WorkspaceChangedError } from '../../utils/user-error'

function record(
  key: string,
  createdAt: string,
  extra: Partial<HouseholdRuleRecord> = {}
): HouseholdRuleRecord {
  return {
    merchantNormalized: key,
    merchantOriginal: key.toUpperCase(),
    isHousehold: true,
    createdAt,
    updatedAt: createdAt,
    ...extra,
  }
}

describe('household rules store: records', () => {
  beforeEach(() => clearHouseholdRules())
  afterEach(() => clearHouseholdRules())

  it("keeps each rule's name and dates on load", () => {
    const r = record('devoto', '2026-03-01T10:00:00.000Z', {
      merchantOriginal: 'COMPRA DEVOTO 4521',
      updatedAt: '2026-03-05T10:00:00.000Z',
    })
    loadHouseholdRules([r])
    expect(listHouseholdRuleRecords()).toEqual([r])
    expect(listMerchantHouseholdRules().get('devoto')).toBe(true)
  })

  it('lists records newest first, ties by key', () => {
    loadHouseholdRules([
      record('b', '2026-03-01T10:00:00.000Z'),
      record('c', '2026-03-03T10:00:00.000Z'),
      record('a', '2026-03-01T10:00:00.000Z'),
    ])
    expect(listHouseholdRuleRecords().map((r) => r.merchantNormalized)).toEqual(
      ['c', 'a', 'b']
    )
  })

  it('a re-saved rule keeps its createdAt and name, and bumps updatedAt', () => {
    loadHouseholdRules([
      record('devoto', '2026-03-01T10:00:00.000Z', {
        merchantOriginal: 'COMPRA DEVOTO',
      }),
    ])
    putMerchantHouseholdRule('devoto', false)
    const [r] = listHouseholdRuleRecords()
    expect(r.isHousehold).toBe(false)
    expect(r.merchantOriginal).toBe('COMPRA DEVOTO')
    expect(r.createdAt).toBe('2026-03-01T10:00:00.000Z')
    expect(r.updatedAt > r.createdAt).toBe(true)
    expect(listMerchantHouseholdRules().get('devoto')).toBe(false)
  })

  it('a new rule gets the name it was saved with and a creation date', () => {
    putMerchantHouseholdRule('disco', true, 'DISCO 12/03')
    const [r] = listHouseholdRuleRecords()
    expect(r).toMatchObject({
      merchantNormalized: 'disco',
      merchantOriginal: 'DISCO 12/03',
      isHousehold: true,
    })
    expect(r.createdAt).toBe(r.updatedAt)
    expect(Number.isNaN(Date.parse(r.createdAt))).toBe(false)
  })

  it('returns the same array until a write', () => {
    loadHouseholdRules([record('a', '2026-03-01T10:00:00.000Z')])
    const first = listHouseholdRuleRecords()
    expect(listHouseholdRuleRecords()).toBe(first)
    putMerchantHouseholdRule('b', true)
    expect(listHouseholdRuleRecords()).not.toBe(first)
  })
})

describe('household rules store: delete and restore', () => {
  const DEVOTO = record('devoto', '2026-03-01T10:00:00.000Z', {
    merchantOriginal: 'COMPRA DEVOTO 4521',
  })

  function setup() {
    const repo = createInMemoryRepository({ householdRules: [DEVOTO] })
    workspaceStore.setState({ userId: repo.userId, status: 'ready' })
    loadHouseholdRules([DEVOTO])
    return repo
  }

  beforeEach(() => clearHouseholdRules())
  afterEach(() => {
    clearHouseholdRules()
    workspaceStore.setState({ userId: null, status: 'idle' })
  })

  it('delete removes it on the server, then locally, and returns the record', async () => {
    const repo = setup()
    const removed = await deleteHouseholdRuleWithSync(repo, 'devoto')
    expect(removed).toEqual(DEVOTO)
    expect((await repo.loadWorkspace()).householdRules).toEqual([])
    expect(listHouseholdRuleRecords()).toEqual([])
    expect(listMerchantHouseholdRules().has('devoto')).toBe(false)
  })

  it('deleting a key with no rule changes nothing and returns undefined', async () => {
    const repo = setup()
    expect(await deleteHouseholdRuleWithSync(repo, 'nadie')).toBeUndefined()
    expect(repo.requests.deleteHouseholdRule).toBeUndefined()
    expect(listHouseholdRuleRecords()).toEqual([DEVOTO])
  })

  it('a failed delete changes nothing', async () => {
    const repo = setup()
    repo.failOn('deleteHouseholdRule')
    await expect(deleteHouseholdRuleWithSync(repo, 'devoto')).rejects.toThrow()
    expect(listHouseholdRuleRecords()).toEqual([DEVOTO])
    expect((await repo.loadWorkspace()).householdRules).toEqual([DEVOTO])
  })

  it('a user switch mid-delete leaves the store alone', async () => {
    const repo = setup()
    const held = repo.hold('deleteHouseholdRule')
    const pending = deleteHouseholdRuleWithSync(repo, 'devoto')
    workspaceStore.setState({ userId: 'someone-else', status: 'ready' })
    held.release()
    await expect(pending).rejects.toBeInstanceOf(WorkspaceChangedError)
    expect(listHouseholdRuleRecords()).toEqual([DEVOTO])
  })

  it('restore puts back value, name and createdAt, in the same place', async () => {
    const repo = setup()
    putMerchantHouseholdRule('disco', true, 'DISCO')
    const removed = (await deleteHouseholdRuleWithSync(repo, 'devoto'))!
    await restoreHouseholdRuleWithSync(repo, removed)

    expect(listHouseholdRuleRecords().map((r) => r.merchantNormalized)).toEqual(
      ['disco', 'devoto']
    )
    expect(listHouseholdRuleRecords()[1]).toEqual(DEVOTO)
    const [stored] = (await repo.loadWorkspace()).householdRules
    expect(stored).toMatchObject({
      merchantNormalized: 'devoto',
      merchantOriginal: 'COMPRA DEVOTO 4521',
      isHousehold: true,
      createdAt: '2026-03-01T10:00:00.000Z',
    })
  })

  it('a failed restore changes nothing', async () => {
    const repo = setup()
    const removed = (await deleteHouseholdRuleWithSync(repo, 'devoto'))!
    repo.failOn('upsertHouseholdRule')
    await expect(restoreHouseholdRuleWithSync(repo, removed)).rejects.toThrow()
    expect(listHouseholdRuleRecords()).toEqual([])
  })
})
