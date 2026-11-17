import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearHouseholdRules,
  listHouseholdRuleRecords,
  listMerchantHouseholdRules,
  loadHouseholdRules,
  putMerchantHouseholdRule,
} from './household-rules-store'
import type { HouseholdRuleRecord } from '../supabase/household-rules'

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
