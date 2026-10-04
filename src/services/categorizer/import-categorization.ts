import type { ParsedData, Transaction } from '../../models'
import { categorizeTransaction } from './transaction-categorizer'

/**
 * Import-time categorization: the step between the (pure) CSV parsers and the
 * rest of the import pipeline. Parsers return rows with `category`,
 * `categoryConfidence` and `displayDescription` unset; this fills them in.
 *
 * Deliberately called without a `CategorizationContext`, exactly as the
 * parsers used to: only the context-free sources of the categorizer apply at
 * import (see docs/architecture.md). Passing context here would change the
 * categories of future imports — that is a separate decision (#64 step 2).
 */
export function categorizeImportedTransactions(
  transactions: Transaction[]
): Transaction[] {
  return transactions.map((tx) => {
    const { category, confidence, description } = categorizeTransaction(
      tx.description,
      tx.type
    )
    return {
      ...tx,
      displayDescription: description,
      category,
      categoryConfidence: confidence,
    }
  })
}

/** `categorizeImportedTransactions` over a parser result. */
export function categorizeParsedData(parsed: ParsedData): ParsedData {
  return {
    ...parsed,
    transactions: categorizeImportedTransactions(parsed.transactions),
  }
}
