import type { ParsedData, Transaction } from '../../models'
import { categorizeTransaction } from './transaction-categorizer'
import { currentUserRules, type UserRules } from './user-rules'

/**
 * Import-time categorization: the step between the (pure) CSV parsers and the
 * rest of the import pipeline. Parsers return rows with `category`,
 * `categoryConfidence` and `displayDescription` unset; this fills them in.
 *
 * Deliberately called with the user's rules and no other
 * `CategorizationContext`, exactly as the parsers used to: only the
 * context-free sources of the categorizer apply at import (see
 * docs/architecture.md). Passing context here would change the categories of
 * future imports — that is a separate decision (#64 step 2).
 */
export function categorizeImportedTransactions(
  transactions: Transaction[],
  rules: UserRules
): Transaction[] {
  return transactions.map((tx) => {
    const { category, confidence, description } = categorizeTransaction(
      tx.description,
      tx.type,
      { rules }
    )
    return {
      ...tx,
      displayDescription: description,
      category,
      categoryConfidence: confidence,
    }
  })
}

/**
 * `categorizeImportedTransactions` over a parser result, with the signed-in
 * user's rules as the stores hold them when the statement is imported.
 */
export function categorizeParsedData(parsed: ParsedData): ParsedData {
  return {
    ...parsed,
    transactions: categorizeImportedTransactions(
      parsed.transactions,
      currentUserRules()
    ),
  }
}
