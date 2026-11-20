import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { resolveCategory } from '../categories/category-registry'
import { categorySplitLine, findCategorySplits } from './category-splits'
import { findSimilarTransactions } from './similar-transactions'

const tx = (
  id: string,
  description: string,
  category: string | null | undefined,
  extra: Partial<Transaction> = {}
): Transaction => ({
  id,
  date: new Date('2026-03-10T00:00:00.000Z'),
  description,
  amount: 100,
  currency: 'UYU',
  type: 'debit',
  source: 'credit_card',
  rawData: {},
  ...(category === undefined ? {} : { category: category as string }),
  ...extra,
})

const label = (id: string) => resolveCategory(id).label

describe('findCategorySplits', () => {
  it('gives every row of a split merchant an entry naming the others', () => {
    const splits = findCategorySplits([
      tx('a', 'Devoto Supermercado', 'groceries'),
      tx('b', 'Devoto Supermercado', 'groceries'),
      tx('c', 'Devoto Supermercado', 'restaurants'),
    ])
    expect(splits.get('a')).toEqual({
      others: 1,
      categories: [{ category: 'restaurants', count: 1 }],
    })
    expect(splits.get('b')).toEqual(splits.get('a'))
    expect(splits.get('c')).toEqual({
      others: 2,
      categories: [{ category: 'groceries', count: 2 }],
    })
  })

  it('is empty when every row is in one category', () => {
    expect(
      findCategorySplits([
        tx('a', 'Devoto', 'groceries'),
        tx('b', 'Devoto', 'groceries'),
      ]).size
    ).toBe(0)
  })

  it('groups descriptions that differ only by a date or long number', () => {
    const splits = findCategorySplits([
      tx('a', 'DEVOTO 10/03/2026', 'groceries'),
      tx('b', 'DEVOTO 11/03/2026', 'restaurants'),
      tx('c', 'TIENDA INGLESA', 'transport'),
    ])
    expect([...splits.keys()].sort()).toEqual(['a', 'b'])
  })

  it('ignores uncategorized rows: no entry, and they do not split others', () => {
    expect(
      findCategorySplits([
        tx('a', 'Devoto', 'groceries'),
        tx('b', 'Devoto', 'groceries'),
        tx('c', 'Devoto', null),
        tx('d', 'Devoto', ''),
        tx('e', 'Devoto', 'uncategorized'),
        tx('f', 'Devoto', undefined),
      ]).size
    ).toBe(0)
  })

  it('leaves split parts and split parents out', () => {
    expect(
      findCategorySplits([
        tx('a', 'Devoto', 'groceries'),
        tx('p', 'Devoto', 'restaurants', { isSplitParent: true }),
        tx('p_split_0', 'Devoto', 'transport', { splitParentId: 'p' }),
      ]).size
    ).toBe(0)
  })

  it('leaves transfer rows out', () => {
    const desc = 'credito por operacion en supernet'
    expect(
      findCategorySplits([
        tx('a', desc, 'internal_transfer'),
        tx('b', desc, 'income'),
      ]).size
    ).toBe(0)
    expect(
      findCategorySplits([
        tx('a', desc, 'external_transfer'),
        tx('b', desc, 'income'),
      ]).size
    ).toBe(0)
    expect(
      findCategorySplits([
        tx('a', 'Devoto', 'groceries'),
        tx('b', 'Devoto', 'groceries'),
        tx('c', 'Devoto', 'internal_transfer'),
      ]).size
    ).toBe(0)
  })

  it('does not care about confidence', () => {
    const splits = findCategorySplits([
      tx('a', 'Devoto', 'groceries', { categoryConfidence: 1 }),
      tx('b', 'Devoto', 'restaurants', { categoryConfidence: 0.5 }),
    ])
    expect(splits.size).toBe(2)
  })

  it('treats an alias and its canonical id as one category', () => {
    expect(
      findCategorySplits([
        tx('a', 'Devoto', 'restaurant'),
        tx('b', 'Devoto', 'restaurants'),
      ]).size
    ).toBe(0)
  })

  it('lists several other categories, most rows first', () => {
    const splits = findCategorySplits([
      tx('a', 'Devoto', 'groceries'),
      tx('b', 'Devoto', 'restaurants'),
      tx('c', 'Devoto', 'restaurants'),
      tx('d', 'Devoto', 'transport'),
    ])
    expect(splits.get('a')).toEqual({
      others: 3,
      categories: [
        { category: 'restaurants', count: 2 },
        { category: 'transport', count: 1 },
      ],
    })
  })

  it('only counts rows that findSimilarTransactions reaches', () => {
    const all = [
      tx('a', 'Devoto 10/03/2026', 'groceries'),
      tx('b', 'Devoto', 'restaurants'),
      tx('c', 'Devoto', 'groceries'),
      tx('d', 'Otro', 'transport'),
      tx('e', 'Otro', 'transport'),
      tx('p', 'Devoto', 'transport', { isSplitParent: true }),
      tx('p_split_0', 'Devoto', 'fees', { splitParentId: 'p' }),
    ]
    const splits = findCategorySplits(all)
    expect(splits.size).toBeGreaterThan(0)
    for (const [id, split] of splits) {
      const row = all.find((t) => t.id === id)!
      const similar = findSimilarTransactions(all, row)
      const counted = split.categories.reduce((n, c) => n + c.count, 0)
      expect(counted).toBe(split.others)
      expect(similar.length).toBeGreaterThanOrEqual(split.others + 1)
    }
  })
})

describe('categorySplitLine', () => {
  it('says where one other row is', () => {
    expect(
      categorySplitLine(
        { others: 1, categories: [{ category: 'restaurants', count: 1 }] },
        'Devoto'
      )
    ).toBe(`Otra de Devoto está en ${label('restaurants')}`)
  })

  it('counts several rows in one category', () => {
    expect(
      categorySplitLine(
        { others: 2, categories: [{ category: 'groceries', count: 2 }] },
        'Devoto'
      )
    ).toBe(`Otras 2 de Devoto están en ${label('groceries')}`)
  })

  it('joins two categories with y', () => {
    expect(
      categorySplitLine(
        {
          others: 3,
          categories: [
            { category: 'restaurants', count: 2 },
            { category: 'transport', count: 1 },
          ],
        },
        'Devoto'
      )
    ).toBe(
      `Otras 3 de Devoto están en ${label('restaurants')} (2) y ${label('transport')} (1)`
    )
  })

  it('comma-joins three or more categories', () => {
    expect(
      categorySplitLine(
        {
          others: 4,
          categories: [
            { category: 'restaurants', count: 2 },
            { category: 'transport', count: 1 },
            { category: 'fees', count: 1 },
          ],
        },
        'Devoto'
      )
    ).toBe(
      `Otras 4 de Devoto están en ${label('restaurants')} (2), ${label('transport')} (1) y ${label('fees')} (1)`
    )
  })
})
