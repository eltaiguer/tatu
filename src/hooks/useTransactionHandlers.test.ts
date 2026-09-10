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
  splitTransaction: vi.fn(),
  unsplitTransaction: vi.fn<[unknown, unknown, string[]], Promise<unknown>>(),
  hardDeleteTransactions: vi.fn<[unknown, string[]], Promise<void>>(
    async () => undefined
  ),
  updateRemoteTransaction: vi.fn<
    [unknown, string, { displayDescription?: string | null }],
    Promise<void>
  >(async () => undefined),
  setDescriptionOverrideWithSync: vi.fn(async () => undefined),
  clearDescriptionOverrideWithSync: vi.fn(async () => undefined),
  setMerchantCategoryOverrideWithSync: vi.fn(async () => undefined),
  clearMerchantCategoryOverrideWithSync: vi.fn(async () => undefined),
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
  updateTransaction: mocks.updateRemoteTransaction,
  splitTransaction: mocks.splitTransaction,
  unsplitTransaction: mocks.unsplitTransaction,
  hardDeleteTransactions: mocks.hardDeleteTransactions,
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
  clearMerchantCategoryOverrideWithSync: mocks.clearMerchantCategoryOverrideWithSync,
  setMerchantCategoryOverrideWithSync: mocks.setMerchantCategoryOverrideWithSync,
  getMerchantCategoryOverride: () => undefined,
}))
vi.mock('../services/descriptions/description-overrides', () => ({
  clearDescriptionOverrideWithSync: mocks.clearDescriptionOverrideWithSync,
  setDescriptionOverrideWithSync: mocks.setDescriptionOverrideWithSync,
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
    // Partial failure is distinct from total failure: the caller must be able
    // to tell the user that most rows *were* enriched.
    expect(outcome.aiPartial).toContain('529 overloaded')
    expect(outcome.aiError).toBeUndefined()
  })
})

describe('useTransactionHandlers — apply scope', () => {
  const MERCHANT = 'SUPERMERCADO DISCO'

  function seedStore() {
    transactionStore.getState().setTransactions([
      makeTransaction('same-1', { description: MERCHANT }),
      makeTransaction('same-2', { description: MERCHANT }),
      makeTransaction('other', {
        description: 'FARMACIA SAN ROQUE',
        category: 'healthcare',
      }),
    ])
  }

  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
    seedStore()
  })

  function stored(id: string) {
    return transactionStore.getState().transactions.find((t) => t.id === id)
  }

  describe("scope 'single'", () => {
    it('changes only the target transaction', async () => {
      const { handlers } = setup()

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'single',
      })

      expect(stored('same-1')?.category).toBe('restaurants')
      expect(stored('same-2')?.category).toBe('groceries')
      expect(stored('other')?.category).toBe('healthcare')
    })

    it('does not write a merchant override', async () => {
      const { handlers } = setup()

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'single',
      })

      expect(mocks.setMerchantCategoryOverrideWithSync).not.toHaveBeenCalled()
    })
  })

  describe("scope 'matching_past_and_future'", () => {
    it('changes every transaction sharing the description', async () => {
      const { handlers } = setup()

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      expect(stored('same-1')?.category).toBe('restaurants')
      expect(stored('same-2')?.category).toBe('restaurants')
    })

    it('leaves non-matching transactions alone', async () => {
      const { handlers } = setup()

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      expect(stored('other')?.category).toBe('healthcare')
    })

    it('records a merchant override so future imports match too', async () => {
      const { handlers } = setup()

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      expect(mocks.setMerchantCategoryOverrideWithSync).toHaveBeenCalledWith(
        MERCHANT,
        'restaurants'
      )
    })

    it('clears displayDescription on both sides when the user renames', async () => {
      // The local store sets displayDescription to undefined on every matching
      // row. Passing `undefined` to the remote layer means the column is
      // omitted from the payload entirely and the old value survives, so the
      // cleared name reappears on the next sync.
      const { handlers } = setup()

      await handlers.handleUpdateTransaction('same-1', {
        displayDescription: 'Disco',
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      const displayUpdates = mocks.updateRemoteTransaction.mock.calls
        .map((call) => call[2])
        .filter((u) => u && 'displayDescription' in u)

      expect(displayUpdates.length).toBeGreaterThan(0)
      for (const update of displayUpdates) {
        expect(update.displayDescription).toBeNull()
      }
    })

    it('does not touch displayDescription when only the category changed', async () => {
      // Regression guard. Clearing unconditionally destroys per-row friendly
      // names (an AI-enriched "Tienda Inglesa", say) on every sibling row
      // when the user only meant to fix a category — and, because the remote
      // write makes it permanent, the next sync cannot bring them back.
      transactionStore.getState().setTransactions([
        makeTransaction('enriched', {
          description: MERCHANT,
          displayDescription: 'Tienda Inglesa',
        }),
        makeTransaction('plain', { description: MERCHANT }),
      ])
      const { handlers } = setup()

      await handlers.handleUpdateTransaction('plain', {
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      const touched = mocks.updateRemoteTransaction.mock.calls
        .map((call) => call[2])
        .filter((u) => u && 'displayDescription' in u)
      expect(touched).toHaveLength(0)

      expect(stored('enriched')?.displayDescription).toBe('Tienda Inglesa')
      expect(stored('enriched')?.category).toBe('restaurants')
    })
  })

  describe("scope 'future_matching_only'", () => {
    it('records the override but leaves other existing rows untouched', async () => {
      const { handlers } = setup()

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'future_matching_only',
      })

      expect(mocks.setMerchantCategoryOverrideWithSync).toHaveBeenCalledWith(
        MERCHANT,
        'restaurants'
      )
      expect(stored('same-1')?.category).toBe('restaurants')
      expect(stored('same-2')?.category).toBe('groceries')
    })
  })
})

describe('useTransactionHandlers — bulk operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
    transactionStore
      .getState()
      .setTransactions([
        makeTransaction('a'),
        makeTransaction('b'),
        makeTransaction('c'),
      ])
  })

  function stored(id: string) {
    return transactionStore.getState().transactions.find((t) => t.id === id)
  }

  it('categorizes only the selected transactions', async () => {
    const { handlers, setNotice } = setup()

    await handlers.handleBulkCategorizeTransactions(['a', 'b'], 'restaurants')

    expect(stored('a')?.category).toBe('restaurants')
    expect(stored('b')?.category).toBe('restaurants')
    expect(stored('c')?.category).toBe('groceries')
    expect(setNotice).toHaveBeenCalled()
  })

  it('does nothing when the selection is empty', async () => {
    const { handlers } = setup()

    await handlers.handleBulkCategorizeTransactions([], 'restaurants')

    expect(mocks.updateRemoteTransaction).not.toHaveBeenCalled()
  })

  it('adds a tag without duplicating one already present', async () => {
    const { handlers } = setup()

    await handlers.handleBulkTagTransactions(['a'], 'viaje')
    await handlers.handleBulkTagTransactions(['a'], 'viaje')

    expect(stored('a')?.tags).toEqual(['viaje'])
  })

  it('removes the selected transactions on bulk delete', async () => {
    const { handlers } = setup()

    await handlers.handleBulkDeleteTransactions(['a', 'b'])

    expect(stored('a')).toBeUndefined()
    expect(stored('b')).toBeUndefined()
    expect(stored('c')).toBeDefined()
  })
})

describe('useTransactionHandlers — split and unsplit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
    transactionStore
      .getState()
      .setTransactions([makeTransaction('parent', { amount: 1000 })])
  })

  function stored(id: string) {
    return transactionStore.getState().transactions.find((t) => t.id === id)
  }

  function splitResult() {
    const parent = { ...makeTransaction('parent', { amount: 1000 }), isSplitParent: true }
    const children = [
      makeTransaction('parent_split_0', {
        amount: 600,
        splitParentId: 'parent',
        category: 'groceries',
      }),
      makeTransaction('parent_split_1', {
        amount: 400,
        splitParentId: 'parent',
        category: 'restaurants',
      }),
    ]
    return { parent, children }
  }

  it('marks the parent and adds the children to the store', async () => {
    mocks.splitTransaction.mockResolvedValue(splitResult())
    const { handlers } = setup()

    await handlers.handleSplitTransaction('parent', [
      { description: 'Comida', amount: 600, category: 'groceries' },
      { description: 'Bebida', amount: 400, category: 'restaurants' },
    ])

    expect(stored('parent')?.isSplitParent).toBe(true)
    expect(stored('parent_split_0')?.amount).toBe(600)
    expect(stored('parent_split_1')?.amount).toBe(400)
    expect(transactionStore.getState().transactions).toHaveLength(3)
  })

  it('reports a split failure without changing the store', async () => {
    mocks.splitTransaction.mockRejectedValue(new Error('no se pudo'))
    const { handlers, setError } = setup()

    await handlers.handleSplitTransaction('parent', [
      { description: 'Comida', amount: 600 },
    ])

    expect(setError).toHaveBeenCalledWith('no se pudo')
    expect(stored('parent')?.isSplitParent).toBeFalsy()
    expect(transactionStore.getState().transactions).toHaveLength(1)
  })

  it('removes the children and restores the parent on unsplit', async () => {
    mocks.splitTransaction.mockResolvedValue(splitResult())
    const { handlers } = setup()
    await handlers.handleSplitTransaction('parent', [
      { description: 'Comida', amount: 600 },
      { description: 'Bebida', amount: 400 },
    ])
    expect(transactionStore.getState().transactions).toHaveLength(3)

    mocks.unsplitTransaction.mockResolvedValue({
      ...makeTransaction('parent', { amount: 1000 }),
      isSplitParent: false,
      splitParentId: undefined,
    })

    await handlers.handleUnsplitTransaction('parent')

    expect(stored('parent_split_0')).toBeUndefined()
    expect(stored('parent_split_1')).toBeUndefined()
    expect(stored('parent')?.isSplitParent).toBe(false)
    expect(transactionStore.getState().transactions).toHaveLength(1)
  })

  it('passes every child id to the remote unsplit so none are orphaned', async () => {
    mocks.splitTransaction.mockResolvedValue(splitResult())
    const { handlers } = setup()
    await handlers.handleSplitTransaction('parent', [
      { description: 'Comida', amount: 600 },
      { description: 'Bebida', amount: 400 },
    ])

    mocks.unsplitTransaction.mockResolvedValue(
      makeTransaction('parent', { amount: 1000 })
    )
    await handlers.handleUnsplitTransaction('parent')

    const childIds = mocks.unsplitTransaction.mock.calls[0][2]
    expect(childIds).toEqual(
      expect.arrayContaining(['parent_split_0', 'parent_split_1'])
    )
  })

  it('hard-deletes split children when the parent is deleted', async () => {
    mocks.splitTransaction.mockResolvedValue(splitResult())
    const { handlers } = setup()
    await handlers.handleSplitTransaction('parent', [
      { description: 'Comida', amount: 600 },
      { description: 'Bebida', amount: 400 },
    ])

    await handlers.handleDeleteTransaction('parent')

    // Children are hard-deleted rather than soft-deleted: they only exist as
    // a subdivision of the parent, so leaving them behind would orphan rows
    // that no longer sum to anything.
    expect(mocks.hardDeleteTransactions).toHaveBeenCalledTimes(1)
    expect(mocks.hardDeleteTransactions.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['parent_split_0', 'parent_split_1'])
    )
    expect(transactionStore.getState().transactions).toHaveLength(0)
  })
})

describe('useTransactionHandlers — resetting a friendly name', () => {
  const MERCHANT = 'SUPERMERCADO DISCO'

  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
    transactionStore.getState().setTransactions([
      makeTransaction('tx', {
        description: MERCHANT,
        displayDescription: 'Disco',
      }),
    ])
  })

  function remoteDisplayUpdate() {
    return mocks.updateRemoteTransaction.mock.calls
      .map((call) => call[2])
      .find((u) => u && 'displayDescription' in u)
  }

  it("scope 'single': clearing the name reaches the server, not just the store", async () => {
    // Passing undefined omits the column, so the server keeps the old name
    // and it reappears on the next sync while the store shows it cleared.
    const { handlers } = setup()

    await handlers.handleUpdateTransaction('tx', {
      displayDescription: MERCHANT,
      applyScope: 'single',
    })

    expect(remoteDisplayUpdate()?.displayDescription).toBeNull()
  })

  it("scope 'future_matching_only': clearing the name reaches the server too", async () => {
    const { handlers } = setup()

    await handlers.handleUpdateTransaction('tx', {
      displayDescription: MERCHANT,
      applyScope: 'future_matching_only',
    })

    expect(remoteDisplayUpdate()?.displayDescription).toBeNull()
  })

  it("scope 'single': a real rename is still persisted as the new name", async () => {
    const { handlers } = setup()

    await handlers.handleUpdateTransaction('tx', {
      displayDescription: 'Tienda Inglesa',
      applyScope: 'single',
    })

    expect(remoteDisplayUpdate()?.displayDescription).toBe('Tienda Inglesa')
  })
})
