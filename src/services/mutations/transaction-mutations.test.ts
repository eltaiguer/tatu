import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../models'

// The behaviour suite of the transaction mutations, called directly with the
// signed-in user's repository (the hook that binds it is tested in
// hooks/useTransactionHandlers.test.ts).
// Claude is an external service: its client is the only thing mocked here.
// Persistence goes through the in-memory repository adapter, and every test
// asserts on what ends up in the store and in that repository (#119).
const ai = vi.hoisted(() => ({
  getAiConfig: vi.fn(),
  enrichTransactionsWithAi: vi.fn(),
}))
// Sentry is the other external service.
const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('../monitoring/error-reporting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../monitoring/error-reporting')>()),
  captureError: reporting.captureError,
}))

vi.mock('../ai', () => ({
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
vi.mock('../ai/correction-context', () => ({
  buildCorrectionContext: () => ({
    descriptionExamples: [],
    categoryExamples: [],
    customCategories: [],
    customPatterns: [],
  }),
}))

import {
  applyPatternToPast,
  autoCategorize,
  bulkCategorize,
  bulkTag,
  deleteTransactions,
  editTransaction,
  importTransactions,
  restoreDeleted,
  splitTransaction,
  unsplitTransaction,
  type DeleteResult,
} from './transaction-mutations'
import {
  NeedsConfirmationError,
  PartialWriteError,
  UserFacingError,
} from '../../utils/user-error'
import { transactionStore } from '../../stores/transaction-store'
import { replaceCustomPatterns } from '../categorizer/custom-patterns'
import { workspaceStore } from '../../stores/workspace-state'
import { parseBankAccountCSV } from '../parsers/bank-account-parser'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../repository/in-memory-repository'
import {
  getDescriptionOverride,
  replaceDescriptionOverrides,
  setDescriptionOverride,
} from '../descriptions/description-overrides'
import { getDisplayDescription } from '../../utils/transaction-display'
import { categorizeTransaction } from '../categorizer/transaction-categorizer'
import {
  getMerchantCategoryOverride,
  listMerchantCategoryOverrides,
  replaceMerchantCategoryOverrides,
} from '../categorizer/category-overrides'

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
  return { repo }
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
  replaceCustomPatterns([])
  workspaceStore.setState({ userId: null, status: 'idle' })
  ai.getAiConfig.mockReturnValue(null)
  ai.enrichTransactionsWithAi.mockResolvedValue({ results: new Map() })
})

describe('transaction-mutations — import with AI enrichment', () => {
  const AI_ON = { apiKey: 'sk-test', enabled: true, model: 'claude-haiku-4-5' }

  beforeEach(() => {
    ai.getAiConfig.mockReturnValue(AI_ON)
  })

  it('imports transactions and reports no AI failure on the happy path', async () => {
    const { repo } = signedIn()

    const outcome = await importTransactions(
      repo,
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
    const { repo } = signedIn()

    await importTransactions(repo, [makeTransaction('tx-1')])

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
    const { repo } = signedIn()

    await importTransactions(repo, [
      makeTransaction('desc', { description: 'FARMACIA SAN ROQUE' }),
      makeTransaction('merchant', { description: 'DEVOTO EXPRESS' }),
      makeTransaction('free', { description: 'UBER TRIP' }),
    ])

    const sent = ai.enrichTransactionsWithAi.mock.calls[0][0] as Array<{
      id: string
    }>
    expect(sent.map((t) => t.id)).toEqual(['free'])
  })

  it('does not send rows a custom rule matches to the AI (audit)', async () => {
    replaceCustomPatterns([
      {
        id: 'cp-1',
        pattern: 'kiosco',
        matchType: 'contains',
        category: 'personal',
        description: 'Kiosco',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const { repo } = signedIn()

    await importTransactions(repo, [
      makeTransaction('ruled', {
        description: 'KIOSCO 25 DE MAYO',
        category: 'personal',
        categoryConfidence: 0.95,
        displayDescription: 'Kiosco',
      }),
      makeTransaction('free', { description: 'UBER TRIP' }),
    ])

    const sent = ai.enrichTransactionsWithAi.mock.calls[0][0] as Array<{
      id: string
    }>
    expect(sent.map((t) => t.id)).toEqual(['free'])
    expect(repo.row('ruled')?.category).toBe('personal')
    expect(repo.row('ruled')?.displayDescription).toBe('Kiosco')
  })

  it('skips the AI call entirely when every new row has an override', async () => {
    replaceMerchantCategoryOverrides({
      'supermercado disco': { category: 'groceries', updatedAt: '' },
    })
    const { repo } = signedIn()

    const outcome = await importTransactions(repo, [makeTransaction('tx-1')])

    expect(ai.enrichTransactionsWithAi).not.toHaveBeenCalled()
    expect(outcome.added).toHaveLength(1)
  })

  it('still stores rule-based results when AI enrichment fails, and says why', async () => {
    ai.enrichTransactionsWithAi.mockRejectedValue(
      new Error('401 invalid x-api-key')
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo } = signedIn()

    const outcome = await importTransactions(
      repo,
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

  it('does not report an AI failure caused by the user key to Sentry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ai.enrichTransactionsWithAi.mockRejectedValueOnce(
      new Error('401 invalid x-api-key')
    )
    const { repo } = signedIn()
    reporting.captureError.mockClear()

    await importTransactions(
      repo,
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(reporting.captureError).not.toHaveBeenCalled()
  })

  it('does not call the AI when it is disabled', async () => {
    ai.getAiConfig.mockReturnValue({ ...AI_ON, enabled: false, apiKey: '' })
    const { repo } = signedIn()

    const outcome = await importTransactions(repo, [makeTransaction('tx-1')])

    expect(outcome.aiError).toBeUndefined()
    expect(ai.enrichTransactionsWithAi).not.toHaveBeenCalled()
  })

  it('reports a partial batch failure to the caller', async () => {
    ai.enrichTransactionsWithAi.mockResolvedValue({
      results: new Map(),
      partialFailure: '1 de 3 lotes fallaron: 529 overloaded',
    })
    const { repo } = signedIn()

    const outcome = await importTransactions(repo, [makeTransaction('tx-1')])

    expect(outcome.aiPartial).toContain('529 overloaded')
    expect(outcome.aiError).toBeUndefined()
  })
})

describe('transaction-mutations — import persistence (#61)', () => {
  it('fails the import and stores nothing when the first chunk fails', async () => {
    const { repo } = signedIn()
    repo.failOn('insert', { error: new Error('network down') })

    await expect(
      importTransactions(repo, [makeTransaction('tx-1')], makeImportContext())
    ).rejects.toThrow('network down')

    expect(storedIds()).toEqual([])
    expect(repo.importRuns[0]).toMatchObject({
      status: 'failed',
      errorMessage: 'network down',
    })
  })

  it('keeps the chunks that saved, stores exactly those rows and says how many', async () => {
    const { repo } = signedIn()
    const rows = many(1200).map((tx, i) => ({
      ...tx,
      description: `COMPRA ${i}`,
    }))
    failChunksWith(repo, 'insert', rows[600].id)

    const error = await importTransactions(
      repo,
      rows,
      makeImportContext()
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UserFacingError)
    expect((error as Error).message).toBe(
      'Se guardaron 500 de 1200 transacciones nuevas. Importá el archivo de nuevo para completar el resto.'
    )
    expect(repo.rows()).toHaveLength(500)
    expect(storedIds()).toEqual(rows.slice(0, 500).map((t) => t.id))
    expect(repo.importRuns[0]).toMatchObject({ status: 'failed' })
    expect(repo.importRuns[0].errorMessage).toMatch(/^500 de 1200 guardadas/)
    // Reported where it is shown, through its cause.
    expect((error as UserFacingError).cause).toBeInstanceOf(Error)
  })

  it('finishes the job when the same file is imported again', async () => {
    const { repo } = signedIn()
    const rows = many(700).map((tx, i) => ({ ...tx, description: `C ${i}` }))
    repo.failOn('insert', {
      when: (chunk) => chunk.includes(rows[600].id),
      times: 1,
    })
    await importTransactions(repo, rows).catch(() => undefined)

    const second = await importTransactions(repo, rows)

    expect(second.added).toHaveLength(200)
    expect(second.duplicates).toHaveLength(500)
    expect(repo.rows()).toHaveLength(700)
    expect(transactionStore.getState().transactions).toHaveLength(700)
  })

  it('does not report a saved import as failed when closing its audit record fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo } = signedIn()
    repo.failOn('completeImportRun')

    const result = await importTransactions(
      repo,
      [makeTransaction('tx-1')],
      makeImportContext()
    )

    expect(result.added).toHaveLength(1)
    expect(repo.importRuns[0].status).toBe('processing')
    expect(reporting.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      'import'
    )
  })

  it('reports to Sentry when a failed import cannot be marked failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { repo } = signedIn()
    repo.failOn('insert', { error: new Error('network down') })
    repo.failOn('failImportRun')

    await expect(
      importTransactions(repo, [makeTransaction('tx-1')], makeImportContext())
    ).rejects.toThrow('network down')

    expect(reporting.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      'import'
    )
  })

  it('fails before recording the import when the lookup fails', async () => {
    const { repo } = signedIn()
    repo.failOn('findImportCandidates', { error: new Error('timeout') })

    await expect(
      importTransactions(repo, [makeTransaction('a')], makeImportContext())
    ).rejects.toThrow('timeout')
    expect(repo.importRuns).toEqual([])
  })
})

// #57: ids hash the row's position in the file, so overlapping exports give
// the same bank rows new ids. Imports match rows by content instead.
describe('transaction-mutations — import dedup by content', () => {
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

  it('shows imported rows tagged with their import run, as a reload would (#167)', async () => {
    const { repo } = signedIn()

    await importTransactions(repo, file(A), makeImportContext())

    const runId = repo.importRuns[0].id
    expect(transactionStore.getState().transactions[0].importId).toBe(runId)
    expect(repo.rows()[0].importId).toBe(runId)
  })

  it('imports only the new row from an overlapping export whose rows shifted', async () => {
    const { repo } = signedIn(file(A, B))
    const shifted = file(NEW, A, B)

    const result = await importTransactions(repo, shifted, makeImportContext())

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
    const { repo } = signedIn(file(A, B))

    const result = await importTransactions(repo, file(A, B))

    expect(result.added).toEqual([])
    expect(repo.rows()).toHaveLength(2)
  })

  it('imports both rows of a genuine identical same-day pair', async () => {
    const { repo } = signedIn()

    const result = await importTransactions(repo, file(A, A))

    expect(result.added).toHaveLength(2)
    expect(repo.rows()).toHaveLength(2)
  })

  it('keeps a deleted row deleted after a shifted re-import', async () => {
    const [deletedA] = file(A)
    const { repo } = signedIn(file(A, B).slice(1), {
      deleted: [deletedA],
    })
    const shifted = file(NEW, A, B)

    const result = await importTransactions(repo, shifted)

    expect(result.added.map((t) => t.id)).toEqual([shifted[0].id])
    expect(result.previouslyDeleted?.map((t) => t.id)).toEqual([shifted[1].id])
    expect(repo.isDeleted(deletedA.id)).toBe(true)
    expect(stored(shifted[1].id)).toBeUndefined()
  })

  it('saves a row whose id is taken by a different row under a salted id', async () => {
    const [incoming] = file(A)
    const other = { ...file(B)[0], id: incoming.id }
    const { repo } = signedIn([other])

    const result = await importTransactions(repo, [incoming])

    expect(result.added.map((t) => t.id)).toEqual([`${incoming.id}_c1`])
    expect(repo.row(`${incoming.id}_c1`)?.description).toBe(
      incoming.description
    )
    expect(repo.row(incoming.id)?.description).toBe(other.description)
  })

  it('salts further when the salted id is taken on the server outside the window', async () => {
    const [incoming] = file(A)
    const { repo } = signedIn([
      { ...file(B)[0], id: incoming.id },
      makeTransaction(`${incoming.id}_c1`, {
        date: new Date('2024-01-01T00:00:00Z'),
      }),
    ])

    const result = await importTransactions(repo, [incoming])

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
    const { repo } = signedIn([{ ...file(B)[0], id: incoming.id }])

    await importTransactions(repo, [incoming])

    const sent = ai.enrichTransactionsWithAi.mock.calls[0][0] as Array<{
      id: string
    }>
    expect(sent.map((t) => t.id)).toEqual([`${incoming.id}_c1`])
  })

  describe('repairing rows stored garbled (#192)', () => {
    // A Latin-1 export read as UTF-8 before #192: each accented letter stored
    // as U+FFFD, in the description and in raw_data.
    function garbledFile(...rows: string[]): Transaction[] {
      const latin1 = Uint8Array.from(HEADER + rows.join('\n') + '\n', (c) =>
        c.charCodeAt(0)
      )
      return parseBankAccountCSV(
        new TextDecoder('utf-8').decode(latin1),
        'UYU.csv'
      ).transactions
    }
    const PENAROL =
      '24/11/2025,5,COMPRA CON TARJETA DEBITO PEÑAROL,ADMINISTRACIÓN,-900.00,,100.00,'

    it('moves a merchant override to the repaired text (review of #222)', async () => {
      const [garbled] = garbledFile(PENAROL)
      const { repo } = signedIn([garbled])
      replaceMerchantCategoryOverrides({
        [garbled.description.toLowerCase()]: {
          merchantName: garbled.description,
          category: 'entertainment',
          updatedAt: '',
        },
      })

      await importTransactions(repo, file(PENAROL), makeImportContext())

      expect(
        getMerchantCategoryOverride(
          'COMPRA CON TARJETA DEBITO PEÑAROL ADMINISTRACIÓN'
        )
      ).toBe('entertainment')
    })

    it('fixes the stored text in place: same id and category, nothing inserted', async () => {
      const [garbled] = garbledFile(PENAROL)
      const edited = {
        ...garbled,
        category: 'entertainment',
        displayDescription: 'Club',
      }
      const { repo } = signedIn([edited])

      const result = await importTransactions(
        repo,
        file(PENAROL),
        makeImportContext()
      )

      expect(result.added).toEqual([])
      expect(result.repaired?.map((t) => t.id)).toEqual([garbled.id])
      expect(repo.rows()).toHaveLength(1)
      const row = repo.row(garbled.id)!
      expect(row.description).toBe(
        'COMPRA CON TARJETA DEBITO PEÑAROL ADMINISTRACIÓN'
      )
      expect((row.rawData as Record<string, unknown>).concepto).toBe(
        'COMPRA CON TARJETA DEBITO PEÑAROL'
      )
      expect(row.category).toBe('entertainment')
      expect(row.displayDescription).toBe('Club')
      // Screen mirrors database.
      expect(stored(garbled.id)?.description).toBe(row.description)
      expect(stored(garbled.id)?.rawData).toEqual(row.rawData)
      // Repaired rows were not inserted: counted with the skipped ones.
      expect(repo.importRuns[0].stats).toEqual({
        totalRows: 1,
        insertedRows: 0,
        duplicateRows: 1,
      })
    })

    it('then treats the repaired row as a plain duplicate', async () => {
      const { repo } = signedIn(garbledFile(PENAROL))
      await importTransactions(repo, file(PENAROL))

      const again = await importTransactions(repo, file(PENAROL))

      expect(again.repaired).toEqual([])
      expect(again.duplicates).toHaveLength(1)
      expect(repo.rows()).toHaveLength(1)
    })

    it('still saves the new rows when a repair fails, and reports it', async () => {
      const [garbled] = garbledFile(PENAROL)
      const { repo } = signedIn([garbled])
      failChunksWith(repo, 'update', garbled.id)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await importTransactions(repo, file(NEW, PENAROL))

      expect(result.added).toHaveLength(1)
      expect(result.repaired).toEqual([])
      expect(result.repairsFailed).toBe(1)
      expect(repo.row(garbled.id)?.description).toBe(garbled.description)
      expect(stored(garbled.id)?.description).toBe(garbled.description)
      expect(errorSpy).toHaveBeenCalled()
    })

    it('reports a failed repair to Sentry', async () => {
      const [garbled] = garbledFile(PENAROL)
      const { repo } = signedIn([garbled])
      failChunksWith(repo, 'update', garbled.id)
      vi.spyOn(console, 'error').mockImplementation(() => {})

      await importTransactions(repo, file(NEW, PENAROL))

      expect(reporting.captureError).toHaveBeenCalledWith(
        expect.anything(),
        'import'
      )
    })

    describe('rules learned from the garbled text', () => {
      const CORRECT = 'COMPRA CON TARJETA DEBITO PEÑAROL ADMINISTRACIÓN'

      async function renameEverywhere() {
        const [garbled] = garbledFile(PENAROL)
        const ctx = signedIn([garbled])
        await editTransaction(ctx.repo, garbled.id, {
          displayDescription: 'Club Peñarol',
          category: 'entertainment',
          applyScope: 'matching_past_and_future',
        })
        expect(getDisplayDescription(stored(garbled.id)!)).toBe('Club Peñarol')
        return { ...ctx, garbled }
      }

      it('keeps a name and category set for all matching rows', async () => {
        const { repo, garbled } = await renameEverywhere()

        const result = await importTransactions(repo, file(PENAROL))

        expect(result.repaired?.map((t) => t.id)).toEqual([garbled.id])
        const row = stored(garbled.id)!
        expect(row.description).toBe(CORRECT)
        expect(getDisplayDescription(row)).toBe('Club Peñarol')
        expect(getMerchantCategoryOverride(CORRECT)).toBe('entertainment')
        // Saved on the server too, so it survives a reload.
        expect(
          [...repo.descriptionOverrides.values()].find(
            (o) => o.descriptionOriginal === CORRECT
          )
        ).toMatchObject({
          friendlyDescription: 'Club Peñarol',
          category: 'entertainment',
        })
        expect(
          [...repo.categoryOverrides.values()].find(
            (o) => o.merchantOriginal === CORRECT
          )?.category
        ).toBe('entertainment')
        // The garbled rule stays for rows not repaired yet.
        expect(getDescriptionOverride(garbled.description)).not.toBeNull()
      })

      it('does not overwrite a rule already saved for the correct text', async () => {
        const { repo } = await renameEverywhere()
        // A rule on the correct text, from a later correctly decoded import.
        setDescriptionOverride({
          description: CORRECT,
          friendlyDescription: 'Peñarol (nuevo)',
        })

        await importTransactions(repo, file(PENAROL))

        expect(getDescriptionOverride(CORRECT)?.friendlyDescription).toBe(
          'Peñarol (nuevo)'
        )
      })

      it('leaves the row garbled when its rules could not be moved', async () => {
        const { repo, garbled } = await renameEverywhere()
        repo.failOn('upsertDescriptionOverride', {
          error: new Error('timeout'),
        })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const result = await importTransactions(repo, file(PENAROL))

        expect(result.repaired).toEqual([])
        expect(result.repairsFailed).toBe(1)
        expect(repo.row(garbled.id)?.description).toBe(garbled.description)
        expect(getDisplayDescription(stored(garbled.id)!)).toBe('Club Peñarol')
        expect(errorSpy).toHaveBeenCalled()
      })
    })
  })

  it('is not blocked by a row still in memory that the server no longer has', async () => {
    const { repo } = signedIn()
    transactionStore.getState().setTransactions(file(A))
    const shifted = file(NEW, A)

    const result = await importTransactions(repo, shifted)

    expect(result.added).toHaveLength(2)
    expect(new Set(storedIds()).size).toBe(3)
  })
})

describe('transaction-mutations — apply scope', () => {
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
      const { repo } = signedIn(seed())

      await editTransaction(repo, 'same-1', {
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
      const { repo } = signedIn(seed())

      await editTransaction(repo, 'same-1', {
        category: 'restaurants',
        applyScope: 'single',
      })

      expect(repo.categoryOverrides.size).toBe(0)
      expect(getMerchantCategoryOverride(MERCHANT)).toBeNull()
    })

    it("clears the category on both sides for 'Sin categoría'", async () => {
      const { repo } = signedIn(seed())

      await editTransaction(repo, 'same-1', {
        category: null,
        applyScope: 'single',
      })

      expect(stored('same-1')?.category).toBeUndefined()
      expect(stored('same-1')?.categoryConfidence).toBeUndefined()
      expect(repo.row('same-1')?.category).toBeUndefined()
    })

    it('leaves the category alone when none is given', async () => {
      const { repo } = signedIn(seed())

      await editTransaction(repo, 'same-1', {
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
      const { repo } = signedIn(seed())
      // Gone from the server (a reset on another device), still on screen.
      await repo.hardDeleteTransactions(['same-1'])
      await expect(
        editTransaction(repo, 'same-1', {
          category: 'restaurants',
          applyScope: 'single',
        })
      ).rejects.toThrow(/ya no existe/)
      expect(stored('same-1')?.category).toBe('groceries')
    })
  })

  describe("scope 'matching_past_and_future'", () => {
    it('changes every transaction sharing the description, on both sides', async () => {
      const { repo } = signedIn(seed())

      const result = await editTransaction(repo, 'same-1', {
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
      const { repo } = signedIn(seed())

      await editTransaction(repo, 'same-1', {
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
      const { repo } = signedIn([
        makeTransaction('same-1', { description: MERCHANT }),
        makeTransaction('same-2', {
          description: MERCHANT,
          displayDescription: 'Old name',
        }),
      ])

      await editTransaction(repo, 'same-1', {
        displayDescription: 'Disco',
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      })

      expect(stored('same-2')?.displayDescription).toBeUndefined()
      expect(repo.row('same-2')?.displayDescription).toBeUndefined()
    })

    it('does not touch per-row names when only the category changed', async () => {
      const { repo } = signedIn([
        makeTransaction('enriched', {
          description: MERCHANT,
          displayDescription: 'Tienda Inglesa',
        }),
        makeTransaction('plain', { description: MERCHANT }),
      ])

      await editTransaction(repo, 'plain', {
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
      const { repo } = signedIn(seed())
      repo.failOn('upsertCategoryOverride', { error: new Error('timeout') })

      await expect(
        editTransaction(repo, 'same-1', {
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
      const { repo } = signedIn(seed(), {
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

      await editTransaction(repo, 'same-1', {
        displayDescription: 'Disco nuevo',
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      }).catch(() => undefined)

      expect(
        repo.descriptionOverrides.get('supermercado disco')?.friendlyDescription
      ).toBe('Disco viejo')
      expect(getDescriptionOverride(MERCHANT)?.friendlyDescription).toBe(
        'Disco viejo'
      )
    })

    it('shows the name the server kept when taking it back fails too', async () => {
      const { repo } = signedIn(seed())
      repo.failOn('upsertCategoryOverride')
      repo.failOn('deleteDescriptionOverride')

      const error = (await editTransaction(repo, 'same-1', {
        displayDescription: 'Disco',
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      }).catch((e: unknown) => e)) as UserFacingError
      expect(error.message).toMatch('Se guardó el nombre, pero no la categoría')
      expect(error.cause).toBeInstanceOf(Error)

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
      const { repo } = signedIn(rows)
      repo.failOn('update', {
        when: (chunk) => chunk.includes('tx-150'),
        times: 1,
      })

      const error = (await editTransaction(repo, 'tx-000', {
        category: 'restaurants',
        applyScope: 'matching_past_and_future',
      }).catch((e: unknown) => e)) as PartialWriteError

      expect(error).toBeInstanceOf(PartialWriteError)
      expect(error.message).toBe(
        'Se guardó la regla, pero se actualizaron 150 de 250 transacciones'
      )
      expect(stored('tx-000')?.category).toBe('restaurants')
      expect(stored('tx-150')?.category).toBe('groceries')
      expect(repo.row('tx-150')?.category).toBe('groceries')
      expect(getMerchantCategoryOverride(MERCHANT)).toBe('restaurants')
      expect(error.cause).toBeInstanceOf(Error)

      const upserts = repo.requests.upsertCategoryOverride
      await error.retry!()

      expect(stored('tx-150')?.category).toBe('restaurants')
      expect(repo.row('tx-199')?.category).toBe('restaurants')
      expect(repo.requests.upsertCategoryOverride).toBe(upserts)
    })
  })

  describe("scope 'future_matching_only'", () => {
    it('records the override but leaves other existing rows untouched', async () => {
      const { repo } = signedIn(seed())

      await editTransaction(repo, 'same-1', {
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

  describe('category carries forward to later rows of the merchant (audit)', () => {
    const CORRECTED =
      'COMPRA CON TARJETA DEBITO KIOSCO X 12/03 15:22 AUT 123456'
    const LATER = 'COMPRA CON TARJETA DEBITO KIOSCO X 20/03 09:01 AUT 654321'

    it.each(['future_matching_only', 'matching_past_and_future'] as const)(
      "scope '%s' without a rename reaches a future row with other codes",
      async (applyScope) => {
        const { repo } = signedIn([
          makeTransaction('tx', { description: CORRECTED }),
        ])

        await editTransaction(repo, 'tx', {
          category: 'healthcare',
          applyScope,
        })

        expect(categorizeTransaction(LATER, 'debit')).toEqual({
          category: 'healthcare',
          confidence: 1,
        })
        expect(
          [...repo.categoryOverrides.values()].map((o) => o.category)
        ).toEqual(['healthcare'])
      }
    )

    it('clearing the category stops it reaching future rows', async () => {
      const { repo } = signedIn([
        makeTransaction('tx', { description: CORRECTED }),
      ])
      await editTransaction(repo, 'tx', {
        category: 'healthcare',
        applyScope: 'future_matching_only',
      })

      await editTransaction(repo, 'tx', {
        category: null,
        applyScope: 'future_matching_only',
      })

      expect(categorizeTransaction(LATER, 'debit').category).not.toBe(
        'healthcare'
      )
      expect(repo.categoryOverrides.size).toBe(0)
    })
  })

  describe('overrides stored under the exact key before #222', () => {
    const CORRECTED =
      'COMPRA CON TARJETA DEBITO KIOSCO X 12/03 15:22 AUT 123456'
    const LEGACY_KEY =
      'compra con tarjeta debito kiosco x 12/03 15:22 aut 123456'
    const legacyRow = () => ({
      merchantNormalized: LEGACY_KEY,
      merchantOriginal: CORRECTED,
      category: 'groceries',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    it('clearing the category removes the legacy row on both sides', async () => {
      const { repo } = signedIn(
        [makeTransaction('tx', { description: CORRECTED })],
        { categoryOverrides: [legacyRow()] }
      )
      replaceMerchantCategoryOverrides({
        [LEGACY_KEY]: {
          merchantName: CORRECTED,
          category: 'groceries',
          updatedAt: '',
        },
      })

      await editTransaction(repo, 'tx', {
        category: null,
        applyScope: 'future_matching_only',
      })

      expect(repo.categoryOverrides.size).toBe(0)
      expect(getMerchantCategoryOverride(CORRECTED)).toBeNull()
    })

    it('setting a category replaces the legacy row instead of keeping both', async () => {
      const { repo } = signedIn(
        [makeTransaction('tx', { description: CORRECTED })],
        { categoryOverrides: [legacyRow()] }
      )
      replaceMerchantCategoryOverrides({
        [LEGACY_KEY]: {
          merchantName: CORRECTED,
          category: 'groceries',
          updatedAt: '',
        },
      })

      await editTransaction(repo, 'tx', {
        category: 'healthcare',
        applyScope: 'future_matching_only',
      })

      expect([...repo.categoryOverrides.keys()]).toEqual([
        'compra con tarjeta debito kiosco x',
      ])
      expect(Object.keys(listMerchantCategoryOverrides())).toEqual([
        'compra con tarjeta debito kiosco x',
      ])
    })

    it('mirrors exactly what the server holds when only the legacy delete fails', async () => {
      const { repo } = signedIn(
        [makeTransaction('tx', { description: CORRECTED })],
        { categoryOverrides: [legacyRow()] }
      )
      replaceMerchantCategoryOverrides({
        [LEGACY_KEY]: {
          merchantName: CORRECTED,
          category: 'groceries',
          updatedAt: '',
        },
      })
      repo.failOn('deleteCategoryOverride', {
        when: (ids) => ids.includes(LEGACY_KEY),
        error: new Error('network'),
      })

      await expect(
        editTransaction(repo, 'tx', {
          category: 'healthcare',
          applyScope: 'future_matching_only',
        })
      ).rejects.toThrow()

      // Server: new key written, legacy row still there. Memory: the same.
      expect([...repo.categoryOverrides.keys()].sort()).toEqual(
        ['compra con tarjeta debito kiosco x', LEGACY_KEY].sort()
      )
      expect(Object.keys(listMerchantCategoryOverrides()).sort()).toEqual(
        ['compra con tarjeta debito kiosco x', LEGACY_KEY].sort()
      )
    })
  })

  describe('a carried-forward category and the AI gate', () => {
    it('does not send a later row of the corrected merchant to the AI', async () => {
      ai.getAiConfig.mockReturnValue({
        apiKey: 'sk-test',
        enabled: true,
        model: 'claude-haiku-4-5',
      })
      const { repo } = signedIn([
        makeTransaction('tx', {
          description:
            'COMPRA CON TARJETA DEBITO KIOSCO X 12/03 15:22 AUT 123456',
        }),
      ])
      await editTransaction(repo, 'tx', {
        category: 'healthcare',
        applyScope: 'future_matching_only',
      })

      await importTransactions(repo, [
        makeTransaction('later', {
          description:
            'COMPRA CON TARJETA DEBITO KIOSCO X 20/03 09:01 AUT 654321',
          category: 'healthcare',
          categoryConfidence: 1,
        }),
      ])

      expect(ai.enrichTransactionsWithAi).not.toHaveBeenCalled()
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
        const { repo } = signedIn(named())

        await editTransaction(repo, 'tx', {
          displayDescription: MERCHANT,
          applyScope,
        })

        expect(stored('tx')?.displayDescription).toBeUndefined()
        expect(repo.row('tx')?.displayDescription).toBeUndefined()
      }
    )

    it("scope 'single': a real rename is persisted as the new name", async () => {
      const { repo } = signedIn(named())

      await editTransaction(repo, 'tx', {
        displayDescription: 'Tienda Inglesa',
        applyScope: 'single',
      })

      expect(repo.row('tx')?.displayDescription).toBe('Tienda Inglesa')
      expect(stored('tx')?.displayDescription).toBe('Tienda Inglesa')
    })
  })
})

describe('transaction-mutations — bulk operations (#60)', () => {
  const abc = () => [
    makeTransaction('a'),
    makeTransaction('b'),
    makeTransaction('c'),
  ]

  it('categorizes only the selected transactions and reports how many', async () => {
    const { repo } = signedIn(abc())

    const result = await bulkCategorize(repo, ['a', 'b'], 'restaurants')

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
    const { repo } = signedIn(abc())

    const result = await bulkCategorize(repo, [], 'restaurants')

    expect(result.updated).toBe(0)
    expect(repo.requests.update).toBeUndefined()
  })

  it('rejects and leaves the store alone when every write fails', async () => {
    const { repo } = signedIn(abc())
    repo.failOn('update', { error: new Error('timeout') })

    await expect(bulkCategorize(repo, ['a'], 'restaurants')).rejects.toThrow(
      'timeout'
    )
    expect(stored('a')?.category).toBe('groceries')
  })

  it('applies exactly the chunks that saved and retries only the rest', async () => {
    const { repo } = signedIn(many(300))
    repo.failOn('update', {
      when: (chunk) => chunk.includes('tx-150'),
      times: 1,
    })
    const ids = many(300).map((t) => t.id)

    const error = (await bulkCategorize(repo, ids, 'food').catch(
      (e: unknown) => e
    )) as PartialWriteError

    expect(error).toBeInstanceOf(PartialWriteError)
    expect(error.message).toBe('Se actualizaron 200 de 300')
    expect(error.done).toBe(200)
    expect(error.total).toBe(300)
    expect(error.cause).toBeInstanceOf(Error)
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
    const { repo } = signedIn(abc())

    await bulkTag(repo, ['a'], 'viaje')
    const second = await bulkTag(repo, ['a', 'b'], 'viaje')

    expect(second.updated).toBe(1)
  })

  it('adds a tag on both sides without duplicating one already present', async () => {
    const { repo } = signedIn([
      makeTransaction('a'),
      makeTransaction('b', { tags: ['fijo'] }),
    ])

    await bulkTag(repo, ['a', 'b'], 'viaje')
    await bulkTag(repo, ['a'], 'viaje')

    expect(stored('a')?.tags).toEqual(['viaje'])
    expect(stored('b')?.tags).toEqual(['fijo', 'viaje'])
    expect(repo.row('b')?.tags).toEqual(['fijo', 'viaje'])
  })

  it('does not lose a row restored while a bulk write was in flight', async () => {
    const { repo } = signedIn(abc())
    const gate = repo.hold('update')
    const pending = bulkCategorize(repo, ['a'], 'food')
    await Promise.resolve()

    transactionStore.getState().addTransactions([makeTransaction('z')])
    gate.release()
    await pending

    expect(stored('z')).toBeDefined()
    expect(stored('a')?.category).toBe('food')
  })

  it('auto-categorizes in one request per (category, confidence)', async () => {
    const { repo } = signedIn([
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

    const result = await autoCategorize(repo, ['fee', 'fee2', 'none'])

    expect(result.categorized).toBe(2)
    expect(repo.requests.update).toBe(1)
    expect(repo.row('fee')?.category).toBe('fees')
    expect(stored('fee2')?.category).toBe('fees')
    expect(repo.row('none')?.category).toBeUndefined()
  })
})

describe('transaction-mutations — Auto-categorizar pool and write rule (audit)', () => {
  // Amounts between 3001 and 15000 UYU get no amount heuristic, so only the
  // sources under test can categorize these rows.
  const quiet = { amount: 5000, currency: 'UYU' as const }

  it('does not lower a row by matching it against itself', async () => {
    const { repo } = signedIn([
      makeTransaction('self', {
        ...quiet,
        description: 'MISTERIOSO BAR 77',
        category: 'restaurants',
        categoryConfidence: 0.7,
      }),
    ])

    const result = await autoCategorize(repo, ['self'])

    expect(result.categorized).toBe(0)
    expect(stored('self')?.categoryConfidence).toBe(0.7)
    expect(repo.row('self')?.categoryConfidence).toBe(0.7)
  })

  it('does not seed similar-merchant hints from review-band guesses', async () => {
    const { repo } = signedIn([
      makeTransaction('guess', {
        ...quiet,
        description: 'ZZZ UNKNOWN FOO',
        category: 'shopping',
        categoryConfidence: 0.15,
      }),
      makeTransaction('target', {
        ...quiet,
        description: 'ZZZ UNKNOWN BAR',
        category: undefined,
        categoryConfidence: undefined,
      }),
    ])

    const result = await autoCategorize(repo, ['target'])

    expect(result.categorized).toBe(0)
    expect(stored('target')?.category).toBeUndefined()
  })

  it('still seeds hints from rows categorized with confidence', async () => {
    const { repo } = signedIn([
      makeTransaction('known', {
        ...quiet,
        description: 'ZZZ UNKNOWN FOO',
        category: 'shopping',
        categoryConfidence: 0.8,
      }),
      makeTransaction('target', {
        ...quiet,
        description: 'ZZZ UNKNOWN BAR',
        category: undefined,
        categoryConfidence: undefined,
      }),
    ])

    const result = await autoCategorize(repo, ['target'])

    expect(result.categorized).toBe(1)
    expect(stored('target')?.category).toBe('shopping')
  })

  it('never replaces a category with a less confident one', async () => {
    const { repo } = signedIn([
      makeTransaction('locked', {
        description: 'MISTERIOSO BAR 77',
        amount: 300,
        currency: 'UYU',
        category: 'shopping',
        categoryConfidence: 0.7,
      }),
    ])

    // Amount heuristics would say restaurants at 0.2
    const result = await autoCategorize(repo, ['locked'])

    expect(result.categorized).toBe(0)
    expect(stored('locked')?.category).toBe('shopping')
    expect(repo.row('locked')?.category).toBe('shopping')
  })

  it('leaves a user-locked row (confidence 1) alone', async () => {
    const { repo } = signedIn([
      makeTransaction('user', {
        ...quiet,
        description: 'DEBITO OPERACION EN SUPERNET O SMS 111111TT55 MISTERIOSO',
        category: 'shopping',
        categoryConfidence: 1,
      }),
    ])

    const result = await autoCategorize(repo, ['user'])

    expect(result.categorized).toBe(0)
    expect(stored('user')?.category).toBe('shopping')
  })
})

describe('transaction-mutations — override names in the Auto-categorizar pool (review of #222)', () => {
  it('uses the override description, not its key, as the merchant name', async () => {
    // An all-digits description keys as "raw:12345678"; "raw" must not
    // become a token that matches unrelated rows.
    replaceMerchantCategoryOverrides({
      'raw:12345678': {
        merchantName: '12345678',
        category: 'shopping',
        updatedAt: '',
      },
    })
    const { repo } = signedIn([
      makeTransaction('target', {
        description: 'RAW FOOD BAR',
        amount: 5000,
        currency: 'UYU',
        category: undefined,
        categoryConfidence: undefined,
      }),
    ])

    const result = await autoCategorize(repo, ['target'])

    expect(result.categorized).toBe(0)
  })
})

describe('transaction-mutations — Auto-categorizar, review of #221', () => {
  const quiet = { amount: 5000, currency: 'UYU' as const }

  it('applies a changed rule to rows categorized at the same confidence', async () => {
    // A rule once said shopping (applied to past rows at 0.95); the user
    // edited it to restaurants. Same confidence, different category.
    replaceCustomPatterns([
      {
        id: 'cp',
        pattern: 'misterioso',
        matchType: 'contains',
        category: 'restaurants',
        createdAt: '',
      },
    ])
    const { repo } = signedIn([
      makeTransaction('ruled', {
        ...quiet,
        description: 'MISTERIOSO BAR 77',
        category: 'shopping',
        categoryConfidence: 0.95,
      }),
    ])

    const result = await autoCategorize(repo, ['ruled'])

    expect(result.categorized).toBe(1)
    expect(stored('ruled')?.category).toBe('restaurants')
  })

  it('does not replace a legacy category without a recorded confidence by a guess', async () => {
    const { repo } = signedIn([
      makeTransaction('legacy', {
        description: 'XYZZY QWERTY',
        amount: 300,
        currency: 'UYU',
        category: 'shopping',
        categoryConfidence: undefined,
      }),
    ])

    // Amount heuristics would say restaurants at 0.2
    const result = await autoCategorize(repo, ['legacy'])

    expect(result.categorized).toBe(0)
    expect(stored('legacy')?.category).toBe('shopping')
  })

  it('still seeds hints from legacy rows without a recorded confidence', async () => {
    const { repo } = signedIn([
      makeTransaction('legacy', {
        ...quiet,
        description: 'ZZZ UNKNOWN FOO',
        category: 'shopping',
        categoryConfidence: undefined,
      }),
      makeTransaction('target', {
        ...quiet,
        description: 'ZZZ UNKNOWN BAR',
        category: undefined,
        categoryConfidence: undefined,
      }),
    ])

    const result = await autoCategorize(repo, ['target'])

    expect(result.categorized).toBe(1)
    expect(stored('target')?.category).toBe('shopping')
  })

  it('lets a selected, confident row seed its uncategorized sibling (select all)', async () => {
    const { repo } = signedIn([
      makeTransaction('known', {
        ...quiet,
        description: 'MISTERIOSO BAR 77',
        category: 'restaurants',
        categoryConfidence: 1,
      }),
      makeTransaction('sibling', {
        ...quiet,
        description: 'MISTERIOSO BAR 78',
        category: undefined,
        categoryConfidence: undefined,
      }),
    ])

    const result = await autoCategorize(repo, ['known', 'sibling'])

    expect(result.categorized).toBe(1)
    expect(stored('sibling')?.category).toBe('restaurants')
    expect(stored('known')?.categoryConfidence).toBe(1)
  })

  it('prefers a merchant override over stale stored rows of the same merchant', async () => {
    replaceMerchantCategoryOverrides({
      'cafe brasilero': {
        merchantName: 'CAFE BRASILERO',
        category: 'restaurants',
        updatedAt: '',
      },
    })
    const { repo } = signedIn([
      makeTransaction('stale', {
        ...quiet,
        description: 'TST CAFE BRASILERO',
        category: 'shopping',
        categoryConfidence: 0.8,
      }),
      makeTransaction('target', {
        ...quiet,
        description: 'CAFE BRASILERO 2',
        category: undefined,
        categoryConfidence: undefined,
      }),
    ])

    await autoCategorize(repo, ['target'])

    expect(stored('target')?.category).toBe('restaurants')
  })

  it('does not spread an ignored pseudo-category by similarity', async () => {
    const { repo } = signedIn([
      makeTransaction('ignored', {
        ...quiet,
        description: 'ZZZ FOO 1',
        category: 'ignored',
        categoryConfidence: 1,
      }),
      makeTransaction('target', {
        ...quiet,
        description: 'ZZZ FOO 2',
        category: undefined,
        categoryConfidence: undefined,
      }),
    ])

    const result = await autoCategorize(repo, ['target'])

    expect(result.categorized).toBe(0)
    expect(stored('target')?.category).toBeUndefined()
  })
})

describe('transaction-mutations — delete and undo', () => {
  const abc = () => [
    makeTransaction('a'),
    makeTransaction('b'),
    makeTransaction('c'),
  ]

  it('soft-deletes the selected rows, reversibly', async () => {
    const { repo } = signedIn(abc())

    const result = await deleteTransactions(repo, ['a', 'b'])

    expect(result.reversible).toBe(true)
    expect(result.removed.map((tx) => tx.id)).toEqual(['a', 'b'])
    expect(storedIds()).toEqual(['c'])
    expect(repo.isDeleted('a')).toBe(true)
    expect(repo.isDeleted('c')).toBe(false)
  })

  it('undo restores the rows on both sides', async () => {
    const { repo } = signedIn(abc())
    const { removed } = await deleteTransactions(repo, ['a', 'b'])

    const result = await restoreDeleted(removed)

    expect(result.restored).toBe(2)
    expect(repo.requests.restore).toBe(1)
    expect(storedIds().sort()).toEqual(['a', 'b', 'c'])
    expect(repo.isDeleted('a')).toBe(false)
  })

  it('does not put rows back locally when the restore fails', async () => {
    const { repo } = signedIn(abc())
    const { removed } = await deleteTransactions(repo, ['a'])
    repo.failOn('restore', { error: new Error('timeout') })

    await expect(restoreDeleted(removed)).rejects.toThrow('timeout')
    expect(stored('a')).toBeUndefined()
  })

  it('refuses an undo it did not hand out', async () => {
    const { repo } = signedIn(abc())

    await expect(restoreDeleted([makeTransaction('a')])).rejects.toThrow(
      'Ya no se puede deshacer'
    )
    expect(repo.requests.restore).toBeUndefined()
  })

  it('rejects a delete whose write fails and keeps the row', async () => {
    const { repo } = signedIn(abc())
    repo.failOn('softDelete', { error: new Error('timeout') })

    await expect(deleteTransactions(repo, ['a'])).rejects.toThrow('timeout')
    expect(stored('a')).toBeDefined()
    expect(repo.isDeleted('a')).toBe(false)
  })

  it('removes exactly the chunks that were deleted, keeps undo for them and retries the rest', async () => {
    const { repo } = signedIn(many(150))
    repo.failOn('softDelete', {
      when: (chunk) => chunk.includes('tx-120'),
      times: 1,
    })
    const ids = many(150).map((t) => t.id)

    const error = (await deleteTransactions(repo, ids).catch(
      (e: unknown) => e
    )) as PartialWriteError<DeleteResult>

    expect(error.message).toBe('Se eliminaron 100 de 150')
    expect(transactionStore.getState().transactions).toHaveLength(50)
    expect(repo.rows()).toHaveLength(50)
    expect(error.result?.removed).toHaveLength(100)
    expect(error.cause).toBeInstanceOf(Error)

    const retried = (await error.retry!()) as DeleteResult
    expect(transactionStore.getState().transactions).toHaveLength(0)
    expect(repo.rows()).toHaveLength(0)
    expect(retried.removed).toHaveLength(50)

    // Both parts can be undone, each by the user who deleted it.
    await restoreDeleted(error.result!.removed)
    expect(repo.rows()).toHaveLength(100)
    await restoreDeleted(retried.removed)
    expect(repo.rows()).toHaveLength(150)
    expect(transactionStore.getState().transactions).toHaveLength(150)
  })
})

describe('transaction-mutations — split and unsplit', () => {
  const parts = [
    { description: 'Comida', amount: 600, category: 'groceries' },
    { description: 'Bebida', amount: 400, category: 'restaurants' },
  ]
  const parent = () => [makeTransaction('parent', { amount: 1000 })]

  it('marks the parent and adds the parts on both sides', async () => {
    const { repo } = signedIn(parent())

    const result = await splitTransaction(repo, 'parent', parts)

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
    const { repo } = signedIn(parent())
    repo.failOn('splitParts', { error: new Error('no se pudo') })

    await expect(splitTransaction(repo, 'parent', parts)).rejects.toThrow(
      'no se pudo'
    )

    expect(stored('parent')?.isSplitParent).toBeFalsy()
    expect(storedIds()).toEqual(['parent'])
    expect(repo.rows().map((t) => t.id)).toEqual(['parent'])
  })

  it('takes the parts back when the parent cannot be marked (#60)', async () => {
    const { repo } = signedIn(parent())
    repo.failOn('splitMark', { error: new Error('timeout') })

    await expect(splitTransaction(repo, 'parent', parts)).rejects.toThrow(
      'timeout'
    )

    expect(repo.rows().map((t) => t.id)).toEqual(['parent'])
    expect(storedIds()).toEqual(['parent'])
  })

  it('shows parent and parts as the server has them when taking the parts back fails (#60)', async () => {
    const { repo } = signedIn(parent())
    repo.failOn('splitMark')
    repo.failOn('splitUndo')

    const error = (await splitTransaction(repo, 'parent', parts).catch(
      (e: unknown) => e
    )) as UserFacingError
    expect(error.message).toMatch(/partes/)
    expect(error.cause).toBeInstanceOf(Error)

    // Never a split parent without parts: both visible, parts deletable.
    expect(stored('parent')?.isSplitParent).toBeFalsy()
    expect(stored('parent_split_0')).toBeDefined()
    expect(repo.row('parent')?.isSplitParent).toBeFalsy()
    expect(repo.row('parent_split_0')).toBeDefined()
  })

  it('refuses a split another device already made, and leaves its parts alone', async () => {
    const { repo } = signedIn(parent())
    // Device 1 splits 1000 into 600 + 400.
    await splitTransaction(repo, 'parent', parts)
    // Device 2 still shows the parent unsplit and splits it 900 + 100.
    transactionStore.getState().setTransactions(parent())

    await expect(
      splitTransaction(repo, 'parent', [
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
    const { repo } = signedIn(parent())
    await splitTransaction(repo, 'parent', parts)
    transactionStore.getState().setTransactions(parent())
    repo.failOn('splitMark')

    await splitTransaction(repo, 'parent', parts).catch(() => undefined)

    expect(repo.row('parent')?.isSplitParent).toBe(true)
    expect(repo.row('parent_split_0')?.amount).toBe(600)
  })

  it('unsplits on both sides, removing every part', async () => {
    const { repo } = signedIn(parent())
    await splitTransaction(repo, 'parent', parts)

    await unsplitTransaction(repo, 'parent')

    expect(storedIds()).toEqual(['parent'])
    expect(stored('parent')?.isSplitParent).toBe(false)
    expect(repo.rows().map((t) => t.id)).toEqual(['parent'])
    expect(repo.row('parent')?.isSplitParent).toBe(false)
  })

  it('leaves both sides split when the parts cannot be deleted', async () => {
    const { repo } = signedIn(parent())
    await splitTransaction(repo, 'parent', parts)
    repo.failOn('unsplitParts', { error: new Error('timeout') })

    await expect(unsplitTransaction(repo, 'parent')).rejects.toThrow('timeout')
    expect(stored('parent')?.isSplitParent).toBe(true)
    expect(repo.row('parent')?.isSplitParent).toBe(true)
    expect(storedIds()).toHaveLength(3)
  })

  it('shows the parent unmarked with its parts when the unsplit cannot be undone', async () => {
    const { repo } = signedIn(parent())
    await splitTransaction(repo, 'parent', parts)
    repo.failOn('unsplitParts')
    repo.failOn('unsplitRemark')

    await expect(unsplitTransaction(repo, 'parent')).rejects.toThrow(/partes/)
    expect(stored('parent')?.isSplitParent).toBe(false)
    expect(stored('parent_split_0')).toBeDefined()
  })

  it('needs confirmation, then soft-deletes the parent and hard-deletes its parts', async () => {
    const { repo } = signedIn(parent())
    await splitTransaction(repo, 'parent', parts)

    await expect(deleteTransactions(repo, ['parent'])).rejects.toThrow(
      NeedsConfirmationError
    )
    expect(repo.requests.softDelete).toBeUndefined()

    const result = await deleteTransactions(repo, ['parent'], {
      allowIrreversible: true,
    })

    expect(result.reversible).toBe(false)
    expect(storedIds()).toEqual([])
    expect(repo.isDeleted('parent')).toBe(true)
    expect(repo.has('parent_split_0')).toBe(false)
  })

  it('keeps leftover parts visible and retries them when their delete fails', async () => {
    const { repo } = signedIn(parent())
    await splitTransaction(repo, 'parent', parts)
    repo.failOn('hardDelete', { times: 1 })

    const error = (await deleteTransactions(repo, ['parent'], {
      allowIrreversible: true,
    }).catch((e: unknown) => e)) as PartialWriteError

    expect(error).toBeInstanceOf(PartialWriteError)
    expect(stored('parent')).toBeUndefined()
    expect(stored('parent_split_0')).toBeDefined()
    expect(repo.row('parent_split_0')).toBeDefined()

    await error.retry!()
    expect(storedIds()).toEqual([])
    expect(repo.has('parent_split_0')).toBe(false)
  })

  it('needs confirmation, then hard-deletes a single part', async () => {
    const { repo } = signedIn(parent())
    await splitTransaction(repo, 'parent', parts)

    await expect(deleteTransactions(repo, ['parent_split_1'])).rejects.toThrow(
      NeedsConfirmationError
    )
    await deleteTransactions(repo, ['parent_split_1'], {
      allowIrreversible: true,
    })

    expect(storedIds()).toEqual(['parent', 'parent_split_0'])
    expect(repo.has('parent_split_1')).toBe(false)
    expect(repo.requests.softDelete).toBeUndefined()
  })
})

describe('transaction-mutations — applying a new rule to past rows', () => {
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
    const { repo } = signedIn(rows())

    const result = await applyPatternToPast(repo, rule)

    expect(result).toEqual({ updated: 2, failed: 0 })
    expect(repo.row('a')).toMatchObject({
      category: 'transport',
      categoryConfidence: 0.95,
    })
    expect(stored('c')?.category).toBe('groceries')
    expect(stored('part')?.category).toBe('restaurants')
  })

  it('keeps and counts only the rows that saved when a chunk fails', async () => {
    const { repo } = signedIn(rows())
    repo.failOn('update')

    const result = await applyPatternToPast(repo, rule)

    expect(result).toEqual({ updated: 0, failed: 2 })
    expect(stored('a')?.category).toBe('groceries')
  })
})

describe('transaction-mutations — switching accounts mid-write', () => {
  it("never lets user A's write land in user B's store", async () => {
    const { repo } = signedIn([makeTransaction('a')])
    const gate = repo.hold('update')
    const pending = bulkCategorize(repo, ['a'], 'food').catch((e: unknown) => e)
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
    const { repo } = signedIn()
    const gate = repo.hold('insert')
    const pending = importTransactions(repo, [makeTransaction('a')]).catch(
      (e: unknown) => e
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    workspaceStore.setState({ userId: 'user-b', status: 'ready' })
    transactionStore.getState().setTransactions([])
    gate.release()
    await pending

    expect(storedIds()).toEqual([])
  })

  it('does not report the refused close of a run when the account changed mid-import', async () => {
    const { repo } = signedIn()
    repo.failOn('insert', {
      when: () => {
        workspaceStore.setState({ userId: 'user-b', status: 'ready' })
        return true
      },
    })
    repo.failOn('failImportRun')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await importTransactions(
      repo,
      [makeTransaction('a')],
      makeImportContext()
    ).catch(() => {})

    expect(reporting.captureError).not.toHaveBeenCalled()
  })

  it('does not report the refused completion of a run when the account changed', async () => {
    const { repo } = signedIn()
    repo.failOn('completeImportRun', {
      when: () => {
        workspaceStore.setState({ userId: 'user-b', status: 'ready' })
        return true
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await importTransactions(
      repo,
      [makeTransaction('a')],
      makeImportContext()
    ).catch(() => {})

    expect(reporting.captureError).not.toHaveBeenCalled()
  })

  it("refuses A's undo once B is signed in, before sending anything", async () => {
    const { repo } = signedIn([makeTransaction('a')])
    const { removed } = await deleteTransactions(repo, ['a'])

    workspaceStore.setState({ userId: 'user-b', status: 'ready' })
    transactionStore.getState().setTransactions([])

    await expect(restoreDeleted(removed)).rejects.toThrow(UserFacingError)
    expect(repo.requests.restore).toBeUndefined()
    expect(storedIds()).toEqual([])
  })
})
