import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importStatement, type StatementFile } from './import-statement'
import type { Transaction } from '../../models'
import { transactionStore } from '../../stores/transaction-store'
import { workspaceStore } from '../../stores/workspace-state'
import { createInMemoryRepository } from '../repository/in-memory-repository'
import { replaceDescriptionOverrides } from '../descriptions/description-overrides'
import { replaceMerchantCategoryOverrides } from '../categorizer/category-overrides'
import { replaceCustomPatterns } from '../categorizer/custom-patterns'
import { StatementReadError } from '../../utils/user-error'
import { parseCSV } from '../parsers/csv-parser'
import { categorizeParsedData } from '../categorizer/import-categorization'
import { sha256Hex } from '../supabase/import-runs'
import { decodeCsvBytes } from '../parsers/decode-csv'

// The whole import, from a statement file's bytes to rows saved through the
// repository and shown in the store. Real parsers, real categorizer, real
// sample files; persistence is the in-memory repository adapter.

// The real parser and categorizer, wrapped only so a test can make one crash
// the way a bug would (no real input does).
vi.mock('../parsers/csv-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../parsers/csv-parser')>()
  return { ...actual, parseCSV: vi.fn(actual.parseCSV) }
})
vi.mock('../categorizer/import-categorization', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../categorizer/import-categorization')
    >()
  return { ...actual, categorizeParsedData: vi.fn(actual.categorizeParsedData) }
})

const SAMPLES = join(__dirname, '../../../samples')
const sample = (name: string): StatementFile => ({
  bytes: readFileSync(join(SAMPLES, name)),
  fileName: name,
})

// A UYU account statement, as Santander exports it: Latin-1.
const HEADER = `Cliente,Test,
Cuenta,Ca De Ahorro Atm,
Número,007003529520,
Moneda,UYU,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,
`
const PENAROL =
  '24/11/2025,5,COMPRA CON TARJETA DEBITO PEÑAROL,ADMINISTRACIÓN,-900.00,,100.00,'
const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0))
const utf8 = (text: string) => new TextEncoder().encode(text)

function signedIn(rows: Transaction[] = []) {
  const repo = createInMemoryRepository({ transactions: rows })
  transactionStore.getState().setTransactions(rows)
  workspaceStore.setState({ userId: repo.userId, status: 'ready' })
  return repo
}

const storedIds = () =>
  transactionStore.getState().transactions.map((tx) => tx.id)

beforeEach(() => {
  transactionStore.getState().clearTransactions()
  replaceDescriptionOverrides({})
  replaceMerchantCategoryOverrides({})
  replaceCustomPatterns([])
  workspaceStore.setState({ userId: null, status: 'idle' })
})

describe('importStatement', () => {
  it('saves every row of a statement, categorized, and says what it was', async () => {
    const repo = signedIn()

    const result = await importStatement(repo, sample('UYUmovements.csv'))

    expect(result.fileType).toBe('bank_account_uyu')
    expect(result.added).toHaveLength(13)
    expect(result.duplicates).toEqual([])
    expect(repo.rows()).toHaveLength(13)
    // Screen mirrors database.
    expect(storedIds().sort()).toEqual(
      repo
        .rows()
        .map((tx) => tx.id)
        .sort()
    )
    // Categorized before anything sees the rows.
    const pedidosYa = repo
      .rows()
      .find((tx) => tx.description.includes('PEDIDOSYA'))
    expect(pedidosYa?.category).toBeDefined()
    expect(pedidosYa?.category).not.toBe('uncategorized')
  })

  it('records the import run with the file name, type and checksum', async () => {
    const repo = signedIn()
    const file = sample('USDmovements.csv')

    await importStatement(repo, file)

    expect(repo.importRuns).toHaveLength(1)
    expect(repo.importRuns[0]).toMatchObject({
      fileName: 'USDmovements.csv',
      fileType: 'bank_account_usd',
      status: 'completed',
    })
    // Of the decoded text, as before the pipeline moved here.
    expect(repo.importRuns[0].fileChecksum).toBe(
      await sha256Hex(decodeCsvBytes(file.bytes))
    )
  })

  it('names the month of the newest new row, not of the newest row', async () => {
    const repo = signedIn()
    await importStatement(repo, {
      bytes: latin1(HEADER + PENAROL + '\n'),
      fileName: 'UYU.csv',
    })
    const OCTOBER =
      '15/10/2025,6,COMPRA CON TARJETA DEBITO FARMACIA,,-300.00,,500.00,'

    const result = await importStatement(repo, {
      bytes: latin1(HEADER + PENAROL + '\n' + OCTOBER + '\n'),
      fileName: 'UYU.csv',
    })

    expect(result.added).toHaveLength(1)
    expect(result.month).toEqual({ y: 2025, m: 9 })
  })

  it('tells a credit card statement apart', async () => {
    const repo = signedIn()

    const result = await importStatement(
      repo,
      sample('CreditCardsMovementsDetail.csv')
    )

    expect(result.fileType).toBe('credit_card')
    expect(result.added.length).toBeGreaterThan(0)
  })

  it("names the file's newest month when nothing was new", async () => {
    const repo = signedIn()
    await importStatement(repo, sample('UYUmovements.csv'))

    const again = await importStatement(repo, sample('UYUmovements.csv'))

    expect(again.added).toEqual([])
    expect(again.duplicates).toHaveLength(13)
    expect(again.month).toEqual({ y: 2025, m: 10 })
    expect(repo.rows()).toHaveLength(13)
  })

  describe('file encoding (#192)', () => {
    it('reads a Latin-1 export with its accents', async () => {
      const repo = signedIn()

      await importStatement(repo, {
        bytes: latin1(HEADER + PENAROL + '\n'),
        fileName: 'UYU.csv',
      })

      expect(repo.rows().map((tx) => tx.description)).toEqual([
        'COMPRA CON TARJETA DEBITO PEÑAROL ADMINISTRACIÓN',
      ])
    })

    it('reads a UTF-8 export unchanged', async () => {
      const repo = signedIn()

      await importStatement(repo, {
        bytes: utf8(HEADER + PENAROL + '\n'),
        fileName: 'UYU.csv',
      })

      expect(repo.rows().map((tx) => tx.description)).toEqual([
        'COMPRA CON TARJETA DEBITO PEÑAROL ADMINISTRACIÓN',
      ])
    })

    it('repairs a row stored garbled by an earlier import, in place', async () => {
      // Before #192 a Latin-1 export was read as UTF-8: accents became U+FFFD.
      const repo = signedIn()
      const garbled = new TextDecoder('utf-8').decode(
        latin1(HEADER + PENAROL + '\n')
      )
      await importStatement(repo, { bytes: utf8(garbled), fileName: 'UYU.csv' })
      const [before] = repo.rows()
      expect(before.description).toContain('�')

      const result = await importStatement(repo, {
        bytes: latin1(HEADER + PENAROL + '\n'),
        fileName: 'UYU.csv',
      })

      expect(result.added).toEqual([])
      expect(result.repaired.map((tx) => tx.id)).toEqual([before.id])
      expect(repo.rows()).toHaveLength(1)
      expect(repo.row(before.id)?.description).toBe(
        'COMPRA CON TARJETA DEBITO PEÑAROL ADMINISTRACIÓN'
      )
    })
  })

  describe('read vs save failures', () => {
    it('rejects a file that is not a Santander statement as a read error, before saving anything', async () => {
      const repo = signedIn()

      const error = await importStatement(repo, {
        bytes: utf8('date,description,amount\n2026-01-01,Coffee,3.50\n'),
        fileName: 'other.csv',
      }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(StatementReadError)
      expect((error as Error).message).toBe(
        'No reconocemos este archivo. Tatú importa extractos CSV de Santander Uruguay (tarjeta de crédito o caja de ahorro).'
      )
      expect(repo.rows()).toEqual([])
      expect(repo.importRuns).toEqual([])
    })

    it('says an empty file is empty, as a read error', async () => {
      const repo = signedIn()

      const error = await importStatement(repo, {
        bytes: new Uint8Array(),
        fileName: 'empty.csv',
      }).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(StatementReadError)
      expect((error as Error).message).toBe('El archivo está vacío.')
    })

    it('turns a parser crash into a read error that keeps the crash as its cause', async () => {
      const repo = signedIn()
      const bug = new TypeError(
        "Cannot read properties of undefined (reading 'trim')"
      )
      vi.mocked(parseCSV).mockImplementationOnce(() => {
        throw bug
      })

      const error = await importStatement(
        repo,
        sample('UYUmovements.csv')
      ).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(StatementReadError)
      // Never the raw text of a bug.
      expect((error as Error).message).toBe(
        'No se pudo leer el archivo. Revisá que sea un extracto CSV de Santander.'
      )
      expect((error as StatementReadError).cause).toBe(bug)
      expect(repo.importRuns).toEqual([])
    })

    it('lets a categorizer crash through as itself: a bug, not a bad file', async () => {
      const repo = signedIn()
      const bug = new TypeError(
        "Cannot read properties of undefined (reading 'type')"
      )
      vi.mocked(categorizeParsedData).mockImplementationOnce(() => {
        throw bug
      })

      const error = await importStatement(
        repo,
        sample('UYUmovements.csv')
      ).catch((e: unknown) => e)

      expect(error).toBe(bug)
      expect(error).not.toBeInstanceOf(StatementReadError)
      expect(repo.importRuns).toEqual([])
    })

    it('reports progress once the file is understood, before the first write', async () => {
      const repo = signedIn()
      let runsWhenParsed = -1
      const onParsed = vi.fn(() => {
        runsWhenParsed = repo.importRuns.length
      })

      await importStatement(repo, sample('UYUmovements.csv'), { onParsed })

      expect(onParsed).toHaveBeenCalledTimes(1)
      expect(runsWhenParsed).toBe(0)
    })

    it('rejects with the save error itself, not a read error', async () => {
      const repo = signedIn()
      const failure = new Error('network down')
      repo.failOn('insert', { error: failure })

      const error = await importStatement(
        repo,
        sample('UYUmovements.csv')
      ).catch((e: unknown) => e)

      expect(error).toBe(failure)
      expect(error).not.toBeInstanceOf(StatementReadError)
      expect(repo.rows()).toEqual([])
      expect(storedIds()).toEqual([])
    })
  })
})
