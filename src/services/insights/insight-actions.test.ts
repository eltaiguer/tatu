import { describe, expect, it } from 'vitest'
import { Category } from '../../models'
import type { Transaction } from '../../models'
import { householdRulesOf } from '../../test/household-rules'
import { merchantOverrideKey } from '../categorizer/category-overrides'
import { householdMarkedToast } from '../household/household-copy'
import { merchantKeyOf, merchantLabelFor } from '../merchants/merchant-key'
import {
  buildInsightActionIndex,
  insightActions,
  type InsightActionContext,
} from './insight-actions'
import type { Insight } from './insight-generator'

let seq = 0
function tx(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    date: new Date('2026-03-01T00:00:00.000Z'),
    description: 'NETFLIX.COM',
    amount: 10,
    currency: 'USD',
    type: 'debit',
    source: 'credit_card',
    category: Category.Restaurants,
    rawData: {},
    ...overrides,
  }
}

function insight(overrides: Partial<Insight> = {}): Insight {
  return {
    type: 'bleeding_money',
    title: 'T',
    narrative: 'N',
    currency: 'USD',
    severity: 'high',
    ...overrides,
  }
}

function actionsFor(
  card: Insight,
  rows: Transaction[],
  ctx: Partial<InsightActionContext> = {}
) {
  return insightActions(
    card,
    buildInsightActionIndex({
      rows,
      all: rows,
      householdMode: false,
      householdRules: householdRulesOf(),
      homeCurrency: 'USD',
      fxRate: 40,
      ...ctx,
    })
  )
}

const netflix = [
  tx({ id: 'n1', date: new Date('2026-01-05T00:00:00.000Z') }),
  tx({ id: 'n2', date: new Date('2026-02-05T00:00:00.000Z') }),
  tx({ id: 'n3', date: new Date('2026-03-05T00:00:00.000Z') }),
]
const netflixKey = merchantKeyOf(netflix[0])
const netflixLabel = merchantLabelFor(netflix)

describe('insightActions: the drill', () => {
  it('links a category-only insight by its category', () => {
    const { drill } = actionsFor(
      insight({ category: Category.Restaurants }),
      netflix
    )
    expect(drill).toEqual({
      label: 'Ver transacciones →',
      filter: { category: Category.Restaurants },
    })
  })

  it('keeps a category drill inside the house in Hogar mode', () => {
    const { drill } = actionsFor(
      insight({ category: Category.Restaurants }),
      netflix,
      { householdMode: true }
    )
    expect(drill?.filter).toEqual({
      category: Category.Restaurants,
      household: 'household',
    })
  })

  it('links a merchant-only insight by the exact merchant key, debits only', () => {
    const { drill } = actionsFor(insight({ merchant: netflixLabel }), netflix)
    expect(drill).toEqual({
      label: 'Ver transacciones →',
      filter: { merchant: netflixKey, type: 'debit' },
    })
  })

  it('resolves a label that differs only in case and accents', () => {
    const { drill } = actionsFor(
      insight({ merchant: netflixLabel.toLowerCase() }),
      netflix
    )
    expect(drill?.filter).toEqual({ merchant: netflixKey, type: 'debit' })
  })

  it('combines category and merchant', () => {
    const { drill } = actionsFor(
      insight({ category: Category.Restaurants, merchant: netflixLabel }),
      netflix
    )
    expect(drill?.filter).toEqual({
      category: Category.Restaurants,
      merchant: netflixKey,
      type: 'debit',
    })
  })

  it('drops an unknown merchant: category-only link, or no link', () => {
    const withCategory = actionsFor(
      insight({ category: Category.Restaurants, merchant: 'Nadie' }),
      netflix
    )
    expect(withCategory.drill?.filter).toEqual({
      category: Category.Restaurants,
    })
    expect(actionsFor(insight({ merchant: 'Nadie' }), netflix).drill).toBeNull()
  })

  it('offers "Ver cargos" for a recurring insight with a merchant', () => {
    const { drill } = actionsFor(
      insight({ type: 'recurring', merchant: netflixLabel }),
      netflix
    )
    expect(drill).toEqual({
      label: 'Ver cargos →',
      filter: { merchant: netflixKey, type: 'debit' },
    })
  })

  describe('anomaly: "Ver movimiento"', () => {
    const uyu = tx({ id: 'u1', currency: 'UYU', amount: 16200 })
    const anomaly = insight({
      type: 'anomaly',
      merchant: netflixLabel,
      amount: 405,
      currency: 'USD',
    })

    it('opens the one row whose converted amount is the insight amount', () => {
      const { drill } = actionsFor(anomaly, [...netflix, uyu])
      expect(drill).toEqual({
        label: 'Ver movimiento →',
        filter: {
          merchant: netflixKey,
          type: 'debit',
          currency: 'UYU',
          min: 16200,
          max: 16200,
        },
      })
    })

    it('converts to the insight currency, not the current home currency', () => {
      const { drill } = actionsFor(anomaly, [...netflix, uyu], {
        homeCurrency: 'UYU',
      })
      expect(drill?.label).toBe('Ver movimiento →')
    })

    it('falls back to the merchant link when two rows convert to the amount', () => {
      const usd = tx({ id: 'u2', amount: 405 })
      const { drill } = actionsFor(anomaly, [...netflix, uyu, usd])
      expect(drill).toEqual({
        label: 'Ver transacciones →',
        filter: { merchant: netflixKey, type: 'debit' },
      })
    })
  })

  describe('Sin categoría: "Revisar N"', () => {
    const unc = Category.Uncategorized
    const card = insight({ category: unc })

    it('counts the counted uncategorized expenses, not credits', () => {
      const rows = [
        tx({ category: unc }),
        tx({ category: unc }),
        tx({ category: unc, type: 'credit' }),
      ]
      expect(actionsFor(card, rows).drill).toEqual({
        label: 'Revisar 2 →',
        filter: { categories: [unc], type: 'debit' },
      })
    })

    it('counts only the household rows in Hogar mode and keeps the cut', () => {
      const rows = [
        tx({ category: unc, household: true }),
        tx({ category: unc }),
        tx({ category: unc }),
      ]
      expect(
        actionsFor(card, [rows[0]], { all: rows, householdMode: true }).drill
      ).toEqual({
        label: 'Revisar 1 →',
        filter: { categories: [unc], type: 'debit', household: 'household' },
      })
    })

    it('falls back to the plain link when none is left', () => {
      expect(actionsFor(card, netflix).drill).toEqual({
        label: 'Ver transacciones →',
        filter: { category: unc },
      })
    })
  })
})

describe('insightActions: "Marcar como hogar"', () => {
  const recurring = insight({ type: 'recurring', merchant: netflixLabel })

  it('offers the newest not-yet-household row of the merchant', () => {
    expect(actionsFor(recurring, netflix).household).toEqual({
      state: 'offer',
      transactionId: 'n3',
    })
  })

  it('offers nothing in Hogar mode', () => {
    expect(
      actionsFor(recurring, netflix, { householdMode: true }).household
    ).toBeNull()
  })

  it('reads done once a merchant rule covers the rows', () => {
    const rules = householdRulesOf({
      merchants: [[merchantOverrideKey('NETFLIX.COM') as string, true]],
    })
    expect(
      actionsFor(recurring, netflix, { householdRules: rules }).household
    ).toEqual({ state: 'done' })
  })

  it('is only for recurring insights', () => {
    expect(
      actionsFor(
        insight({ type: 'bleeding_money', merchant: netflixLabel }),
        netflix
      ).household
    ).toBeNull()
  })
})

describe('householdMarkedToast', () => {
  it('says one or many', () => {
    expect(householdMarkedToast('Netflix', 1)).toBe(
      'Hogar: Sí en 1 transacción de Netflix'
    )
    expect(householdMarkedToast('Netflix', 3)).toBe(
      'Hogar: Sí en 3 transacciones de Netflix'
    )
  })
})
