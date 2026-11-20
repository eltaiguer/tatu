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
  canHaveMerchantRule,
  merchantRuleKey,
  resolveHousehold,
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
  /** merchant key -> its group label (what the card's merchant text means). */
  labelByKey: Map<string, string>
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
  const labelByKey = new Map<string, string>()
  // Labels come from two groupings: the top-merchants one (all counted
  // expenses) and the recurring one (installments left out).
  for (const group of groupByMerchant(expenses)) {
    addKey(keysByLabel, group.label, group.key)
    expensesByKey.set(group.key, group.transactions)
    labelByKey.set(group.key, group.label)
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
  return { ctx, keysByLabel, expensesByKey, labelByKey, uncategorizedCount }
}

export interface InsightDrill {
  label: string
  filter: TransactionsFilter
}
export type InsightHousehold =
  // One anchor per distinct merchant rule key still to mark, newest first.
  { state: 'offer'; transactionIds: string[] } | { state: 'done' }
export interface InsightActions {
  drill: InsightDrill | null
  household: InsightHousehold | null
  /** The card's merchant as the rows spell it (null when unresolved). */
  merchantLabel: string | null
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

  // A resolved merchant drops the model's category: its figures were summed
  // over every category, and the guess may not match the rows' own.
  const base: TransactionsFilter =
    key !== null
      ? { merchant: key, type: 'debit' as const, ...house }
      : { ...(insight.category && { category: insight.category }), ...house }
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
  // One anchor per distinct rule key (a write saves one rule under the
  // anchor's key): the newest still-to-mark row of each. Rows that cannot take
  // a rule (split parts, no key) are left out.
  const ruleable = (index.expensesByKey.get(key) ?? []).filter(
    canHaveMerchantRule
  )
  if (ruleable.length === 0) return null
  const anchors = new Map<string, Transaction>()
  for (const row of [...ruleable].sort(newestFirst)) {
    if (resolveHousehold(row, ctx.householdRules).status === 'household') {
      continue
    }
    const ruleKey = merchantRuleKey(row)
    if (ruleKey !== null && !anchors.has(ruleKey)) anchors.set(ruleKey, row)
  }
  return anchors.size > 0
    ? {
        state: 'offer',
        transactionIds: [...anchors.values()].map((row) => row.id),
      }
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
    merchantLabel: key === null ? null : (index.labelByKey.get(key) ?? null),
  }
}
