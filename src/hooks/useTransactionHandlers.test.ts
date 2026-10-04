import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Transaction } from '../models'

// Claude is an external service: its client is the only thing mocked here.
// Persistence goes through the in-memory repository adapter, and every test
// asserts on what ends up in the store and in that repository (#119).
const ai = vi.hoisted(() => ({
  getAiConfig: vi.fn(),
  enrichTransactionsWithAi: vi.fn(),
}))

vi.mock('../services/ai', () => ({
  getAiConfig: ai.getAiConfig,
  enrichTransactionsWithAi: ai.enrichTransactionsWithAi,
  applyAiEnrichment: (
    txs: Transaction[],
    results: Map<string, { category: string }>
  ) =>
    txs.map((tx) =>
      results.has(tx.id)
        ? { ...tx, category: results.get(tx.id)!.category }
        : tx
    ),
}))
vi.mock('../services/ai/correction-context', () => ({
  buildCorrectionContext: () => ({
    descriptionExamples: [],
    categoryExamples: [],
    customCategories: [],
    customPatterns: [],
  }),
}))

import {
  useTransactionHandlers,
  type DeleteResult,
} from './useTransactionHandlers'
import {
  NeedsConfirmationError,
  PartialWriteError,
  UserFacingError,
} from '../utils/user-error'
import { transactionStore } from '../stores/transaction-store'
import { workspaceStore } from '../stores/workspace-state'
import { parseBankAccountCSV } from '../services/parsers/bank-account-parser'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../services/repository/in-memory-repository'
import {
  getDescriptionOverride,
  replaceDescriptionOverrides,
} from '../services/descriptions/description-overrides'
import {
  getMerchantCategoryOverride,
  replaceMerchantCategoryOverrides,
} from '../services/categorizer/category-overrides'

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
    tags: [],
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

/**
 * A signed-in user whose server holds `rows` (and `deleted`), loaded into
 * the store as hydrate would.
 */
function signedIn(
  rows: Transaction[] = [],
  seed: Parameters<typeof createInMemoryRepository>[0] = {}
) {
  const repo = createInMemoryRepository({ transactions: rows, ...seed })
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  const setError = vi.fn()
  const { result } = renderHook(() =>
    useTransactionHandlers({ repository: repo, setError })
  )
  return { repo, handlers: result.current, setError }
}

function stored(id: string) {
  return transactionStore.getState().transactions.find((t) => t.id === id)
}

function storedIds() {
  return transactionStore.getState().transactions.map((t) => t.id)
}

/** Fails every chunk of `op` that contains one of `ids`. */
function failChunksWith(
  repo: InMemoryRepository,
  op: Parameters<InMemoryRepository['failOn']>[0],
  ...ids: string[]
) {
  repo.failOn(op, {
    when: (chunk) => ids.some((id) => chunk.includes(id)),
    error: new Error('429 too many requests'),
  })
}

const many = (n: number, overrides: Partial<Transaction> = {}) =>
  Array.from({ length: n }, (_, i) =>
    makeTransaction(`tx-${String(i).padStart(3, '0')}`, overrides)
  )

beforeEach(() => {
  vi.clearAllMocks()
  transactionStore.getState().clearTransactions()
  replaceDescriptionOverrides({})
  replaceMerchantCategoryOverrides({})
  workspaceStore.setState({ userId: null, status: 'idle' })
  ai.getAiConfig.mockReturnValue(null)
  ai.enrichTransactionsWithAi.mockResolvedValue({ results: new Map() })
})

describe('useTransactionHandlers — one contract without a repository', () => {
  it('rejects every write the same way when nobody is signed in', async () => {
    const { result } = renderHook(() =>
      useTransactionHandlers({ repository: null, setError: vi.fn() })
    )
    const h = result.current
    const calls = [
      h.handleTransactionsImported([makeTransaction('a')]),
      h.handleUpdateTransaction('a', { applyScope: 'single' }),
      h.handleDeleteTransaction('a'),
      h.handleBulkDeleteTransactions(['a']),
      h.handleRestoreTransactions([makeTransaction('a')]),
      h.handleSplitTransaction('a', []),
      h.handleUnsplitTransaction('a'),
      h.handleBulkCategorizeTransactions(['a'], 'food'),
      h.handleBulkTagTransactions(['a'], 'x'),
      h.handleAutoCategorizeTransactions(['a']),
      h.handleApplyPatternToPast({
        id: 'r',
        pattern: 'x',
        matchType: 'contains',
        category: 'food',
        createdAt: '',
      }),
    ]
    for (const call of calls) {
      await expect(call).rejects.toThrow(
        'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'
      )
    }
  })
})

describe('useTransactionHandlers — import with AI enrichment', () => {
  const AI_ON = { apiKey: 'sk-test', enabled: true, model: 'claude-haiku-4-5' }

  beforeEach(() => {
    ai.getAiConfig.mockReturnValue(AI_ON)
  })

  it('imports transactions and reports no AI failure on the happy path', async () => {
    const { repo, handlers } = signedIn()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(outcome.added).toHaveLength(1)
    expect(outcome.aiError).toBeUndefined()
    expect(storedIds()).toEqual(['tx-1'])
    expect(repo.rows().map((t) => t.id)).toEqual(['tx-1'])
    expect(repo.importRuns[0]).toMatchObject({
      status: 'completed',
      stats: { totalRows: 1, insertedRows: 1, duplicateRows: 0 },
    })
  })

  it('stores what the AI returned on both sides', async () => {
    ai.enrichTransactionsWithAi.mockResolvedValue({
      results: new Map([['tx-1', { category: 'restaurants' }]]),
    })
    const { repo, handlers } = signedIn()

    await handlers.handleTransactionsImported([makeTransaction('tx-1')])

    expect(stored('tx-1')?.category).toBe('restaurants')
    expect(repo.row('tx-1')?.category).toBe('restaurants')
  })

  it('does not send rows with a description or merchant override to the AI', async () => {
    replaceDescriptionOverrides({
      'farmacia san roque': {
        friendlyDescription: 'San Roque',
        updatedAt: '',
      },
    })
    replaceMerchantCategoryOverrides({
      'devoto express': { category: 'groceries', updatedAt: '' },
    })
    const { handlers } = signedIn()

    await handlers.handleTransactionsImported([
      makeTransaction('desc', { description: 'FARMACIA SAN ROQUE' }),
      makeTransaction('merchant', { description: 'DEVOTO EXPRESS' }),
      makeTransaction('free', { description: 'UBER TRIP' }),
    ])

    const sent = ai.enrichTransactionsWithAi.mock.calls[0][0] as Array<{
      id: string
    }>
    expect(sent.map((t) => t.id)).toEqual(['free'])
  })

  it('skips the AI call entirely when every new row has an override', async () => {
    replaceMerchantCategoryOverrides({
      'supermercado disco': { category: 'groceries', updatedAt: '' },
    })
    const { handlers } = signedIn()

    const outcome = await handlers.handleTransactionsImported([
      makeTransaction('tx-1'),
    ])

    expect(ai.enrichTransactionsWithAi).not.toHaveBeenCalled()
    expect(outcome.added).toHaveLength(1)
  })

  it('still stores rule-based results when AI enrichment fails, and says why', async () => {
    ai.enrichTransactionsWithAi.mockRejectedValue(
      new Error('401 invalid x-api-key')
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo, handlers } = signedIn()

    const outcome = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(outcome.aiError).toContain('401 invalid x-api-key')
    expect(stored('tx-1')?.category).toBe('groceries')
    expect(repo.row('tx-1')?.category).toBe('groceries')
    expect(repo.importRuns[0].status).toBe('completed')
    expect(errorSpy).toHaveBeenCalledWith(
      'AI enrichment failed during import:',
      expect.any(Error)
    )
  })

  it('does not call the AI when it is disabled', async () => {
    ai.getAiConfig.mockReturnValue({ ...AI_ON, enabled: false, apiKey: '' })
    const { handlers } = signedIn()

    const outcome = await handlers.handleTransactionsImported([
      makeTransaction('tx-1'),
    ])

    expect(outcome.aiError).toBeUndefined()
    expect(ai.enrichTransactionsWithAi).not.toHaveBeenCalled()
  })

  it('reports a partial batch failure to the caller', async () => {
    ai.enrichTransactionsWithAi.mockResolvedValue({
      results: new Map(),
      partialFailure: '1 de 3 lotes fallaron: 529 overloaded',
    })
    const { handlers } = signedIn()

    const outcome = await handlers.handleTransactionsImported([
      makeTransaction('tx-1'),
    ])

    expect(outcome.aiPartial).toContain('529 overloaded')
    expect(outcome.aiError).toBeUndefined()
  })
})

describe('useTransactionHandlers — import persistence (#61)', () => {
  it('fails the import and stores nothing when the first chunk fails', async () => {
    const { repo, handlers } = signedIn()
    repo.failOn('insert', { error: new Error('network down') })

    await expect(
      handlers.handleTransactionsImported(
        [makeTransaction('tx-1')],
        makeImportContext()
      )
    ).rejects.toThrow('network down')

    expect(storedIds()).toEqual([])
    expect(repo.importRuns[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'network down',
    })
  })

  it('keeps the chunks that saved, stores exactly those rows and says how many', async () => {
    const { repo, handlers } = signedIn()
    const rows = many(1200).map((tx, i) => ({
      ...tx,
      description: `COMPRA ${i}`,
    }))
    failChunksWith(repo, 'insert', rows[600].id)

    const error = await handlers
      .handleTransactionsImported(rows, makeImportContext())
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UserFacingError)
    expect((error as Error).message).toBe(
      'Se guardaron 500 de 1200 transacciones nuevas. Importá el archivo de nuevo para completar el resto.'
    )
    expect(repo.rows()).toHaveLength(500)
    expect(storedIds()).toEqual(rows.slice(0, 500).map((t) => t.id))
    expect(repo.importRuns[0]).toMatchObject({ status: 'failed' })
    expect(repo.importRuns[0].errorMessage).toMatch(/^500 de 1200 guardadas/)
  })

  it('finishes the job when the same file is imported again', async () => {
    const { repo, handlers } = signedIn()
    const rows = many(700).map((tx, i) => ({ ...tx, description: `C ${i}` }))
    repo.failOn('insert', {
      when: (chunk) => chunk.includes(rows[600].id),
      times: 1,
    })
    await handlers.handleTransactionsImported(rows).catch(() => undefined)

    const second = await handlers.handleTransactionsImported(rows)

    expect(second.added).toHaveLength(200)
    expect(second.duplicates).toHaveLength(500)
    expect(repo.rows()).toHaveLength(700)
    expect(transactionStore.getState().transactions).toHaveLength(700)
  })

  it('does not report a saved import as failed when closing its audit record fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo, handlers } = signedIn()
    repo.failOn('completeImportRun')

    const result = await handlers.handleTransactionsImported(
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(result.added).toHaveLength(1)
    expect(repo.importRuns[0].status).toBe('processing')
  })

  it('fails before recording the import when the lookup fails', async () => {
    const { repo, handlers } = signedIn()
    repo.failOn('findImportCandidates', { error: new Error('timeout') })

    await expect(
      handlers.handleTransactionsImported(
        [makeTransaction('a')],
        makeImportContext()
      )
    ).rejects.toThrow('timeout')
    expect(repo.importRuns).toEqual([])
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

  it('imports only the new row from an overlapping export whose rows shifted', async () => {
    const { repo, handlers } = signedIn(file(A, B))
    const shifted = file(NEW, A, B)

    const result = await handlers.handleTransactionsImported(
      shifted,
      makeImportContext()
    )

    expect(result.added.map((t) => t.id)).toEqual([shifted[0].id])
    expect(result.duplicates).toHaveLength(2)
    expect(repo.rows()).toHaveLength(3)
    expect(repo.importRuns[0].stats).toEqual({
      totalRows: 3,
      insertedRows: 1,
      duplicateRows: 2,
    })
  })

  it('imports nothing when the exact same file is imported again', async () => {
    const { repo, handlers } = signedIn(file(A, B))

    const result = await handlers.handleTransactionsImported(file(A, B))

    expect(result.added).toEqual([])
    expect(repo.rows()).toHaveLength(2)
  })

  it('imports both rows of a genuine identical same-day pair', async () => {
    const { repo, handlers } = signedIn()

    const result = await handlers.handleTransactionsImported(file(A, A))

    expect(result.added).toHaveLength(2)
    expect(repo.rows()).toHaveLength(2)
  })

  it('keeps a deleted row deleted after a shifted re-import', async () => {
    const [deletedA] = file(A)
    const { repo, handlers } = signedIn(file(A, B).slice(1), {
      deleted: [deletedA],
    })
    const shifted = file(NEW, A, B)

    const result = await handlers.handleTransactionsImported(shifted)

    expect(result.added.map((t) => t.id)).toEqual([shifted[0].id])
    expect(result.previouslyDeleted?.map((t) => t.id)).toEqual([shifted[1].id])
    expect(repo.isDeleted(deletedA.id)).toBe(true)
    expect(stored(shifted[1].id)).toBeUndefined()
  })

  it('saves a row whose id is taken by a different row under a salted id', async () => {
    const [incoming] = file(A)
    const other = { ...file(B)[0], id: incoming.id }
    const { repo, handlers } = signedIn([other])

    const result = await handlers.handleTransactionsImported([incoming])

    expect(result.added.map((t) => t.id)).toEqual([`${incoming.id}_c1`])
    expect(repo.row(`${incoming.id}_c1`)?.description).toBe(
      incoming.description
    )
    expect(repo.row(incoming.id)?.description).toBe(other.description)
  })

  it('salts further when the salted id is taken on the server outside the window', async () => {
    const [incoming] = file(A)
    const { repo, handlers } = signedIn([
      { ...file(B)[0], id: incoming.id },
      makeTransaction(`${incoming.id}_c1`, {
        date: new Date('2024-01-01T00:00:00Z'),
      }),
    ])

    const result = await handlers.handleTransactionsImported([incoming])

    expect(result.added.map((t) => t.id)).toEqual([`${incoming.id}_c2`])
    expect(repo.row(`${incoming.id}_c2`)).toBeDefined()
  })

  it('sends the salted id to AI enrichment so its result lands on the row', async () => {
    ai.getAiConfig.mockReturnValue({
      apiKey: 'sk-test',
      enabled: true,
      model: 'claude-haiku-4-5',
    })
    const [incoming] = file(A)
    const { handlers } = signedIn([{ ...file(B)[0], id: incoming.id }])

    await handlers.handleTransactionsImported([incoming])

    const sent = ai.enrichTransactionsWithAi.mock.calls[0][0] as Array<{
      id: string
    }>
    expect(sent.map((t) => t.id)).toEqual([`${incoming.id}_c1`])
  })

  it('is not blocked by a row still in memory that the server no longer has', async () => {
    const { handlers } = signedIn()
    transactionStore.getState().setTransactions(file(A))
    const shifted = file(NEW, A)

    const result = await handlers.handleTransactionsImported(shifted)

    expect(result.added).toHaveLength(2)
    expect(new Set(storedIds()).size).toBe(3)
  })
})

describe('useTransactionHandlers — apply scope', () => {
  const MERCHANT = 'SUPERMERCADO DISCO'
  const seed = () => [
    makeTransaction('same-1', { description: MERCHANT }),
    makeTransaction('same-2', { description: MERCHANT }),
    makeTransaction('other', {
      description: 'FARMACIA SAN ROQUE',
      category: 'healthcare',
    }),
  ]

  describe("scope 'single'", () => {
    it('changes only the target transaction, on both sides', async () => {
      const { repo, handlers } = signedIn(seed())

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'single',
      })

      for (const read of [stored, repo.row]) {
        expect(read('same-1')).toMatchObject({
          category: 'restaurants',
          categoryConfidence: 1,
        })
        expect(read('same-2')?.category).toBe('groceries')
        expect(read('other')?.category).toBe('healthcare')
      }
    })

    it('does not write any override', async () => {
      const { repo, handlers } = signedIn(seed())

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'single',
      })

      expect(repo.categoryOverrides.size).toBe(0)
      expect(getMerchantCategoryOverride(MERCHANT)).toBeNull()
    })

    it("clears the category on both sides for 'Sin categoría'", async () => {
      const { repo, handlers } = signedIn(seed())

      await handlers.handleUpdateTransaction('same-1', {
        category: null,
        applyScope: 'single',
      })

      expect(stored('same-1')?.category).toBeUndefined()
      expect(stored('same-1')?.categoryConfidence).toBeUndefined()
      expect(repo.row('same-1')?.category).toBeUndefined()
    })

    it('leaves the category alone when none is given', async () => {
      const { repo, handlers } = signedIn(seed())

      await handlers.handleUpdateTransaction('same-1', {
        tags: ['x'],
        applyScope: 'single',
      })

      expect(stored('same-1')).toMatchObject({
        category: 'groceries',
        tags: ['x'],
      })
      expect(repo.row('same-1')).toMatchObject({
        category: 'groceries',
        tags: ['x'],
      })
    })

    it('reports a row deleted on another device instead of a fake success', async () => {
      const { repo, handlers } = signedIn(seed())
      // Gone from the server (a reset on another device), still on screen.
      await repo.hardDeleteTransactions(['same-1'])
      await expect(
        handlers.handleUpdateTransaction('same-1', {
          category: 'restaurants',
          applyScope: 'single',
        })
      ).rejects.toThrow(/ya no existe/)
      expect(stored('same-1')?.category).toBe('groceries')
    })
  })

  describe("scope 'matching_past_and_future'", () => {
    it('changes every transaction sharing the description, on both sides', async () => {
      const { repo, handlers } = signedIn(seed())

      const result = await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      expect(result.affected).toBe(2)
      for (const read of [stored, repo.row]) {
        expect(read('same-1')?.category).toBe('restaurants')
        expect(read('same-2')?.category).toBe('restaurants')
        expect(read('other')?.category).toBe('healthcare')
      }
    })

    it('records the overrides on both sides so future imports match too', async () => {
      const { repo, handlers } = signedIn(seed())

      await handlers.handleUpdateTransaction('same-1', {
        displayDescription: 'Disco',
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      expect(getMerchantCategoryOverride(MERCHANT)).toBe('restaurants')
      expect(repo.categoryOverrides.get('supermercado disco')?.category).toBe(
        'restaurants'
      )
      expect(getDescriptionOverride(MERCHANT)?.friendlyDescription).toBe(
        'Disco'
      )
      expect(repo.descriptionOverrides.size).toBe(1)
    })

    it('clears per-row names on both sides when the user renames', async () => {
      const { repo, handlers } = signedIn([
        makeTransaction('same-1', { description: MERCHANT }),
        makeTransaction('same-2', {
          description: MERCHANT,
          displayDescription: 'Old name',
        }),
      ])

      await handlers.handleUpdateTransaction('same-1', {
        displayDescription: 'Disco',
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      expect(stored('same-2')?.displayDescription).toBeUndefined()
      expect(repo.row('same-2')?.displayDescription).toBeUndefined()
    })

    it('does not touch per-row names when only the category changed', async () => {
      const { repo, handlers } = signedIn([
        makeTransaction('enriched', {
          description: MERCHANT,
          displayDescription: 'Tienda Inglesa',
        }),
        makeTransaction('plain', { description: MERCHANT }),
      ])

      await handlers.handleUpdateTransaction('plain', {
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      for (const read of [stored, repo.row]) {
        expect(read('enriched')).toMatchObject({
          displayDescription: 'Tienda Inglesa',
          category: 'restaurants',
        })
      }
    })

    it('fails the edit and changes nothing when the rule could not be saved', async () => {
      const { repo, handlers } = signedIn(seed())
      repo.failOn('upsertCategoryOverride', { error: new Error('timeout') })

      await expect(
        handlers.handleUpdateTransaction('same-1', {
          displayDescription: 'Disco',
          category: 'restaurants',
          applyScope: 'matching_past_and_future',
        })
      ).rejects.toThrow('timeout')

      expect(stored('same-2')?.category).toBe('groceries')
      expect(repo.row('same-2')?.category).toBe('groceries')
      // The description override that did save was taken back.
      expect(repo.descriptionOverrides.size).toBe(0)
      expect(getDescriptionOverride(MERCHANT)).toBeNull()
      expect(getMerchantCategoryOverride(MERCHANT)).toBeNull()
    })

    it('puts the previous description override back when the category one fails', async () => {
      const { repo, handlers } = signedIn(seed(), {
        descriptionOverrides: [
          {
            descriptionNormalized: 'supermercado disco',
            descriptionOriginal: MERCHANT,
            friendlyDescription: 'Disco viejo',
            createdAt: '',
            updatedAt: '',
          },
        ],
      })
      replaceDescriptionOverrides({
        'supermercado disco': {
          descriptionOriginal: MERCHANT,
          friendlyDescription: 'Disco viejo',
          updatedAt: '',
        },
      })
      repo.failOn('upsertCategoryOverride')

      await handlers
        .handleUpdateTransaction('same-1', {
          displayDescription: 'Disco nuevo',
          category: 'restaurants',
          applyScope: 'matching_past_and_future',
        })
        .catch(() => undefined)

      expect(
        repo.descriptionOverrides.get('supermercado disco')?.friendlyDescription
      ).toBe('Disco viejo')
      expect(getDescriptionOverride(MERCHANT)?.friendlyDescription).toBe(
        'Disco viejo'
      )
    })

    it('shows the name the server kept when taking it back fails too', async () => {
      const { repo, handlers } = signedIn(seed())
      repo.failOn('upsertCategoryOverride')
      repo.failOn('deleteDescriptionOverride')

      await expect(
        handlers.handleUpdateTransaction('same-1', {
          displayDescription: 'Disco',
          category: 'restaurants',
          applyScope: 'matching_past_and_future',
        })
      ).rejects.toThrow('Se guardó el nombre, pero no la categoría')

      // Screen mirrors database: the name override is on the server, so it
      // is shown; the category override is not.
      expect(repo.descriptionOverrides.size).toBe(1)
      expect(getDescriptionOverride(MERCHANT)?.friendlyDescription).toBe(
        'Disco'
      )
      expect(getMerchantCategoryOverride(MERCHANT)).toBeNull()
    })

    it('applies the rows that saved, says the rule was kept, and retries only the rest', async () => {
      const rows = many(250, { description: MERCHANT })
      const { repo, handlers } = signedIn(rows)
      repo.failOn('update', {
        when: (chunk) => chunk.includes('tx-150'),
        times: 1,
      })

      const error = (await handlers
        .handleUpdateTransaction('tx-000', {
          category: 'restaurants',
          applyScope: 'matching_past_and_future',
        })
        .catch((e: unknown) => e)) as PartialWriteError

      expect(error).toBeInstanceOf(PartialWriteError)
      expect(error.message).toBe(
        'Se guardó la regla, pero se actualizaron 150 de 250 transacciones'
      )
      expect(stored('tx-000')?.category).toBe('restaurants')
      expect(stored('tx-150')?.category).toBe('groceries')
      expect(repo.row('tx-150')?.category).toBe('groceries')
      expect(getMerchantCategoryOverride(MERCHANT)).toBe('restaurants')

      const upserts = repo.requests.upsertCategoryOverride
      await error.retry!()

      expect(stored('tx-150')?.category).toBe('restaurants')
      expect(repo.row('tx-199')?.category).toBe('restaurants')
      expect(repo.requests.upsertCategoryOverride).toBe(upserts)
    })
  })

  describe("scope 'future_matching_only'", () => {
    it('records the override but leaves other existing rows untouched', async () => {
      const { repo, handlers } = signedIn(seed())

      await handlers.handleUpdateTransaction('same-1', {
        category: 'restaurants',
        applyScope: 'future_matching_only',
      })

      expect(getMerchantCategoryOverride(MERCHANT)).toBe('restaurants')
      expect(repo.categoryOverrides.size).toBe(1)
      expect(repo.row('same-1')?.category).toBe('restaurants')
      expect(repo.row('same-2')?.category).toBe('groceries')
      expect(stored('same-2')?.category).toBe('groceries')
    })
  })

  describe('resetting a friendly name', () => {
    const named = () => [
      makeTransaction('tx', {
        description: MERCHANT,
        displayDescription: 'Disco',
      }),
    ]

    it.each(['single', 'future_matching_only'] as const)(
      "scope '%s': clearing the name reaches the server, not just the store",
      async (applyScope) => {
        const { repo, handlers } = signedIn(named())

        await handlers.handleUpdateTransaction('tx', {
          displayDescription: MERCHANT,
          applyScope,
        })

        expect(stored('tx')?.displayDescription).toBeUndefined()
        expect(repo.row('tx')?.displayDescription).toBeUndefined()
      }
    )

    it("scope 'single': a real rename is persisted as the new name", async () => {
      const { repo, handlers } = signedIn(named())

      await handlers.handleUpdateTransaction('tx', {
        displayDescription: 'Tienda Inglesa',
        applyScope: 'single',
      })

      expect(repo.row('tx')?.displayDescription).toBe('Tienda Inglesa')
      expect(stored('tx')?.displayDescription).toBe('Tienda Inglesa')
    })
  })
})

describe('useTransactionHandlers — bulk operations (#60)', () => {
  const abc = () => [
    makeTransaction('a'),
    makeTransaction('b'),
    makeTransaction('c'),
  ]

  it('categorizes only the selected transactions and reports how many', async () => {
    const { repo, handlers } = signedIn(abc())

    const result = await handlers.handleBulkCategorizeTransactions(
      ['a', 'b'],
      'restaurants'
    )

    expect(result.updated).toBe(2)
    for (const read of [stored, repo.row]) {
      expect(read('a')).toMatchObject({
        category: 'restaurants',
        categoryConfidence: 1,
      })
      expect(read('c')?.category).toBe('groceries')
    }
  })

  it('does nothing when the selection is empty', async () => {
    const { repo, handlers } = signedIn(abc())

    const result = await handlers.handleBulkCategorizeTransactions(
      [],
      'restaurants'
    )

    expect(result.updated).toBe(0)
    expect(repo.requests.update).toBeUndefined()
  })

  it('rejects and leaves the store alone when every write fails', async () => {
    const { repo, handlers } = signedIn(abc())
    repo.failOn('update', { error: new Error('timeout') })

    await expect(
      handlers.handleBulkCategorizeTransactions(['a'], 'restaurants')
    ).rejects.toThrow('timeout')
    expect(stored('a')?.category).toBe('groceries')
  })

  it('applies exactly the chunks that saved and retries only the rest', async () => {
    const { repo, handlers } = signedIn(many(300))
    repo.failOn('update', {
      when: (chunk) => chunk.includes('tx-150'),
      times: 1,
    })
    const ids = many(300).map((t) => t.id)

    const error = (await handlers
      .handleBulkCategorizeTransactions(ids, 'food')
      .catch((e: unknown) => e)) as PartialWriteError

    expect(error).toBeInstanceOf(PartialWriteError)
    expect(error.message).toBe('Se actualizaron 200 de 300')
    expect(error.done).toBe(200)
    expect(error.total).toBe(300)
    // Screen mirrors database, row by row.
    for (const tx of transactionStore.getState().transactions) {
      expect(tx.category).toBe(repo.row(tx.id)?.category)
    }
    expect(stored('tx-099')?.category).toBe('food')
    expect(stored('tx-150')?.category).toBe('groceries')

    const before = repo.requests.update ?? 0
    const retried = (await error.retry!()) as { updated: number }

    expect(retried.updated).toBe(100)
    expect((repo.requests.update ?? 0) - before).toBe(1)
    expect(stored('tx-150')?.category).toBe('food')
  })

  it('counts only rows that actually gained the tag', async () => {
    const { handlers } = signedIn(abc())

    await handlers.handleBulkTagTransactions(['a'], 'viaje')
    const second = await handlers.handleBulkTagTransactions(['a', 'b'], 'viaje')

    expect(second.updated).toBe(1)
  })

  it('adds a tag on both sides without duplicating one already present', async () => {
    const { repo, handlers } = signedIn([
      makeTransaction('a'),
      makeTransaction('b', { tags: ['fijo'] }),
    ])

    await handlers.handleBulkTagTransactions(['a', 'b'], 'viaje')
    await handlers.handleBulkTagTransactions(['a'], 'viaje')

    expect(stored('a')?.tags).toEqual(['viaje'])
    expect(stored('b')?.tags).toEqual(['fijo', 'viaje'])
    expect(repo.row('b')?.tags).toEqual(['fijo', 'viaje'])
  })

  it('does not lose a row restored while a bulk write was in flight', async () => {
    const { repo, handlers } = signedIn(abc())
    const gate = repo.hold('update')
    const pending = handlers.handleBulkCategorizeTransactions(['a'], 'food')
    await Promise.resolve()

    transactionStore.getState().addTransactions([makeTransaction('z')])
    gate.release()
    await pending

    expect(stored('z')).toBeDefined()
    expect(stored('a')?.category).toBe('food')
  })

  it('auto-categorizes in one request per (category, confidence)', async () => {
    const { repo, handlers } = signedIn([
      makeTransaction('fee', {
        description: 'COMISION MANTENIMIENTO',
        category: undefined,
      }),
      makeTransaction('fee2', {
        description: 'COMISION TARJETA',
        category: undefined,
      }),
      makeTransaction('none', {
        description: 'XYZZY QWERTY',
        // A credit: no amount heuristic applies, nothing matches.
        type: 'credit',
        category: undefined,
      }),
    ])

    const result = await handlers.handleAutoCategorizeTransactions([
      'fee',
      'fee2',
      'none',
    ])

    expect(result.categorized).toBe(2)
    expect(repo.requests.update).toBe(1)
    expect(repo.row('fee')?.category).toBe('fees')
    expect(stored('fee2')?.category).toBe('fees')
    expect(repo.row('none')?.category).toBeUndefined()
  })
})

describe('useTransactionHandlers — delete and undo', () => {
  const abc = () => [
    makeTransaction('a'),
    makeTransaction('b'),
    makeTransaction('c'),
  ]

  it('soft-deletes the selected rows, reversibly', async () => {
    const { repo, handlers } = signedIn(abc())

    const result = await handlers.handleBulkDeleteTransactions(['a', 'b'])

    expect(result.reversible).toBe(true)
    expect(result.removed.map((tx) => tx.id)).toEqual(['a', 'b'])
    expect(storedIds()).toEqual(['c'])
    expect(repo.isDeleted('a')).toBe(true)
    expect(repo.isDeleted('c')).toBe(false)
  })

  it('undo restores the rows on both sides', async () => {
    const { repo, handlers } = signedIn(abc())
    const { removed } = await handlers.handleBulkDeleteTransactions(['a', 'b'])

    const result = await handlers.handleRestoreTransactions(removed)

    expect(result.restored).toBe(2)
    expect(repo.requests.restore).toBe(1)
    expect(storedIds().sort()).toEqual(['a', 'b', 'c'])
    expect(repo.isDeleted('a')).toBe(false)
  })

  it('does not put rows back locally when the restore fails', async () => {
    const { repo, handlers } = signedIn(abc())
    const { removed } = await handlers.handleBulkDeleteTransactions(['a'])
    repo.failOn('restore', { error: new Error('timeout') })

    await expect(handlers.handleRestoreTransactions(removed)).rejects.toThrow(
      'timeout'
    )
    expect(stored('a')).toBeUndefined()
  })

  it('refuses an undo it did not hand out', async () => {
    const { repo, handlers } = signedIn(abc())

    await expect(
      handlers.handleRestoreTransactions([makeTransaction('a')])
    ).rejects.toThrow('Ya no se puede deshacer')
    expect(repo.requests.restore).toBeUndefined()
  })

  it('rejects a delete whose write fails and keeps the row', async () => {
    const { repo, handlers } = signedIn(abc())
    repo.failOn('softDelete', { error: new Error('timeout') })

    await expect(handlers.handleDeleteTransaction('a')).rejects.toThrow(
      'timeout'
    )
    expect(stored('a')).toBeDefined()
    expect(repo.isDeleted('a')).toBe(false)
  })

  it('removes exactly the chunks that were deleted, keeps undo for them and retries the rest', async () => {
    const { repo, handlers } = signedIn(many(150))
    repo.failOn('softDelete', {
      when: (chunk) => chunk.includes('tx-120'),
      times: 1,
    })
    const ids = many(150).map((t) => t.id)

    const error = (await handlers
      .handleBulkDeleteTransactions(ids)
      .catch((e: unknown) => e)) as PartialWriteError<DeleteResult>

    expect(error.message).toBe('Se eliminaron 100 de 150')
    expect(transactionStore.getState().transactions).toHaveLength(50)
    expect(repo.rows()).toHaveLength(50)
    expect(error.result?.removed).toHaveLength(100)

    await error.retry!()
    expect(transactionStore.getState().transactions).toHaveLength(0)
    expect(repo.rows()).toHaveLength(0)

    // The part that was deleted first can still be undone.
    await handlers.handleRestoreTransactions(error.result!.removed)
    expect(repo.rows()).toHaveLength(100)
    expect(transactionStore.getState().transactions).toHaveLength(100)
  })
})

describe('useTransactionHandlers — split and unsplit', () => {
  const parts = [
    { description: 'Comida', amount: 600, category: 'groceries' },
    { description: 'Bebida', amount: 400, category: 'restaurants' },
  ]
  const parent = () => [makeTransaction('parent', { amount: 1000 })]

  it('marks the parent and adds the parts on both sides', async () => {
    const { repo, handlers } = signedIn(parent())

    const result = await handlers.handleSplitTransaction('parent', parts)

    expect(result.parts).toBe(2)
    for (const read of [stored, repo.row]) {
      expect(read('parent')?.isSplitParent).toBe(true)
      expect(read('parent_split_0')).toMatchObject({
        amount: 600,
        splitParentId: 'parent',
        category: 'groceries',
        categoryConfidence: 1,
      })
      expect(read('parent_split_1')?.amount).toBe(400)
    }
  })

  it('rejects a failed split without changing either side', async () => {
    const { repo, handlers } = signedIn(parent())
    repo.failOn('splitParts', { error: new Error('no se pudo') })

    await expect(
      handlers.handleSplitTransaction('parent', parts)
    ).rejects.toThrow('no se pudo')

    expect(stored('parent')?.isSplitParent).toBeFalsy()
    expect(storedIds()).toEqual(['parent'])
    expect(repo.rows().map((t) => t.id)).toEqual(['parent'])
  })

  it('takes the parts back when the parent cannot be marked (#60)', async () => {
    const { repo, handlers } = signedIn(parent())
    repo.failOn('splitMark', { error: new Error('timeout') })

    await expect(
      handlers.handleSplitTransaction('parent', parts)
    ).rejects.toThrow('timeout')

    expect(repo.rows().map((t) => t.id)).toEqual(['parent'])
    expect(storedIds()).toEqual(['parent'])
  })

  it('shows parent and parts as the server has them when taking the parts back fails (#60)', async () => {
    const { repo, handlers } = signedIn(parent())
    repo.failOn('splitMark')
    repo.failOn('splitUndo')

    await expect(
      handlers.handleSplitTransaction('parent', parts)
    ).rejects.toThrow(/partes/)

    // Never a split parent without parts: both visible, parts deletable.
    expect(stored('parent')?.isSplitParent).toBeFalsy()
    expect(stored('parent_split_0')).toBeDefined()
    expect(repo.row('parent')?.isSplitParent).toBeFalsy()
    expect(repo.row('parent_split_0')).toBeDefined()
  })

  it('refuses a split another device already made, and leaves its parts alone', async () => {
    const { repo, handlers } = signedIn(parent())
    // Device 1 splits 1000 into 600 + 400.
    await handlers.handleSplitTransaction('parent', parts)
    // Device 2 still shows the parent unsplit and splits it 900 + 100.
    transactionStore.getState().setTransactions(parent())

    await expect(
      handlers.handleSplitTransaction('parent', [
        { description: 'Otra', amount: 900 },
        { description: 'Cosa', amount: 100 },
      ])
    ).rejects.toThrow(/Recargá/)

    expect(repo.row('parent')?.isSplitParent).toBe(true)
    expect(repo.row('parent_split_0')?.amount).toBe(600)
    expect(repo.row('parent_split_1')?.amount).toBe(400)
    // Device 2's screen is left as it was; a reload shows device 1's split.
    expect(storedIds()).toEqual(['parent'])
  })

  it("does not clear another device's split when its own mark fails", async () => {
    const { repo, handlers } = signedIn(parent())
    await handlers.handleSplitTransaction('parent', parts)
    transactionStore.getState().setTransactions(parent())
    repo.failOn('splitMark')

    await handlers
      .handleSplitTransaction('parent', parts)
      .catch(() => undefined)

    expect(repo.row('parent')?.isSplitParent).toBe(true)
    expect(repo.row('parent_split_0')?.amount).toBe(600)
  })

  it('unsplits on both sides, removing every part', async () => {
    const { repo, handlers } = signedIn(parent())
    await handlers.handleSplitTransaction('parent', parts)

    await handlers.handleUnsplitTransaction('parent')

    expect(storedIds()).toEqual(['parent'])
    expect(stored('parent')?.isSplitParent).toBe(false)
    expect(repo.rows().map((t) => t.id)).toEqual(['parent'])
    expect(repo.row('parent')?.isSplitParent).toBe(false)
  })

  it('leaves both sides split when the parts cannot be deleted', async () => {
    const { repo, handlers } = signedIn(parent())
    await handlers.handleSplitTransaction('parent', parts)
    repo.failOn('unsplitParts', { error: new Error('timeout') })

    await expect(handlers.handleUnsplitTransaction('parent')).rejects.toThrow(
      'timeout'
    )
    expect(stored('parent')?.isSplitParent).toBe(true)
    expect(repo.row('parent')?.isSplitParent).toBe(true)
    expect(storedIds()).toHaveLength(3)
  })

  it('shows the parent unmarked with its parts when the unsplit cannot be undone', async () => {
    const { repo, handlers } = signedIn(parent())
    await handlers.handleSplitTransaction('parent', parts)
    repo.failOn('unsplitParts')
    repo.failOn('unsplitRemark')

    await expect(handlers.handleUnsplitTransaction('parent')).rejects.toThrow(
      /partes/
    )
    expect(stored('parent')?.isSplitParent).toBe(false)
    expect(stored('parent_split_0')).toBeDefined()
  })

  it('needs confirmation, then soft-deletes the parent and hard-deletes its parts', async () => {
    const { repo, handlers } = signedIn(parent())
    await handlers.handleSplitTransaction('parent', parts)

    await expect(handlers.handleDeleteTransaction('parent')).rejects.toThrow(
      NeedsConfirmationError
    )
    expect(repo.requests.softDelete).toBeUndefined()

    const result = await handlers.handleDeleteTransaction('parent', {
      allowIrreversible: true,
    })

    expect(result.reversible).toBe(false)
    expect(storedIds()).toEqual([])
    expect(repo.isDeleted('parent')).toBe(true)
    expect(repo.has('parent_split_0')).toBe(false)
  })

  it('keeps leftover parts visible and retries them when their delete fails', async () => {
    const { repo, handlers } = signedIn(parent())
    await handlers.handleSplitTransaction('parent', parts)
    repo.failOn('hardDelete', { times: 1 })

    const error = (await handlers
      .handleDeleteTransaction('parent', { allowIrreversible: true })
      .catch((e: unknown) => e)) as PartialWriteError

    expect(error).toBeInstanceOf(PartialWriteError)
    expect(stored('parent')).toBeUndefined()
    expect(stored('parent_split_0')).toBeDefined()
    expect(repo.row('parent_split_0')).toBeDefined()

    await error.retry!()
    expect(storedIds()).toEqual([])
    expect(repo.has('parent_split_0')).toBe(false)
  })

  it('needs confirmation, then hard-deletes a single part', async () => {
    const { repo, handlers } = signedIn(parent())
    await handlers.handleSplitTransaction('parent', parts)

    await expect(
      handlers.handleDeleteTransaction('parent_split_1')
    ).rejects.toThrow(NeedsConfirmationError)
    await handlers.handleDeleteTransaction('parent_split_1', {
      allowIrreversible: true,
    })

    expect(storedIds()).toEqual(['parent', 'parent_split_0'])
    expect(repo.has('parent_split_1')).toBe(false)
    expect(repo.requests.softDelete).toBeUndefined()
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
  const rows = () => [
    makeTransaction('a', { description: 'UBER TRIP' }),
    makeTransaction('b', { description: 'UBER TRIP 2' }),
    makeTransaction('c', { description: 'DEVOTO' }),
    makeTransaction('part', {
      description: 'UBER TRIP',
      splitParentId: 'x',
      category: 'restaurants',
    }),
  ]

  it('applies to matching rows but leaves split parts their own category', async () => {
    const { repo, handlers } = signedIn(rows())

    const result = await handlers.handleApplyPatternToPast(rule)

    expect(result).toEqual({ updated: 2, failed: 0 })
    expect(repo.row('a')).toMatchObject({
      category: 'transport',
      categoryConfidence: 0.95,
    })
    expect(stored('c')?.category).toBe('groceries')
    expect(stored('part')?.category).toBe('restaurants')
  })

  it('keeps and counts only the rows that saved when a chunk fails', async () => {
    const { repo, handlers } = signedIn(rows())
    repo.failOn('update')

    const result = await handlers.handleApplyPatternToPast(rule)

    expect(result).toEqual({ updated: 0, failed: 2 })
    expect(stored('a')?.category).toBe('groceries')
  })
})

describe('useTransactionHandlers — switching accounts mid-write', () => {
  it("never lets user A's write land in user B's store", async () => {
    const { repo, handlers } = signedIn([makeTransaction('a')])
    const gate = repo.hold('update')
    const pending = handlers
      .handleBulkCategorizeTransactions(['a'], 'food')
      .catch((e: unknown) => e)
    await Promise.resolve()

    // A signs out, B signs in and loads their own rows (same id: ids are
    // content hashes, so two users can share one).
    workspaceStore.setState({ userId: 'user-b', status: 'ready' })
    transactionStore
      .getState()
      .setTransactions([makeTransaction('a', { category: 'travel' })])
    gate.release()
    const error = await pending

    expect(error).toBeInstanceOf(UserFacingError)
    expect(stored('a')?.category).toBe('travel')
    // A's own row was saved on the server.
    expect(repo.row('a')?.category).toBe('food')
  })

  it("drops an import's rows when the account changed while it was saving", async () => {
    const { repo, handlers } = signedIn()
    const gate = repo.hold('insert')
    const pending = handlers
      .handleTransactionsImported([makeTransaction('a')])
      .catch((e: unknown) => e)
    await new Promise((resolve) => setTimeout(resolve, 0))

    workspaceStore.setState({ userId: 'user-b', status: 'ready' })
    transactionStore.getState().setTransactions([])
    gate.release()
    await pending

    expect(storedIds()).toEqual([])
  })

  it("refuses A's undo once B is signed in, before sending anything", async () => {
    const { repo, handlers } = signedIn([makeTransaction('a')])
    const { removed } = await handlers.handleBulkDeleteTransactions(['a'])

    workspaceStore.setState({ userId: 'user-b', status: 'ready' })
    transactionStore.getState().setTransactions([])

    await expect(handlers.handleRestoreTransactions(removed)).rejects.toThrow(
      UserFacingError
    )
    expect(repo.requests.restore).toBeUndefined()
    expect(storedIds()).toEqual([])
  })
})
