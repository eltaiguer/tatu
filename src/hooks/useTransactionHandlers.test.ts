import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Transaction } from '../models'
import type { SupabaseSession } from '../services/supabase/client'

// Mocks are declared via vi.hoisted so the vi.mock factories (which are
// hoisted above the imports) can reference them without a TDZ error.
const mocks = vi.hoisted(() => ({
  persistTransactions: vi.fn<[unknown, unknown, unknown?], Promise<void>>(
    async () => undefined
  ),
  createImportRun: vi.fn(async () => 'import-1'),
  completeImportRun: vi.fn(async () => undefined),
  failImportRun: vi.fn(async () => undefined),
  getAiConfig: vi.fn(() => ({
    apiKey: 'sk-test',
    enabled: true,
    model: 'claude-haiku-4-5',
  })),
  enrichTransactionsWithAi: vi.fn(
    async (): Promise<{
      results: Map<string, unknown>
      partialFailure?: string
    }> => ({ results: new Map() })
  ),
}))

vi.mock('../services/supabase/transactions', () => ({
  persistTransactions: mocks.persistTransactions,
  softDeleteTransaction: vi.fn(async () => undefined),
  updateTransaction: vi.fn(async () => undefined),
  splitTransaction: vi.fn(async () => undefined),
  unsplitTransaction: vi.fn(async () => undefined),
  hardDeleteTransactions: vi.fn(async () => undefined),
}))

vi.mock('../services/supabase/import-runs', () => ({
  createImportRun: mocks.createImportRun,
  completeImportRun: mocks.completeImportRun,
  failImportRun: mocks.failImportRun,
  sha256Hex: async () => 'checksum',
}))

// Override stores are empty, so nothing is filtered out of AI enrichment.
vi.mock('../services/categorizer/category-overrides', () => ({
  listMerchantCategoryOverrides: () => ({}),
  clearMerchantCategoryOverrideWithSync: vi.fn(async () => undefined),
  setMerchantCategoryOverrideWithSync: vi.fn(async () => undefined),
  getMerchantCategoryOverride: () => undefined,
}))
vi.mock('../services/descriptions/description-overrides', () => ({
  clearDescriptionOverrideWithSync: vi.fn(async () => undefined),
  setDescriptionOverrideWithSync: vi.fn(async () => undefined),
  getDescriptionOverride: () => undefined,
}))

vi.mock('../services/ai', () => ({
  getAiConfig: mocks.getAiConfig,
  enrichTransactionsWithAi: mocks.enrichTransactionsWithAi,
  applyAiEnrichment: (txs: Transaction[]) => txs,
}))
vi.mock('../services/ai/correction-context', () => ({
  buildCorrectionContext: () => ({
    descriptionExamples: [],
    categoryExamples: [],
    customCategories: [],
    customPatterns: [],
  }),
}))

import { useTransactionHandlers } from './useTransactionHandlers'
import { transactionStore } from '../stores/transaction-store'

const session = { user: { id: 'user-1' } } as SupabaseSession

function makeTransaction(id: string, overrides: Partial<Transaction> = {}) {
  return {
    id,
    date: new Date('2026-03-15T00:00:00Z'),
    description: 'SUPERMERCADO DISCO',
    amount: 1200,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    category: 'groceries',
    categoryConfidence: 0.8,
    rawData: {},
    ...overrides,
  } as Transaction
}

function makeImportContext() {
  return {
    parsedData: { fileType: 'bank_account_uyu' as const },
    csvContent: 'raw,csv',
    fileName: 'movements.csv',
  }
}

function setup() {
  const setError = vi.fn()
  const setNotice = vi.fn()
  const { result } = renderHook(() =>
    useTransactionHandlers({ session, setError, setNotice })
  )
  return { handlers: result.current, setError, setNotice }
}

describe('useTransactionHandlers — import with AI enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
    mocks.getAiConfig.mockReturnValue({
      apiKey: 'sk-test',
      enabled: true,
      model: 'claude-haiku-4-5',
    })
    mocks.enrichTransactionsWithAi.mockResolvedValue({ results: new Map() })
  })

  it('imports transactions and reports no AI failure on the happy path', async () => {
    const { handlers } = setup()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(outcome.added).toHaveLength(1)
    expect(outcome.aiError).toBeUndefined()
    expect(transactionStore.getState().transactions).toHaveLength(1)
  })

  it('still stores rule-based results when AI enrichment fails', async () => {
    mocks.enrichTransactionsWithAi.mockRejectedValue(new Error('401 invalid x-api-key'))
    const { handlers } = setup()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    // The import itself must still succeed with the rule-based categories.
    expect(outcome.added).toHaveLength(1)
    expect(transactionStore.getState().transactions).toHaveLength(1)
    expect(transactionStore.getState().transactions[0].category).toBe('groceries')
    expect(mocks.persistTransactions).toHaveBeenCalledTimes(1)
    expect(mocks.completeImportRun).toHaveBeenCalledTimes(1)
  })

  it('reports the AI failure reason to the caller instead of swallowing it', async () => {
    mocks.enrichTransactionsWithAi.mockRejectedValue(new Error('401 invalid x-api-key'))
    const { handlers } = setup()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(outcome.aiError).toContain('401 invalid x-api-key')
  })

  it('does not report an AI failure when AI is disabled', async () => {
    mocks.getAiConfig.mockReturnValue({
      apiKey: '',
      enabled: false,
      model: 'claude-haiku-4-5',
    })
    const { handlers } = setup()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(outcome.aiError).toBeUndefined()
    expect(mocks.enrichTransactionsWithAi).not.toHaveBeenCalled()
  })

  it('still fails the import when persistence fails, regardless of AI', async () => {
    mocks.persistTransactions.mockRejectedValueOnce(new Error('network down'))
    const { handlers } = setup()

    await expect(
      handlers.handleTransactionsImported(
        [makeTransaction('tx-1')],
        makeImportContext()
      )
    ).rejects.toThrow('network down')

    expect(mocks.failImportRun).toHaveBeenCalledTimes(1)
    expect(mocks.completeImportRun).not.toHaveBeenCalled()
  })

  it('reports a partial batch failure to the caller', async () => {
    // Some batches succeeded, so enrichment did not throw — but the user must
    // still learn that part of the import was not enriched.
    mocks.enrichTransactionsWithAi.mockResolvedValue({
      results: new Map(),
      partialFailure: '1 de 3 lotes fallaron: 529 overloaded',
    })
    const { handlers } = setup()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(outcome.added).toHaveLength(1)
    expect(outcome.aiError).toContain('529 overloaded')
  })
})
