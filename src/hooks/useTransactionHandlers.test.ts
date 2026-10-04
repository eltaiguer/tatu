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
  softDeleteTransaction: vi.fn<[unknown, string], Promise<void>>(
    async () => undefined
  ),
  restoreTransactions: vi.fn<[unknown, string[]], Promise<void>>(
    async () => undefined
  ),
  findExistingTransactionIds: vi.fn<
    [unknown, string[]],
    Promise<{ active: Set<string>; deleted: Set<string> }>
  >(async () => ({
    active: new Set(),
    deleted: new Set(),
  })),
  findImportCandidates: vi.fn(
    async (): Promise<Array<{ tx: Transaction; deleted: boolean }>> => []
  ),
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
  softDeleteTransaction: mocks.softDeleteTransaction,
  restoreTransactions: mocks.restoreTransactions,
  findExistingTransactionIds: mocks.findExistingTransactionIds,
  findImportCandidates: mocks.findImportCandidates,
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
  clearMerchantCategoryOverrideWithSync:
    mocks.clearMerchantCategoryOverrideWithSync,
  setMerchantCategoryOverrideWithSync:
    mocks.setMerchantCategoryOverrideWithSync,
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
import { NeedsConfirmationError } from '../utils/user-error'
import { transactionStore } from '../stores/transaction-store'
import { parseBankAccountCSV } from '../services/parsers/bank-account-parser'

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
  const { result } = renderHook(() =>
    useTransactionHandlers({ session, setError })
  )
  return { handlers: result.current, setError }
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
    mocks.enrichTransactionsWithAi.mockRejectedValue(
      new Error('401 invalid x-api-key')
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handlers } = setup()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    // The import itself must still succeed with the rule-based categories.
    expect(outcome.added).toHaveLength(1)
    expect(transactionStore.getState().transactions).toHaveLength(1)
    expect(transactionStore.getState().transactions[0].category).toBe(
      'groceries'
    )
    expect(mocks.persistTransactions).toHaveBeenCalledTimes(1)
    expect(mocks.completeImportRun).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'AI enrichment failed during import:',
      expect.any(Error)
    )
  })

  it('reports the AI failure reason to the caller instead of swallowing it', async () => {
    mocks.enrichTransactionsWithAi.mockRejectedValue(
      new Error('401 invalid x-api-key')
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handlers } = setup()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(outcome.aiError).toContain('401 invalid x-api-key')
    expect(errorSpy).toHaveBeenCalledWith(
      'AI enrichment failed during import:',
      expect.any(Error)
    )
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

  it('does not report a saved import as failed when closing its audit record fails', async () => {
    mocks.completeImportRun.mockRejectedValueOnce(new Error('timeout'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { handlers } = setup()

    const result = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(result.added).toHaveLength(1)
    expect(mocks.failImportRun).not.toHaveBeenCalled()
  })

  it('skips rows the user deleted before instead of re-adding them', async () => {
    mocks.getAiConfig.mockReturnValue({
      apiKey: '',
      enabled: false,
      model: 'claude-haiku-4-5',
    })
    mocks.findImportCandidates.mockResolvedValueOnce([
      { tx: makeTransaction('gone'), deleted: true },
    ])
    const { handlers } = setup()

    const result = await handlers.handleTransactionsImported(
      [makeTransaction('gone'), makeTransaction('fresh')],
      makeImportContext()
    )

    expect(result.added.map((t) => t.id)).toEqual(['fresh'])
    expect(result.previouslyDeleted?.map((t) => t.id)).toEqual(['gone'])
    expect(transactionStore.getState().transactions.map((t) => t.id)).toEqual([
      'fresh',
    ])
    const persisted = mocks.persistTransactions.mock
      .calls[0][1] as Transaction[]
    expect(persisted.map((t) => t.id)).toEqual(['fresh'])
    // Audit: total = inserted + duplicates (skipped deleted counted there).
    expect(mocks.completeImportRun).toHaveBeenCalledWith(session, 'import-1', {
      totalRows: 2,
      insertedRows: 1,
      duplicateRows: 1,
    })
  })

  it('treats rows already on the server as duplicates even if not loaded here', async () => {
    mocks.getAiConfig.mockReturnValue({
      apiKey: '',
      enabled: false,
      model: 'claude-haiku-4-5',
    })
    mocks.findImportCandidates.mockResolvedValueOnce([
      { tx: makeTransaction('remote-only'), deleted: false },
    ])
    const { handlers } = setup()

    const result = await handlers.handleTransactionsImported(
      [makeTransaction('remote-only')],
      makeImportContext()
    )

    // Never upserted over the server copy (it may carry the user's edits).
    expect(result.added).toEqual([])
    expect(result.duplicates.map((t) => t.id)).toEqual(['remote-only'])
    expect(mocks.persistTransactions.mock.calls[0]?.[1] ?? []).toEqual([])
  })

  it('fails before recording the import when the lookup fails', async () => {
    mocks.findImportCandidates.mockRejectedValueOnce(new Error('timeout'))
    const { handlers } = setup()

    await expect(
      handlers.handleTransactionsImported(
        [makeTransaction('a')],
        makeImportContext()
      )
    ).rejects.toThrow('timeout')
    expect(mocks.createImportRun).not.toHaveBeenCalled()
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

// #57: ids hash the row's position in the file, so overlapping exports give
// the same bank rows new ids. Imports match rows by content instead.
describe('useTransactionHandlers — import dedup by content', () => {
  const HEADER = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529520,
Moneda,UYU,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,
`
  const NEW =
    '28/11/2025,1,COMPRA CON TARJETA DEBITO FARMACIA,,-300.00,,500.00,'
  const A = '27/11/2025,2,COMPRA CON TARJETA DEBITO DISCO,,-1200.00,,800.00,'
  const B = '26/11/2025,3,CR. PAGO SUELDOS SETA WORKSHOP SRL,,,6104.26,2000.00,'

  function file(...rows: string[]): Transaction[] {
    return parseBankAccountCSV(HEADER + rows.join('\n') + '\n', 'UYU.csv')
      .transactions
  }

  // Rows as findImportCandidates returns them after a Supabase round trip.
  function onServer(txs: Transaction[], deleted = false) {
    return txs.map((tx) => ({
      tx: { ...tx, date: new Date(tx.date.toISOString()) },
      deleted,
    }))
  }

  function persisted(): Transaction[] {
    return (mocks.persistTransactions.mock.calls[0]?.[1] ?? []) as Transaction[]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
    mocks.getAiConfig.mockReturnValue({
      apiKey: '',
      enabled: false,
      model: 'claude-haiku-4-5',
    })
  })

  it('imports nothing new from an overlapping export whose rows shifted', async () => {
    mocks.findImportCandidates.mockResolvedValueOnce(onServer(file(A, B)))
    const { handlers } = setup()
    const shifted = file(NEW, A, B)

    const result = await handlers.handleTransactionsImported(
      shifted,
      makeImportContext()
    )

    expect(result.added.map((t) => t.id)).toEqual([shifted[0].id])
    expect(result.duplicates).toHaveLength(2)
    expect(persisted().map((t) => t.id)).toEqual([shifted[0].id])
    expect(mocks.completeImportRun).toHaveBeenCalledWith(session, 'import-1', {
      totalRows: 3,
      insertedRows: 1,
      duplicateRows: 2,
    })
  })

  it('imports nothing when the exact same file is imported again', async () => {
    mocks.findImportCandidates.mockResolvedValueOnce(onServer(file(A, B)))
    const { handlers } = setup()

    const result = await handlers.handleTransactionsImported(
      file(A, B),
      makeImportContext()
    )

    expect(result.added).toEqual([])
    expect(result.duplicates).toHaveLength(2)
    expect(persisted()).toEqual([])
  })

  it('imports both rows of a genuine identical same-day pair', async () => {
    const { handlers } = setup()

    const result = await handlers.handleTransactionsImported(
      file(A, A),
      makeImportContext()
    )

    expect(result.added).toHaveLength(2)
    expect(persisted()).toHaveLength(2)
  })

  it('keeps a deleted row deleted after a shifted re-import', async () => {
    mocks.findImportCandidates.mockResolvedValueOnce([
      ...onServer(file(A), true),
      ...onServer(file(A, B)).slice(1),
    ])
    const { handlers } = setup()
    const shifted = file(NEW, A, B)

    const result = await handlers.handleTransactionsImported(
      shifted,
      makeImportContext()
    )

    expect(result.added.map((t) => t.id)).toEqual([shifted[0].id])
    expect(result.previouslyDeleted?.map((t) => t.id)).toEqual([shifted[1].id])
    expect(transactionStore.getState().transactions.map((t) => t.id)).toEqual([
      shifted[0].id,
    ])
  })

  it('saves a row whose id is taken by a different row under a salted id', async () => {
    const [incoming] = file(A)
    const other = { ...file(B)[0], id: incoming.id }
    mocks.findImportCandidates.mockResolvedValueOnce(onServer([other]))
    const { handlers } = setup()

    const result = await handlers.handleTransactionsImported(
      [incoming],
      makeImportContext()
    )

    expect(result.added.map((t) => t.id)).toEqual([`${incoming.id}_c1`])
    expect(persisted().map((t) => t.id)).toEqual([`${incoming.id}_c1`])
    expect(
      transactionStore.getState().transactions.map((t) => t.description)
    ).toEqual([incoming.description])
  })

  it('salts further when the salted id turns out to be taken on the server', async () => {
    const [incoming] = file(A)
    mocks.findImportCandidates.mockResolvedValueOnce(
      onServer([{ ...file(B)[0], id: incoming.id }])
    )
    // `_c1` exists but was dated outside the lookup window.
    mocks.findExistingTransactionIds.mockImplementationOnce(
      async (_s: unknown, ids: string[]) => ({
        active: new Set(ids.filter((id) => id === `${incoming.id}_c1`)),
        deleted: new Set<string>(),
      })
    )
    const { handlers } = setup()

    const result = await handlers.handleTransactionsImported(
      [incoming],
      makeImportContext()
    )

    expect(persisted().map((t) => t.id)).toEqual([`${incoming.id}_c2`])
    expect(result.added.map((t) => t.id)).toEqual([`${incoming.id}_c2`])
  })

  it('sends the salted id to AI enrichment so its result lands on the row', async () => {
    mocks.getAiConfig.mockReturnValue({
      apiKey: 'sk-test',
      enabled: true,
      model: 'claude-haiku-4-5',
    })
    const [incoming] = file(A)
    mocks.findImportCandidates.mockResolvedValueOnce(
      onServer([{ ...file(B)[0], id: incoming.id }])
    )
    const { handlers } = setup()

    await handlers.handleTransactionsImported([incoming], makeImportContext())

    const sent = mocks.enrichTransactionsWithAi.mock.calls[0] as unknown as [
      Array<{ id: string }>,
    ]
    expect(sent[0].map((t) => t.id)).toEqual([`${incoming.id}_c1`])
  })

  it('is not blocked by a row still in memory that the server no longer has', async () => {
    // Deleted on another device (or a data reset there): the server is the
    // record of what exists.
    transactionStore.getState().setTransactions(file(A))
    const { handlers } = setup()
    const shifted = file(NEW, A)

    const result = await handlers.handleTransactionsImported(
      shifted,
      makeImportContext()
    )

    expect(result.added).toHaveLength(2)
    // The stale row's id is still kept clear of.
    expect(
      new Set(transactionStore.getState().transactions.map((t) => t.id))
    ).toHaveProperty('size', 3)
  })

  it('dedups by content without a session too', async () => {
    transactionStore.getState().setTransactions(file(A, B))
    const { result } = renderHook(() =>
      useTransactionHandlers({ session: null, setError: vi.fn() })
    )
    const shifted = file(NEW, A, B)

    const outcome = await result.current.handleTransactionsImported(shifted)

    expect(outcome.added.map((t) => t.id)).toEqual([shifted[0].id])
    expect(outcome.duplicates).toHaveLength(2)
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

      const result = await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      expect(stored('same-1')?.category).toBe('restaurants')
      expect(stored('same-2')?.category).toBe('restaurants')
      // The count the UI reports is the number of rows written remotely.
      const patched = new Set(
        mocks.updateRemoteTransaction.mock.calls.map((call) => call[1])
      )
      expect(result.affected).toBe(patched.size)
      expect(result.affected).toBe(2)
    })

    it('fails the edit when the rule for future imports could not be saved', async () => {
      mocks.setMerchantCategoryOverrideWithSync.mockRejectedValueOnce(
        new Error('timeout')
      )
      const { handlers } = setup()

      await expect(
        handlers.handleUpdateTransaction('same-1', {
          category: 'restaurants',
          applyScope: 'matching_past_and_future',
        })
      ).rejects.toThrow('timeout')
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

  it('categorizes only the selected transactions and reports how many', async () => {
    const { handlers } = setup()

    const result = await handlers.handleBulkCategorizeTransactions(
      ['a', 'b'],
      'restaurants'
    )

    expect(result.updated).toBe(2)
    expect(stored('a')?.category).toBe('restaurants')
    expect(stored('b')?.category).toBe('restaurants')
    expect(stored('c')?.category).toBe('groceries')
  })

  it('does nothing when the selection is empty', async () => {
    const { handlers } = setup()

    const result = await handlers.handleBulkCategorizeTransactions(
      [],
      'restaurants'
    )

    expect(result.updated).toBe(0)
    expect(mocks.updateRemoteTransaction).not.toHaveBeenCalled()
  })

  it('rejects and leaves the store alone when a remote write fails', async () => {
    mocks.updateRemoteTransaction.mockRejectedValueOnce(new Error('timeout'))
    const { handlers } = setup()

    await expect(
      handlers.handleBulkCategorizeTransactions(['a'], 'restaurants')
    ).rejects.toThrow('timeout')
    expect(stored('a')?.category).toBe('groceries')
  })

  it('counts only rows that actually gained the tag', async () => {
    const { handlers } = setup()

    await handlers.handleBulkTagTransactions(['a'], 'viaje')
    const second = await handlers.handleBulkTagTransactions(['a', 'b'], 'viaje')

    expect(second.updated).toBe(1)
  })

  it('does not lose a row restored while a bulk write was in flight', async () => {
    // A bulk categorize awaits the server; meanwhile an undo re-adds a row.
    // The categorize must write against the store as it is then, not the
    // snapshot it read before awaiting.
    let release!: () => void
    mocks.updateRemoteTransaction.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve))
    )
    const { handlers } = setup()
    const pending = handlers.handleBulkCategorizeTransactions(['a'], 'food')
    await Promise.resolve()

    transactionStore.getState().addTransactions([makeTransaction('z')])
    release()
    await pending

    expect(stored('z')).toBeDefined()
    expect(stored('a')?.category).toBe('food')
  })

  it('adds a tag without duplicating one already present', async () => {
    const { handlers } = setup()

    await handlers.handleBulkTagTransactions(['a'], 'viaje')
    await handlers.handleBulkTagTransactions(['a'], 'viaje')

    expect(stored('a')?.tags).toEqual(['viaje'])
  })

  it('removes the selected transactions on bulk delete, reversibly', async () => {
    const { handlers } = setup()

    const result = await handlers.handleBulkDeleteTransactions(['a', 'b'])

    expect(result.reversible).toBe(true)
    expect(result.removed.map((tx) => tx.id)).toEqual(['a', 'b'])
    expect(stored('a')).toBeUndefined()
    expect(stored('b')).toBeUndefined()
    expect(stored('c')).toBeDefined()
  })

  it('restores deleted transactions in one request and puts them back', async () => {
    const { handlers } = setup()
    const { removed } = await handlers.handleBulkDeleteTransactions(['a', 'b'])

    const result = await handlers.handleRestoreTransactions(removed)

    expect(result.restored).toBe(2)
    expect(mocks.restoreTransactions).toHaveBeenCalledTimes(1)
    expect(mocks.restoreTransactions.mock.calls[0][1]).toEqual(['a', 'b'])
    expect(stored('a')).toBeDefined()
    expect(stored('b')).toBeDefined()
  })

  it('does not put rows back locally when the restore fails', async () => {
    const { handlers } = setup()
    const { removed } = await handlers.handleBulkDeleteTransactions(['a'])
    mocks.restoreTransactions.mockRejectedValueOnce(new Error('timeout'))

    await expect(handlers.handleRestoreTransactions(removed)).rejects.toThrow(
      'timeout'
    )
    expect(stored('a')).toBeUndefined()
  })

  it('rejects a delete whose remote write fails and keeps the row', async () => {
    mocks.softDeleteTransaction.mockRejectedValueOnce(new Error('timeout'))
    const { handlers } = setup()

    await expect(handlers.handleDeleteTransaction('a')).rejects.toThrow(
      'timeout'
    )
    expect(stored('a')).toBeDefined()
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
    const parent = {
      ...makeTransaction('parent', { amount: 1000 }),
      isSplitParent: true,
    }
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

  it('rejects a failed split without changing the store', async () => {
    mocks.splitTransaction.mockRejectedValue(new Error('no se pudo'))
    const { handlers } = setup()

    await expect(
      handlers.handleSplitTransaction('parent', [
        { description: 'Comida', amount: 600 },
      ])
    ).rejects.toThrow('no se pudo')

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

    // Irreversible, so it refuses until the caller confirms — and writes
    // nothing before that.
    await expect(handlers.handleDeleteTransaction('parent')).rejects.toThrow(
      NeedsConfirmationError
    )
    expect(mocks.hardDeleteTransactions).not.toHaveBeenCalled()
    expect(mocks.softDeleteTransaction).not.toHaveBeenCalled()

    const result = await handlers.handleDeleteTransaction('parent', {
      allowIrreversible: true,
    })
    expect(result.reversible).toBe(false)

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

describe('useTransactionHandlers — deleting a single split part', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
    transactionStore
      .getState()
      .setTransactions([
        makeTransaction('parent', { isSplitParent: true }),
        makeTransaction('parent_split_0', { splitParentId: 'parent' }),
        makeTransaction('parent_split_1', { splitParentId: 'parent' }),
      ])
  })

  it('needs confirmation, then hard-deletes the part instead of soft-deleting it', async () => {
    // A soft-deleted part would block a later re-split, which reuses the id.
    const { handlers } = setup()

    await expect(
      handlers.handleDeleteTransaction('parent_split_1')
    ).rejects.toThrow(NeedsConfirmationError)

    await handlers.handleDeleteTransaction('parent_split_1', {
      allowIrreversible: true,
    })

    expect(mocks.hardDeleteTransactions.mock.calls[0][1]).toEqual([
      'parent_split_1',
    ])
    expect(mocks.softDeleteTransaction).not.toHaveBeenCalled()
    expect(transactionStore.getState().transactions.map((tx) => tx.id)).toEqual(
      ['parent', 'parent_split_0']
    )
  })
})

describe('useTransactionHandlers — applying a new rule to past rows', () => {
  const rule = {
    id: 'r1',
    pattern: 'UBER',
    matchType: 'contains' as const,
    category: 'transport',
    createdAt: '',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    transactionStore.getState().clearTransactions()
    transactionStore.getState().setTransactions([
      makeTransaction('a', { description: 'UBER TRIP' }),
      makeTransaction('b', { description: 'UBER TRIP 2' }),
      makeTransaction('c', { description: 'DEVOTO' }),
      makeTransaction('part', {
        description: 'UBER TRIP',
        splitParentId: 'x',
        category: 'restaurants',
      }),
    ])
  })

  const stored = (id: string) =>
    transactionStore.getState().transactions.find((t) => t.id === id)

  it('applies to matching rows but leaves split parts their own category', async () => {
    const { handlers } = setup()

    const result = await handlers.handleApplyPatternToPast(rule)

    expect(result).toEqual({ updated: 2, failed: 0 })
    expect(stored('a')?.category).toBe('transport')
    expect(stored('c')?.category).toBe('groceries')
    expect(stored('part')?.category).toBe('restaurants')
  })

  it('keeps and counts only the rows that saved when some writes fail', async () => {
    mocks.updateRemoteTransaction.mockImplementation(async (_s, id) => {
      if (id === 'b') throw new Error('timeout')
    })
    const { handlers } = setup()

    const result = await handlers.handleApplyPatternToPast(rule)

    expect(result).toEqual({ updated: 1, failed: 1 })
    expect(stored('a')?.category).toBe('transport')
    expect(stored('b')?.category).toBe('groceries')
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
