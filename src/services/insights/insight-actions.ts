import type {
  Currency,
  HouseholdRules,
  Transaction,
  TransactionsFilter,
} from '../../models'
import { Category } from '../../models'
import { buildCategorySpendingConverted } from '../charts/chart-data'
import { convert } from '../currency/convert'
import {
  resolveHousehold,
  rowsSharingMerchantRule,
} from '../household/household'
import { fold, groupByMerchant } from '../merchants/merchant-key'
import { isCountedExpense } from '../spending/spending-rules'
import { isInstallment } from './insight-data'
import type { Insight } from './insight-generator'

export interface InsightActionContext {
  /** The mode's rows: transactions (Todo) / householdRows (Hogar). */
  rows: Transaction[]
  /** Every row (the merchant-rule reach). */
  all: Transaction[]
  householdMode: boolean
  householdRules: HouseholdRules
  homeCurrency: Currency
  fxRate: number
}

/** Built once per render; `insightActions` reads it per card. */
export interface InsightActionIndex {
  ctx: InsightActionContext
  /** folded label -> the merchant keys carrying it (a set: see D2). */
  keysByLabel: Map<string, Set<string>>
  /** merchant key -> its counted expenses in the mode's rows. */
  expensesByKey: Map<string, Transaction[]>
  /** The "Sin categoría" count of the mode's rows (what the link opens). */
  uncategorizedCount: number
}

function addKey(map: Map<string, Set<string>>, label: string, key: string) {
  const folded = fold(label)
  const keys = map.get(folded)
  if (keys) keys.add(key)
  else map.set(folded, new Set([key]))
}

export function buildInsightActionIndex(
  ctx: InsightActionContext
): InsightActionIndex {
  const expenses = ctx.rows.filter(isCountedExpense)
  const keysByLabel = new Map<string, Set<string>>()
  const expensesByKey = new Map<string, Transaction[]>()
  // Labels come from two groupings: the top-merchants one (all counted
  // expenses) and the recurring one (installments left out).
  for (const group of groupByMerchant(expenses)) {
    addKey(keysByLabel, group.label, group.key)
    expensesByKey.set(group.key, group.transactions)
  }
  for (const group of groupByMerchant(
    expenses.filter((t) => !isInstallment(t))
  )) {
    addKey(keysByLabel, group.label, group.key)
  }
  const uncategorizedCount =
    buildCategorySpendingConverted(ctx.rows, ctx.homeCurrency, ctx.fxRate).find(
      (row) => row.category === Category.Uncategorized
    )?.count ?? 0
  return { ctx, keysByLabel, expensesByKey, uncategorizedCount }
}

export interface InsightDrill {
  label: string
  filter: TransactionsFilter
}
export type InsightHousehold =
  | { state: 'offer'; transactionId: string }
  | { state: 'done' }
export interface InsightActions {
  drill: InsightDrill | null
  household: InsightHousehold | null
}

const round2 = (value: number) => Math.round(value * 100) / 100

// The one merchant key a card's label names, or null (none, or several).
function resolveMerchantKey(
  insight: Insight,
  index: InsightActionIndex
): string | null {
  if (!insight.merchant) return null
  const keys = index.keysByLabel.get(fold(insight.merchant))
  if (!keys || keys.size !== 1) return null
  return [...keys][0]
}

function drillFor(
  insight: Insight,
  key: string | null,
  index: InsightActionIndex
): InsightDrill | null {
  const { householdMode } = index.ctx
  const house = householdMode ? { household: 'household' as const } : {}

  if (
    insight.category === Category.Uncategorized &&
    key === null &&
    index.uncategorizedCount > 0
  ) {
    return {
      label: `Revisar ${index.uncategorizedCount} →`,
      filter: { categories: [Category.Uncategorized], type: 'debit', ...house },
    }
  }

  const base: TransactionsFilter = {
    ...(insight.category && { category: insight.category }),
    ...(key !== null && { merchant: key, type: 'debit' as const }),
    ...house,
  }
  if (key !== null && insight.type === 'recurring') {
    return { label: 'Ver cargos →', filter: base }
  }
  if (
    key !== null &&
    insight.type === 'anomaly' &&
    typeof insight.amount === 'number'
  ) {
    const matches = (index.expensesByKey.get(key) ?? []).filter(
      (row) =>
        round2(
          convert(row.amount, row.currency, insight.currency, index.ctx.fxRate)
        ) === insight.amount
    )
    if (matches.length === 1) {
      const [row] = matches
      return {
        label: 'Ver movimiento →',
        filter: {
          ...base,
          currency: row.currency,
          min: row.amount,
          max: row.amount,
        },
      }
    }
  }
  if (base.category || base.merchant) {
    return { label: 'Ver transacciones →', filter: base }
  }
  return null
}

function newestFirst(a: Transaction, b: Transaction): number {
  return b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id)
}

function householdFor(
  insight: Insight,
  key: string | null,
  index: InsightActionIndex
): InsightHousehold | null {
  const { ctx } = index
  if (ctx.householdMode || insight.type !== 'recurring' || key === null) {
    return null
  }
  // A merchant rule is only written when the anchor has a rule reach.
  const ruleable = (index.expensesByKey.get(key) ?? []).filter(
    (row) =>
      !row.splitParentId && rowsSharingMerchantRule(ctx.all, row).length > 0
  )
  if (ruleable.length === 0) return null
  const left = ruleable
    .filter(
      (row) => resolveHousehold(row, ctx.householdRules).status !== 'household'
    )
    .sort(newestFirst)
  return left.length > 0
    ? { state: 'offer', transactionId: left[0].id }
    : { state: 'done' }
}

export function insightActions(
  insight: Insight,
  index: InsightActionIndex
): InsightActions {
  const key = resolveMerchantKey(insight, index)
  return {
    drill: drillFor(insight, key, index),
    household: householdFor(insight, key, index),
  }
}
