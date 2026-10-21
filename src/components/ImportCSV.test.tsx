import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportCSV } from './ImportCSV'
import { StatementReadError } from '../utils/user-error'
import { useTransactionHandlers } from '../hooks/useTransactionHandlers'
import { AiError } from '../services/ai/ai-error'
import {
  importStatement,
  type ImportStatementOptions,
  type StatementFile,
  type StatementImportResult,
} from '../services/import/import-statement'
import { createInMemoryRepository } from '../services/repository/in-memory-repository'
import { transactionStore } from '../stores/transaction-store'
import { workspaceStore } from '../stores/workspace-state'
import type { Transaction } from '../models'

// The dialog picks a file, hands its bytes to the import, and reports what
// came back. What the import does with them is tested at its own interface
// (services/import/import-statement.test.ts); here the import is a test
// double, except in "the real import", which runs it over the in-memory
// repository to check the double's assumptions.

const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: toastMock }))
const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('../services/monitoring/error-reporting', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../services/monitoring/error-reporting')
  >()),
  captureError: reporting.captureError,
}))

const OriginalFileReader = globalThis.FileReader

class SuccessfulFileReaderMock {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: (() => void) | null = null

  result: ArrayBuffer | null = null

  readAsArrayBuffer() {
    this.result = new TextEncoder().encode('mock-csv-content').buffer
    this.onload?.({} as ProgressEvent<FileReader>)
  }
}

class DeferredFileReaderMock {
  static instances: DeferredFileReaderMock[] = []
  result: ArrayBuffer | null = null
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    DeferredFileReaderMock.instances.push(this)
  }

  readAsArrayBuffer() {}
}

class FailingFileReaderMock {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: (() => void) | null = null

  readAsArrayBuffer() {
    this.onerror?.()
  }
}

function makeTx(id: string): Transaction {
  return {
    id,
    date: new Date('2026-01-01T00:00:00.000Z'),
    description: `tx ${id}`,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }
}

type Importer = (
  file: StatementFile,
  options: ImportStatementOptions
) => Promise<StatementImportResult>

function result(
  overrides: Partial<StatementImportResult> = {}
): StatementImportResult {
  return {
    added: [],
    duplicates: [],
    previouslyDeleted: [],
    repaired: [],
    fileType: 'bank_account_uyu',
    month: { y: 2026, m: 0 },
    ...overrides,
  }
}

// Test doubles of the import, one per outcome, mirroring its contract: a file
// it could not read rejects with a StatementReadError; anything else it
// rejects with happened while saving (after reporting progress, onParsed).
const parsedThen = (overrides: Partial<StatementImportResult> = {}) =>
  vi.fn<Parameters<Importer>, ReturnType<Importer>>(
    async (_file, { onParsed }) => {
      onParsed?.()
      return result(overrides)
    }
  )
const failsToRead = (error: StatementReadError) =>
  vi.fn<Parameters<Importer>, ReturnType<Importer>>(async () => {
    throw error
  })
// Rejects before reporting progress with something other than a read error.
const failsUnexpectedly = (error: unknown) =>
  vi.fn<Parameters<Importer>, ReturnType<Importer>>(async () => {
    throw error
  })
const failsToSave = (error: unknown) =>
  vi.fn<Parameters<Importer>, ReturnType<Importer>>(
    async (_file, { onParsed }) => {
      onParsed?.()
      throw error
    }
  )

function pick(name = 'movements.csv', content: BlobPart = 'a,b') {
  fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
    target: { files: [new File([content], name, { type: 'text/csv' })] },
  })
}

// A line of the import summary, e.g. "2 nuevas" (count and label are
// separate elements).
const isSummaryLine = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'LI' && el.textContent === text
const summaryLine = (text: string) => screen.getByText(isSummaryLine(text))
const findSummaryLine = (text: string) => screen.findByText(isSummaryLine(text))

describe('ImportCSV', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    DeferredFileReaderMock.instances = []
    globalThis.FileReader =
      SuccessfulFileReaderMock as unknown as typeof FileReader
  })

  afterEach(() => {
    globalThis.FileReader = OriginalFileReader
  })

  describe('choosing a file by keyboard (#193)', () => {
    it('Tab reaches "Seleccionar archivo" and Enter opens the file chooser', async () => {
      const user = userEvent.setup()
      render(<ImportCSV onTransactionsImported={parsedThen()} />)
      const input = screen.getByLabelText('Seleccionar archivo')
      const click = vi.spyOn(input, 'click').mockImplementation(() => {})
      const button = screen.getByText('Seleccionar archivo')

      await user.tab()
      expect(button).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('Space on the focused button opens the file chooser too', async () => {
      const user = userEvent.setup()
      render(<ImportCSV onTransactionsImported={parsedThen()} />)
      const input = screen.getByLabelText('Seleccionar archivo')
      const click = vi.spyOn(input, 'click').mockImplementation(() => {})

      await user.tab()
      await user.keyboard(' ')
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('does not promise a clickable drop zone', () => {
      render(<ImportCSV onTransactionsImported={parsedThen()} />)
      expect(
        screen.queryByText('o hacé clic para seleccionar')
      ).not.toBeInTheDocument()
    })
  })

  describe('copy and states (#204)', () => {
    it('uses sentence case and the copy guide’s account names', () => {
      render(<ImportCSV onTransactionsImported={parsedThen()} />)

      expect(
        screen.getByRole('heading', { name: 'Importar transacciones' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Tarjeta de crédito' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Cuenta USD' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Cuenta $U' })
      ).toBeInTheDocument()
    })

    it('says "Importando…" while a valid file’s rows are being saved', async () => {
      const saving = vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        (_file, { onParsed }) => {
          onParsed?.()
          return new Promise<never>(() => {})
        }
      )
      render(<ImportCSV onTransactionsImported={saving} />)

      pick()

      expect(await screen.findByText('Importando…')).toBeInTheDocument()
      expect(screen.queryByText('Validando archivo…')).not.toBeInTheDocument()
    })

    it('titles a save failure "No se pudo importar", not a validation error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      render(
        <ImportCSV
          onTransactionsImported={failsToSave(new Error('network down'))}
        />
      )

      pick()

      expect(await screen.findByText('No se pudo importar')).toBeInTheDocument()
      expect(
        screen.getByText('No se pudo guardar la importación')
      ).toBeInTheDocument()
      expect(
        screen.queryByText('Error al validar archivo')
      ).not.toBeInTheDocument()
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
    })

    it('labels the account type of a successful import in sentence case', async () => {
      render(
        <ImportCSV
          onTransactionsImported={parsedThen({
            fileType: 'credit_card',
            added: [makeTx('tx-1')],
          })}
        />
      )

      pick('card.csv')

      await screen.findByText('Importación completada')
      expect(screen.getAllByText('Tarjeta de crédito')).toHaveLength(2)
    })
  })

  it('rejects non-csv files before reading them', () => {
    const importer = parsedThen()
    render(<ImportCSV onTransactionsImported={importer} />)

    pick('notes.txt', 'x')

    expect(screen.getByText('Error al validar archivo')).toBeInTheDocument()
    expect(
      screen.getByText('El archivo debe estar en formato CSV')
    ).toBeInTheDocument()
    expect(importer).not.toHaveBeenCalled()
  })

  it('accepts a .CSV extension in upper case', async () => {
    const importer = parsedThen({ added: [makeTx('tx-1')] })
    render(<ImportCSV onTransactionsImported={importer} />)

    pick('MOVIMIENTOS.CSV')

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(importer).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'MOVIMIENTOS.CSV' }),
      expect.anything()
    )
  })

  it("hands the file's bytes to the import undecoded (#192)", async () => {
    // "Descripción,PEÑAROL" in Latin-1, as Santander exports it: the import
    // decides the encoding, so the dialog must not read it as text.
    const LATIN1 = new Uint8Array([
      0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0x70, 0x63, 0x69, 0xf3, 0x6e, 0x2c,
      0x50, 0x45, 0xd1, 0x41, 0x52, 0x4f, 0x4c,
    ])
    // jsdom's real FileReader reads the File's bytes.
    globalThis.FileReader = OriginalFileReader
    const importer = parsedThen()
    render(<ImportCSV onTransactionsImported={importer} />)

    pick('movements.csv', LATIN1 as BlobPart)

    await waitFor(() => expect(importer).toHaveBeenCalledTimes(1))
    const [file] = importer.mock.calls[0]
    expect(file.fileName).toBe('movements.csv')
    expect(Array.from(new Uint8Array(file.bytes))).toEqual(Array.from(LATIN1))
  })

  it('shows parser errors and does not navigate', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onViewTransactions = vi.fn()
    render(
      <ImportCSV
        onViewTransactions={onViewTransactions}
        onTransactionsImported={failsToRead(
          new StatementReadError('Fila 17: Importe ilegible: "abc"')
        )}
      />
    )

    pick()

    expect(
      await screen.findByText('Error al validar archivo')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Fila 17: Importe ilegible: "abc"')
    ).toBeInTheDocument()
    expect(onViewTransactions).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
  })

  it('never shows the raw text of an unexpected failure while saving', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ImportCSV
        onTransactionsImported={failsToSave(
          new TypeError("Cannot read properties of undefined (reading 'id')")
        )}
      />
    )

    pick()

    expect(
      await screen.findByText('No se pudo guardar la importación')
    ).toBeInTheDocument()
    expect(screen.queryByText(/Cannot read/)).not.toBeInTheDocument()
    expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
  })

  it('reports a parser crash to Sentry once, as a parse failure', async () => {
    const bug = new TypeError(
      "Cannot read properties of undefined (reading 'trim')"
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ImportCSV
        onTransactionsImported={failsToRead(
          new StatementReadError(
            'No se pudo leer el archivo. Revisá que sea un extracto CSV de Santander.',
            { cause: bug }
          )
        )}
      />
    )

    pick()

    expect(
      await screen.findByText(
        'No se pudo leer el archivo. Revisá que sea un extracto CSV de Santander.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Error al validar archivo')).toBeInTheDocument()
    // Error reporting sends the explained error's cause: the crash itself.
    expect(reporting.captureError).toHaveBeenCalledTimes(1)
    expect(reporting.captureError).toHaveBeenCalledWith(
      expect.objectContaining({ cause: bug }),
      'import-parse'
    )
  })

  it('treats a failure before any progress that is not a read error as a save failure', async () => {
    // Signed out: the handler refuses before the file is even parsed.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function SignedOutImport() {
      const { handleTransactionsImported } = useTransactionHandlers({
        repository: null,
        setError: () => {},
      })
      return <ImportCSV onTransactionsImported={handleTransactionsImported} />
    }
    render(<SignedOutImport />)

    pick()

    expect(await screen.findByText('No se pudo importar')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Tu sesión terminó. Iniciá sesión de nuevo para guardar cambios.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Error al validar archivo')
    ).not.toBeInTheDocument()
    expect(reporting.captureError).toHaveBeenCalledTimes(1)
    expect(reporting.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      'import'
    )
  })

  it('reports a save failure to Sentry once, as an import failure', async () => {
    const failure = new Error('network down')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ImportCSV onTransactionsImported={failsToSave(failure)} />)

    pick()

    await screen.findByText('No se pudo importar')
    expect(reporting.captureError).toHaveBeenCalledTimes(1)
    expect(reporting.captureError).toHaveBeenCalledWith(failure, 'import')
  })

  it('shows file read errors and does not import', async () => {
    globalThis.FileReader =
      FailingFileReaderMock as unknown as typeof FileReader
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const importer = parsedThen()
    render(<ImportCSV onTransactionsImported={importer} />)

    pick()

    expect(
      await screen.findByText('Error al validar archivo')
    ).toBeInTheDocument()
    expect(screen.getByText('Error al leer el archivo')).toBeInTheDocument()
    expect(importer).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
  })

  it('treats a file the browser cannot read as a read error', async () => {
    const unreadable = new DOMException(
      'The file could not be read',
      'NotReadableError'
    )
    const file = new File(['a,b'], 'movements.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.reject(unreadable),
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const importer = parsedThen()
    render(<ImportCSV onTransactionsImported={importer} />)

    fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
      target: { files: [file] },
    })

    expect(
      await screen.findByText('Error al validar archivo')
    ).toBeInTheDocument()
    expect(screen.getByText('Error al leer el archivo')).toBeInTheDocument()
    expect(importer).not.toHaveBeenCalled()
    expect(reporting.captureError).toHaveBeenCalledWith(
      expect.objectContaining({ cause: unreadable }),
      'import-parse'
    )
  })

  it('reports an unexpected failure before progress as an import failure', async () => {
    // e.g. a categorizer bug: the file was fine, the app was not.
    const bug = new TypeError(
      "Cannot read properties of undefined (reading 'type')"
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ImportCSV onTransactionsImported={failsUnexpectedly(bug)} />)

    pick()

    expect(await screen.findByText('No se pudo importar')).toBeInTheDocument()
    expect(
      screen.getByText('No se pudo guardar la importación')
    ).toBeInTheDocument()
    expect(reporting.captureError).toHaveBeenCalledTimes(1)
    expect(reporting.captureError).toHaveBeenCalledWith(bug, 'import')
  })

  it('treats a reader that returns no bytes as a read error', async () => {
    globalThis.FileReader = class {
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null
      onerror: (() => void) | null = null
      result: string | null = null
      readAsArrayBuffer() {
        this.onload?.({} as ProgressEvent<FileReader>)
      }
    } as unknown as typeof FileReader
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const importer = parsedThen()
    render(<ImportCSV onTransactionsImported={importer} />)

    pick()

    expect(
      await screen.findByText('Error al validar archivo')
    ).toBeInTheDocument()
    expect(screen.getByText('Error al leer el archivo')).toBeInTheDocument()
    expect(importer).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
  })

  it('shows validating state while file is being processed', async () => {
    globalThis.FileReader =
      DeferredFileReaderMock as unknown as typeof FileReader
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          added: [makeTx('tx-1'), makeTx('tx-2'), makeTx('tx-3')],
        })}
      />
    )

    pick()

    expect(screen.getByText('Validando archivo…')).toBeInTheDocument()

    const reader = DeferredFileReaderMock.instances[0]
    await act(async () => {
      reader.result = new TextEncoder().encode('a,b').buffer
      reader.onload?.({} as ProgressEvent<FileReader>)
    })

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
  })

  it('reports new rows and duplicates without leaving the dialog', async () => {
    const onViewTransactions = vi.fn()
    const importer = parsedThen({
      added: [makeTx('tx-1')],
      duplicates: [makeTx('tx-2'), makeTx('tx-3')],
    })
    render(
      <ImportCSV
        onTransactionsImported={importer}
        onViewTransactions={onViewTransactions}
      />
    )

    pick()

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(summaryLine('1 nueva')).toBeInTheDocument()
    expect(summaryLine('2 duplicadas omitidas')).toBeInTheDocument()
    expect(importer).toHaveBeenCalledTimes(1)
    // Navigating is the user's choice ("Ver transacciones"), never automatic.
    expect(onViewTransactions).not.toHaveBeenCalled()
  })

  it('warns that AI categorization failed while still reporting a successful import', async () => {
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          added: [makeTx('tx-1'), makeTx('tx-2')],
          duplicates: [makeTx('tx-3')],
          aiError: new AiError('auth'),
        })}
      />
    )

    pick()

    // The import still succeeded ...
    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(summaryLine('2 nuevas')).toBeInTheDocument()
    expect(summaryLine('1 duplicada omitida')).toBeInTheDocument()

    // ... but the user is told the AI step did not run, and why.
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1))
    // Translated: the raw SDK text never reaches the user.
    expect(toastMock.warning.mock.calls[0][0]).toContain(
      'la clave API de Anthropic no es válida'
    )
    expect(toastMock.warning.mock.calls[0][0]).not.toContain('x-api-key')
  })

  it('tells the user deleted rows were skipped, with the right plural', async () => {
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          added: [makeTx('tx-1')],
          previouslyDeleted: [makeTx('tx-2')],
        })}
      />
    )

    pick()

    expect(await findSummaryLine('1 eliminada antes')).toBeInTheDocument()
    expect(summaryLine('1 nueva')).toBeInTheDocument()
    expect(summaryLine('0 duplicadas omitidas')).toBeInTheDocument()
  })

  it('says how many garbled descriptions the import repaired', async () => {
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          duplicates: [makeTx('tx-3')],
          repaired: [makeTx('tx-1'), makeTx('tx-2')],
        })}
      />
    )

    pick()

    // Nothing new, but the import did something: say what (#202).
    expect(
      await screen.findByRole('heading', {
        name: 'No había movimientos nuevos',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Este archivo ya estaba importado.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Se corrigieron 2 descripciones.')
    ).toBeInTheDocument()
    expect(summaryLine('2 corregidas')).toBeInTheDocument()
    expect(summaryLine('1 duplicada omitida')).toBeInTheDocument()
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('lists a repaired description in the summary of a successful import', async () => {
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          added: [makeTx('tx-2')],
          repaired: [makeTx('tx-1')],
        })}
      />
    )

    pick()

    expect(
      await screen.findByRole('heading', { name: 'Importación completada' })
    ).toBeInTheDocument()
    expect(summaryLine('1 corregida')).toBeInTheDocument()
    expect(screen.queryByText(/Se corrigi/)).not.toBeInTheDocument()
  })

  it('warns when some garbled descriptions could not be repaired', async () => {
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          added: [makeTx('tx-1')],
          repairsFailed: 2,
        })}
      />
    )

    pick()

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled())
    expect(toastMock.warning.mock.calls[0][0]).toBe(
      'No se pudieron corregir 2 descripciones. Importá el archivo de nuevo para reintentar.'
    )
  })

  it('does not warn about AI when the import reports no AI failure', async () => {
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({ added: [makeTx('tx-1')] })}
      />
    )

    pick()

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(toastMock.warning).not.toHaveBeenCalled()
  })

  it('suggests a smaller file when the AI answer was cut off', async () => {
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          added: [makeTx('tx-1')],
          aiError: new AiError('truncated'),
        })}
      />
    )

    pick()

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Categorización con IA no disponible: la respuesta del modelo quedó truncada (límite de tokens alcanzado); probá importar menos transacciones a la vez. Se usaron las reglas de categorización.'
      )
    )
  })

  it('warns about an AI failure even when its message is empty', async () => {
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          added: [makeTx('tx-1')],
          aiError: new Error(''),
        })}
      />
    )

    pick()

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Categorización con IA no disponible: error inesperado del servicio de IA. Se usaron las reglas de categorización.'
      )
    )
  })

  it('says the AI run was incomplete, not unavailable, on a partial failure', async () => {
    // "no disponible" would be plainly wrong when 10 of 12 batches enriched.
    render(
      <ImportCSV
        onTransactionsImported={parsedThen({
          added: [makeTx('tx-1')],
          aiPartial:
            '2 de 12 lotes fallaron (el servicio de IA no está disponible en este momento)',
        })}
      />
    )

    pick()

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1))
    expect(toastMock.warning).toHaveBeenCalledWith(
      'Categorización con IA incompleta: 2 de 12 lotes fallaron (el servicio de IA no está disponible en este momento). El resto se categorizó con reglas.'
    )
  })

  describe('summary after an import (#202)', () => {
    function importFile(user: ReturnType<typeof userEvent.setup>) {
      return user.upload(
        screen.getByLabelText('Seleccionar archivo'),
        new File(['a,b'], 'movements.csv', { type: 'text/csv' })
      )
    }

    function summaryLines() {
      return within(
        screen.getByRole('list', { name: 'Resumen de la importación' })
      )
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    }

    it('stays open on the summary with the counts, without navigating away', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      render(
        <ImportCSV
          onTransactionsImported={parsedThen({
            added: [makeTx('a'), makeTx('b')],
            duplicates: [makeTx('c')],
            previouslyDeleted: [makeTx('d')],
          })}
          onViewTransactions={onViewTransactions}
        />
      )

      await importFile(user)

      const heading = await screen.findByRole('heading', {
        name: 'Importación completada',
      })
      expect(heading).toHaveFocus()
      expect(summaryLines()).toEqual([
        '2 nuevas',
        '1 duplicada omitida',
        '1 eliminada antes',
      ])
      expect(onViewTransactions).not.toHaveBeenCalled()
      // The dialog reports the counts; a toast saying the same is noise.
      expect(toastMock.success).not.toHaveBeenCalled()
    })

    it('"Ver transacciones" goes to the month the import names', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      render(
        <ImportCSV
          onTransactionsImported={parsedThen({
            added: [makeTx('a')],
            month: { y: 2026, m: 2 },
          })}
          onViewTransactions={onViewTransactions}
        />
      )

      await importFile(user)
      await user.click(
        await screen.findByRole('button', { name: 'Ver transacciones' })
      )

      expect(onViewTransactions).toHaveBeenCalledTimes(1)
      expect(onViewTransactions).toHaveBeenCalledWith({
        period: { mode: 'month', y: 2026, m: 2 },
      })
    })

    it('a file with nothing new is a neutral state, not a success', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      render(
        <ImportCSV
          onTransactionsImported={parsedThen({
            duplicates: [makeTx('a'), makeTx('b')],
            month: { y: 2025, m: 10 },
          })}
          onViewTransactions={onViewTransactions}
        />
      )

      await importFile(user)

      const heading = await screen.findByRole('heading', {
        name: 'No había movimientos nuevos',
      })
      expect(heading).toHaveFocus()
      expect(
        screen.getByText('Este archivo ya estaba importado.')
      ).toBeInTheDocument()
      expect(
        screen.queryByText('Importación completada')
      ).not.toBeInTheDocument()
      expect(summaryLines()).toEqual([
        '0 nuevas',
        '2 duplicadas omitidas',
        '0 eliminadas antes',
      ])

      // Still lets the user look at the file's month.
      await user.click(
        screen.getByRole('button', { name: 'Ver transacciones' })
      )
      expect(onViewTransactions).toHaveBeenCalledWith({
        period: { mode: 'month', y: 2025, m: 10 },
      })
    })

    it('"Importar otro archivo" goes back to the file picker', async () => {
      const user = userEvent.setup()
      render(
        <ImportCSV
          onTransactionsImported={parsedThen({ added: [makeTx('a')] })}
          onViewTransactions={vi.fn()}
        />
      )

      await importFile(user)
      await user.click(
        await screen.findByRole('button', { name: 'Importar otro archivo' })
      )

      expect(
        screen.queryByRole('list', { name: 'Resumen de la importación' })
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Seleccionar archivo' })
      ).toHaveFocus()
    })

    it('keeps a failed import in the dialog and never navigates', async () => {
      const user = userEvent.setup()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const onViewTransactions = vi.fn()
      render(
        <ImportCSV
          onTransactionsImported={failsToSave(new Error('network down'))}
          onViewTransactions={onViewTransactions}
        />
      )

      await importFile(user)

      expect(await screen.findByText('No se pudo importar')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Ver transacciones' })
      ).not.toBeInTheDocument()
      expect(onViewTransactions).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
    })
  })

  // The doubles above assume when the real import calls onParsed and what it
  // throws; these run it, over the in-memory repository, to keep them honest.
  describe('the real import', () => {
    function renderWithRealImport(
      onViewTransactions: (filter: unknown) => void = vi.fn()
    ) {
      // jsdom's real FileReader reads the File's bytes.
      globalThis.FileReader = OriginalFileReader
      transactionStore.getState().clearTransactions()
      const repo = createInMemoryRepository()
      workspaceStore.setState({ userId: repo.userId, status: 'ready' })
      render(
        <ImportCSV
          onViewTransactions={onViewTransactions}
          onTransactionsImported={(file, options) =>
            importStatement(repo, file, options)
          }
        />
      )
      return repo
    }

    afterEach(() => {
      transactionStore.getState().clearTransactions()
      workspaceStore.setState({ userId: null, status: 'idle' })
    })

    it('imports a Santander statement and opens its month', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      const repo = renderWithRealImport(onViewTransactions)
      const bytes = readFileSync(
        join(__dirname, '../../samples/UYUmovements.csv')
      )

      pick('UYUmovements.csv', new Uint8Array(bytes) as BlobPart)

      expect(
        await screen.findByRole('heading', { name: 'Importación completada' })
      ).toBeInTheDocument()
      expect(summaryLine('13 nuevas')).toBeInTheDocument()
      expect(screen.getAllByText('Cuenta $U')).toHaveLength(2)
      expect(repo.rows()).toHaveLength(13)

      await user.click(
        screen.getByRole('button', { name: 'Ver transacciones' })
      )
      expect(onViewTransactions).toHaveBeenCalledWith({
        period: { mode: 'month', y: 2025, m: 10 },
      })
    })

    it('explains in Spanish that another bank’s CSV is not recognized (#198)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const repo = renderWithRealImport()

      pick('other.csv', 'date,description,amount\n2026-01-01,Coffee,3.50\n')

      expect(
        await screen.findByText(
          'No reconocemos este archivo. Tatú importa extractos CSV de Santander Uruguay (tarjeta de crédito o caja de ahorro).'
        )
      ).toBeInTheDocument()
      expect(screen.getByText('Error al validar archivo')).toBeInTheDocument()
      expect(screen.queryByText(/Unable to detect/)).not.toBeInTheDocument()
      expect(repo.rows()).toEqual([])
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
    })

    it('says an empty file is empty (#198)', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      renderWithRealImport()

      pick('empty.csv', '')

      expect(
        await screen.findByText('El archivo está vacío.')
      ).toBeInTheDocument()
      expect(screen.getByText('Error al validar archivo')).toBeInTheDocument()
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
    })
  })
})
