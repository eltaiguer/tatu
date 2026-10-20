/**
 * How well a categorization engine agrees with the user.
 *
 * The user's own categorizations (rows at confidence 1: edits, bulk
 * categorize) are the only ground truth Tatu has. An engine is scored by
 * running it over those rows *without* the user rules those very rows
 * created (overrides, custom patterns), as a fresh import would see them,
 * and counting how often it lands on the user's category. The same report
 * shape serves any engine — the rule categorizer, the AI, or a candidate
 * replacement — so they can be compared on the same rows.
 */
import type { Transaction } from '../../../models'
import { categorizeTransaction } from '../transaction-categorizer'
import {
  listMerchantCategoryOverrides,
  replaceMerchantCategoryOverrides,
} from '../category-overrides'
import {
  listDescriptionOverrides,
  replaceDescriptionOverrides,
} from '../../descriptions/description-overrides'
import { listCustomPatterns, replaceCustomPatterns } from '../custom-patterns'
import { normalizeCategoryId } from '../../categories/category-aliases'
import { countsAsRow } from '../../spending/spending-rules'

export interface LabelledRow {
  id: string
  description: string
  type: Transaction['type']
  amount: number
  currency: Transaction['currency']
  source: Transaction['source']
  /** The user's category, as the current built-in or custom id. */
  label: string
}

export interface AgreementReport {
  total: number
  agreed: number
  /** agreed / total, 0 when there are no rows. */
  agreement: number
  byLabel: Array<{ label: string; total: number; agreed: number }>
  mismatches: Array<{
    id: string
    description: string
    label: string
    predicted: string
  }>
}

const USER_LOCKED = 1

/** The rows the user categorized, newest first. Split parents are inert. */
export function labelledRows(transactions: Transaction[]): LabelledRow[] {
  return transactions
    .filter(
      (tx) =>
        countsAsRow(tx) &&
        tx.categoryConfidence === USER_LOCKED &&
        normalizeCategoryId(tx.category) !== 'uncategorized'
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((tx) => ({
      id: tx.id,
      description: tx.description,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      source: tx.source,
      label: normalizeCategoryId(tx.category),
    }))
}

/**
 * Runs `fn` with the user's overrides and custom patterns withheld, then
 * puts them back (also when `fn` throws). Synchronous on purpose: nothing
 * else can observe the empty rule stores in between.
 */
export function withoutUserRules<T>(fn: () => T): T {
  const merchantOverrides = listMerchantCategoryOverrides()
  const descriptionOverrides = listDescriptionOverrides()
  const customPatterns = listCustomPatterns()
  replaceMerchantCategoryOverrides({})
  replaceDescriptionOverrides({})
  replaceCustomPatterns([])
  try {
    return fn()
  } finally {
    replaceMerchantCategoryOverrides(merchantOverrides)
    replaceDescriptionOverrides(descriptionOverrides)
    replaceCustomPatterns(customPatterns)
  }
}

/** What the rule categorizer says at import (no context), user rules withheld. */
export function rulePredictions(rows: LabelledRow[]): Map<string, string> {
  return withoutUserRules(
    () =>
      new Map(
        rows.map((row) => [
          row.id,
          normalizeCategoryId(
            categorizeTransaction(row.description, row.type).category
          ),
        ])
      )
  )
}

/** A row without a prediction counts as predicted `uncategorized`. */
export function scoreAgreement(
  rows: LabelledRow[],
  predictions: Map<string, string>
): AgreementReport {
  const byLabel = new Map<string, { total: number; agreed: number }>()
  const mismatches: AgreementReport['mismatches'] = []
  let agreed = 0

  for (const row of rows) {
    const predicted = normalizeCategoryId(predictions.get(row.id))
    const counts = byLabel.get(row.label) ?? { total: 0, agreed: 0 }
    counts.total += 1
    if (predicted === row.label) {
      counts.agreed += 1
      agreed += 1
    } else {
      mismatches.push({
        id: row.id,
        description: row.description,
        label: row.label,
        predicted,
      })
    }
    byLabel.set(row.label, counts)
  }

  return {
    total: rows.length,
    agreed,
    agreement: rows.length === 0 ? 0 : agreed / rows.length,
    byLabel: [...byLabel.entries()]
      .map(([label, counts]) => ({ label, ...counts }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
    mismatches,
  }
}
