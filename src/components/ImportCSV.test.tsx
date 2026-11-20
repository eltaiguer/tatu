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
import { useStore } from 'zustand'
import { ImportCSV } from './ImportCSV'
import {
  StatementReadError,
  UserFacingError,
  WorkspaceChangedError,
} from '../utils/user-error'
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
import { countReviewRows } from '../services/import/import-review'

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
    fileRange: null,
    fileRows: 0,
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

// A paragraph by its whole text (counts sit in their own elements).
const paragraph = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'P' && el.textContent === text

// The file's period line, e.g. "mar. 2025 – dic. 2025 · 64 movimientos".
const periodLine = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'P' && el.textContent === text

// A line of the import summary, e.g. "2 nuevas" (count and label are
// separate elements).
const isSummaryLine = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'LI' && el.textContent === text
const summaryLine = (text: string) => screen.getByText(isSummaryLine(text))
const findSummaryLine = (text: string) => screen.findByText(isSummaryLine(text))

function summaryLines() {
  return within(screen.getByRole('list', { name: 'Resumen de la importación' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)
}

// The dialog as App renders it: given the rows of the store.
function WithStoreRows(
  props: Omit<React.ComponentProps<typeof ImportCSV>, 'transactions'>
) {
  const transactions = useStore(transactionStore, (state) => state.transactions)
  return <ImportCSV transactions={transactions} {...props} />
}

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
      render(
        <ImportCSV transactions={[]} onTransactionsImported={parsedThen()} />
      )
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
      render(
        <ImportCSV transactions={[]} onTransactionsImported={parsedThen()} />
      )
      const input = screen.getByLabelText('Seleccionar archivo')
      const click = vi.spyOn(input, 'click').mockImplementation(() => {})

      await user.tab()
      await user.keyboard(' ')
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('does not promise a clickable drop zone', () => {
      render(
        <ImportCSV transactions={[]} onTransactionsImported={parsedThen()} />
      )
      expect(
        screen.queryByText('o hacé clic para seleccionar')
      ).not.toBeInTheDocument()
    })
  })

  describe('copy and states (#204)', () => {
    it('uses sentence case and the copy guide’s account names', () => {
      render(
        <ImportCSV transactions={[]} onTransactionsImported={parsedThen()} />
      )

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
      render(<ImportCSV transactions={[]} onTransactionsImported={saving} />)

      pick()

      expect(await screen.findByText('Importando…')).toBeInTheDocument()
      expect(screen.queryByText('Validando archivo…')).not.toBeInTheDocument()
    })

    it('titles a save failure "No se pudo importar", not a validation error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      render(
        <ImportCSV
          transactions={[]}
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
          transactions={[]}
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
    render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

    pick('notes.txt', 'x')

    expect(screen.getByText('Error al validar archivo')).toBeInTheDocument()
    expect(
      screen.getByText('El archivo debe estar en formato CSV')
    ).toBeInTheDocument()
    expect(importer).not.toHaveBeenCalled()
  })

  it('accepts a .CSV extension in upper case', async () => {
    const importer = parsedThen({ added: [makeTx('tx-1')] })
    render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

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
    render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
      return (
        <ImportCSV
          transactions={[]}
          onTransactionsImported={handleTransactionsImported}
        />
      )
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
    render(
      <ImportCSV
        transactions={[]}
        onTransactionsImported={failsToSave(failure)}
      />
    )

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
    render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

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
    render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

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
    render(
      <ImportCSV
        transactions={[]}
        onTransactionsImported={failsUnexpectedly(bug)}
      />
    )

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
    render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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
        transactions={[]}
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

    it('stays open on the summary with the counts, without navigating away', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      render(
        <ImportCSV
          transactions={[]}
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
        '0 a revisar · sin categoría o con poca seguridad',
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
          transactions={[]}
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
          transactions={[]}
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
          transactions={[]}
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
          transactions={[]}
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

  describe('what to review (#275)', () => {
    const RANGE = { from: '2025-03-04', to: '2025-12-20' }
    // Stored rows, as the store holds them after the import.
    function stored(id: string, overrides: Partial<Transaction> = {}) {
      return {
        ...makeTx(id),
        date: new Date('2025-06-01T00:00:00.000Z'),
        category: 'uncategorized',
        ...overrides,
      } satisfies Transaction
    }
    const clean = (id: string) =>
      stored(id, { category: 'groceries', categoryConfidence: 0.95 })

    function importFile(user: ReturnType<typeof userEvent.setup>) {
      return user.upload(
        screen.getByLabelText('Seleccionar archivo'),
        new File(['a,b'], 'movements.csv', { type: 'text/csv' })
      )
    }

    const view = (
      rows: Transaction[],
      overrides: Partial<StatementImportResult>,
      onViewTransactions = vi.fn()
    ) => {
      render(
        <ImportCSV
          transactions={rows}
          onTransactionsImported={parsedThen(overrides)}
          onViewTransactions={onViewTransactions}
        />
      )
      return onViewTransactions
    }

    it('says which period and how many movements the file holds', async () => {
      const user = userEvent.setup()
      view([], { fileRange: RANGE, fileRows: 64 })

      await importFile(user)

      expect(
        await screen.findByText(
          periodLine('mar. 2025 – dic. 2025 · 64 movimientos')
        )
      ).toBeInTheDocument()
    })

    it('uses the singular and one month for a one-movement file', async () => {
      const user = userEvent.setup()
      view([], {
        fileRange: { from: '2025-11-03', to: '2025-11-03' },
        fileRows: 1,
      })

      await importFile(user)

      expect(
        await screen.findByText(periodLine('nov. 2025 · 1 movimiento'))
      ).toBeInTheDocument()
    })

    it('counts what to review among the stored rows of the file', async () => {
      const user = userEvent.setup()
      const onViewTransactions = view(
        [stored('a'), stored('b'), stored('c'), clean('d')],
        {
          added: [makeTx('a'), makeTx('b'), makeTx('c'), makeTx('d')],
          fileRange: RANGE,
          fileRows: 4,
        }
      )

      await importFile(user)
      await screen.findByRole('heading', { name: 'Importación completada' })

      expect(summaryLines()).toContain(
        '3 a revisar · sin categoría o con poca seguridad'
      )
      await user.click(
        screen.getByRole('button', { name: 'Revisar 3 movimientos' })
      )
      expect(onViewTransactions).toHaveBeenCalledWith({
        review: true,
        accountType: 'bank_account',
        currency: 'UYU',
        period: { mode: 'range', ...RANGE },
      })
    })

    it('says "1 movimiento" for one row and makes Revisar the main action', async () => {
      const user = userEvent.setup()
      view([stored('a')], {
        added: [makeTx('a')],
        fileRange: RANGE,
        fileRows: 1,
      })

      await importFile(user)

      expect(
        await screen.findByRole('button', { name: 'Revisar 1 movimiento' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Ver transacciones' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Importar otro archivo' })
      ).toBeInTheDocument()
    })

    it("keeps today's buttons when nothing in the file needs review", async () => {
      const user = userEvent.setup()
      view([clean('a')], {
        added: [makeTx('a')],
        fileRange: RANGE,
        fileRows: 1,
      })

      await importFile(user)

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(summaryLines()).toContain(
        '0 a revisar · sin categoría o con poca seguridad'
      )
      expect(screen.queryByRole('button', { name: /^Revisar/ })).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Ver transacciones' })
      ).toBeInTheDocument()
    })

    it('does not offer Revisar for older rows the file did not add', async () => {
      const user = userEvent.setup()
      // An older uncategorized row inside the link's dates, not in this file.
      view([clean('a'), stored('old')], {
        added: [makeTx('a')],
        fileRange: RANGE,
        fileRows: 1,
      })

      await importFile(user)
      await screen.findByRole('heading', { name: 'Importación completada' })

      expect(screen.queryByRole('button', { name: /^Revisar/ })).toBeNull()
    })

    it('counts the rows the link opens, older ones included', async () => {
      const user = userEvent.setup()
      view([stored('a'), stored('old')], {
        added: [makeTx('a')],
        fileRange: RANGE,
        fileRows: 1,
      })

      await importFile(user)

      expect(
        await screen.findByRole('button', { name: 'Revisar 2 movimientos' })
      ).toBeInTheDocument()
      expect(summaryLines()).toContain(
        '1 a revisar · sin categoría o con poca seguridad'
      )
    })

    it('does not count a row stored as an internal transfer', async () => {
      const user = userEvent.setup()
      view([stored('a'), stored('t', { category: 'internal_transfer' })], {
        added: [makeTx('a'), makeTx('t')],
        fileRange: RANGE,
        fileRows: 2,
      })

      await importFile(user)

      expect(
        await screen.findByRole('button', { name: 'Revisar 1 movimiento' })
      ).toBeInTheDocument()
    })

    it('says nothing about review when nothing was new', async () => {
      const user = userEvent.setup()
      view([stored('old')], {
        duplicates: [makeTx('old')],
        fileRange: RANGE,
        fileRows: 1,
      })

      await importFile(user)

      await screen.findByText('No había movimientos nuevos')
      expect(
        screen.getByText(periodLine('mar. 2025 – dic. 2025 · 1 movimiento'))
      ).toBeTruthy()
      expect(screen.queryByText(/a revisar/)).toBeNull()
      expect(screen.queryByRole('button', { name: /^Revisar/ })).toBeNull()
    })

    it('marks "a revisar" as actionable only when there is something to review', async () => {
      const user = userEvent.setup()
      view([stored('a'), clean('b')], {
        added: [makeTx('a'), makeTx('b')],
        fileRange: { from: '2025-03-04', to: '2025-12-20' },
        fileRows: 2,
      })
      await importFile(user)
      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(document.querySelector('[data-actionable]')).not.toBeNull()
    })

    it('leaves "0 a revisar" plain', async () => {
      const user = userEvent.setup()
      view([clean('a')], {
        added: [makeTx('a')],
        fileRange: { from: '2025-03-04', to: '2025-12-20' },
        fileRows: 1,
      })
      await importFile(user)
      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(document.querySelector('[data-actionable]')).toBeNull()
    })

    it('shows no Revisar without a way to open Transacciones', async () => {
      const user = userEvent.setup()
      render(
        <ImportCSV
          transactions={[stored('a')]}
          onTransactionsImported={parsedThen({
            added: [makeTx('a')],
            fileRange: RANGE,
            fileRows: 1,
          })}
        />
      )

      await importFile(user)

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(screen.queryByRole('button', { name: /^Revisar/ })).toBeNull()
    })
  })

  describe('several files at once (#275)', () => {
    const NAMES = ['card.csv', 'usd.csv', 'uyu.csv']
    const files = (names = NAMES) =>
      names.map((n) => new File(['a,b'], n, { type: 'text/csv' }))
    const pickMany = (names = NAMES) =>
      fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
        target: { files: files(names) },
      })
    const dropMany = (names = NAMES) =>
      fireEvent.drop(screen.getByText('Seleccionar archivo'), {
        dataTransfer: { files: files(names) },
      })
    const stored = (id: string, overrides: Partial<Transaction> = {}) => ({
      ...makeTx(id),
      date: new Date('2025-06-01T00:00:00.000Z'),
      category: 'uncategorized',
      ...overrides,
    })
    const added = (id: string) => ({
      added: [makeTx(id)],
      fileRange: { from: '2025-03-04', to: '2025-12-20' },
      fileRows: 1,
    })
    // An importer answering per file name; an Error is thrown instead.
    const byName = (
      answers: Record<string, Partial<StatementImportResult> | Error>
    ) =>
      vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        async (file, { onParsed }) => {
          const answer = answers[file.fileName]
          if (answer instanceof Error) throw answer
          onParsed?.()
          return result(answer)
        }
      )
    const section = (name: string) => screen.getByRole('region', { name })

    it('imports the files one after the other, never two at once', async () => {
      let running = 0
      let peak = 0
      const resolvers: Array<() => void> = []
      const importer = vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        async (_file, { onParsed }) => {
          onParsed?.()
          running += 1
          peak = Math.max(peak, running)
          await new Promise<void>((resolve) => resolvers.push(resolve))
          running -= 1
          return result(added('a'))
        }
      )
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()

      await waitFor(() => expect(importer).toHaveBeenCalledTimes(1))
      expect(importer.mock.calls[0][0].fileName).toBe('card.csv')
      await act(async () => resolvers[0]())
      await waitFor(() => expect(importer).toHaveBeenCalledTimes(2))
      expect(importer.mock.calls[1][0].fileName).toBe('usd.csv')
      await act(async () => resolvers[1]())
      await waitFor(() => expect(importer).toHaveBeenCalledTimes(3))
      await act(async () => resolvers[2]())

      expect(
        await screen.findByRole('heading', { name: 'Importación completada' })
      ).toBeInTheDocument()
      expect(peak).toBe(1)
      for (const name of NAMES) {
        expect(
          within(section(name)).getByRole('list', {
            name: `Resumen de la importación: ${name}`,
          })
        ).toBeInTheDocument()
      }
    })

    it('takes every file of a drop', async () => {
      const importer = byName({
        'card.csv': added('a'),
        'usd.csv': added('b'),
        'uyu.csv': added('c'),
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      dropMany()

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(importer.mock.calls.map(([f]) => f.fileName)).toEqual(NAMES)
    })

    it('says which file is running', async () => {
      const resolvers: Array<() => void> = []
      const importer = vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        async (_file, { onParsed }) => {
          onParsed?.()
          await new Promise<void>((resolve) => resolvers.push(resolve))
          return result(added('a'))
        }
      )
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()
      await waitFor(() => expect(resolvers).toHaveLength(1))
      expect(screen.getByText(paragraph('Archivo 1 de 3'))).toBeInTheDocument()
      await act(async () => resolvers[0]())
      await waitFor(() => expect(resolvers).toHaveLength(2))

      expect(screen.getByText(paragraph('Archivo 2 de 3'))).toBeInTheDocument()
      expect(screen.getByText('usd.csv')).toBeInTheDocument()
      await act(async () => resolvers[1]())
      await waitFor(() => expect(resolvers).toHaveLength(3))
      await act(async () => resolvers[2]())
      await screen.findByRole('heading', { name: 'Importación completada' })
    })

    it('does not show a count of files for one file', async () => {
      const resolvers: Array<() => void> = []
      const importer = vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        async (_file, { onParsed }) => {
          onParsed?.()
          await new Promise<void>((resolve) => resolvers.push(resolve))
          return result(added('a'))
        }
      )
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany(['one.csv'])
      await waitFor(() => expect(resolvers).toHaveLength(1))

      expect(screen.queryByText(paragraph('Archivo 1 de 1'))).toBeNull()
      await act(async () => resolvers[0]())
      await screen.findByRole('heading', { name: 'Importación completada' })
    })

    it('keeps going past a file that fails and says why in its section', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const importer = byName({
        'card.csv': added('a'),
        'usd.csv': new StatementReadError('El archivo está vacío.'),
        'uyu.csv': added('c'),
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()

      expect(
        await screen.findByRole('heading', { name: 'Importación completada' })
      ).toBeInTheDocument()
      expect(importer).toHaveBeenCalledTimes(3)
      const failed = section('usd.csv')
      expect(within(failed).getByText('Error al validar archivo')).toBeVisible()
      expect(within(failed).getByText('El archivo está vacío.')).toBeVisible()
      expect(
        within(section('uyu.csv')).getByRole('list', {
          name: 'Resumen de la importación: uyu.csv',
        })
      ).toBeInTheDocument()
      expect(
        screen.getByText(paragraph('1 archivo no se pudo importar.'))
      ).toBeVisible()
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
    })

    it('says several files failed to import in the plural', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const importer = byName({
        'card.csv': added('a'),
        'usd.csv': new StatementReadError('x'),
        'uyu.csv': new StatementReadError('y'),
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()

      expect(
        await screen.findByText(
          paragraph('2 archivos no se pudieron importar.')
        )
      ).toBeVisible()
    })

    it('says when a failed file was a save failure, not a bad file', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const importer = byName({
        'card.csv': new Error('boom'),
        'usd.csv': added('b'),
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany(['card.csv', 'usd.csv'])

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(
        within(section('card.csv')).getByText('No se pudo importar')
      ).toBeVisible()
    })

    it('a file that is not a CSV fails its own section and the rest import', async () => {
      const importer = byName({ 'usd.csv': added('b') })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany(['notes.txt', 'usd.csv'])

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(importer).toHaveBeenCalledTimes(1)
      expect(
        within(section('notes.txt')).getByText(
          'El archivo debe estar en formato CSV'
        )
      ).toBeVisible()
    })

    it('says nothing was new when every file was already imported', async () => {
      const importer = byName({
        'card.csv': { duplicates: [makeTx('a')] },
        'usd.csv': { duplicates: [makeTx('b')] },
        'uyu.csv': { duplicates: [makeTx('c')] },
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()

      const heading = await screen.findByRole('heading', {
        name: 'No había movimientos nuevos',
      })
      expect(heading).toHaveFocus()
      expect(
        screen.getByText('Estos archivos ya estaban importados.')
      ).toBeVisible()
    })

    it('says no file could be imported when all of them failed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const importer = byName({
        'card.csv': new StatementReadError('x'),
        'usd.csv': new StatementReadError('y'),
        'uyu.csv': new StatementReadError('z'),
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()

      expect(
        await screen.findByRole('heading', {
          name: 'No se pudieron importar los archivos',
        })
      ).toBeInTheDocument()
      expect(
        screen.queryByText('Estos archivos ya estaban importados.')
      ).toBeNull()
      expect(screen.queryByText(/no se pudo importar\.$/)).toBeNull()
    })

    it('offers one Revisar for every file that added rows, over all their dates', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      const importer = byName({
        'card.csv': {
          added: [makeTx('a')],
          fileType: 'bank_account_usd',
          fileRange: { from: '2025-03-04', to: '2025-06-20' },
          fileRows: 1,
        },
        'usd.csv': {
          added: [makeTx('b')],
          fileType: 'bank_account_usd',
          fileRange: { from: '2025-05-01', to: '2025-12-20' },
          fileRows: 1,
        },
        'uyu.csv': { duplicates: [makeTx('z')] },
      })
      render(
        <ImportCSV
          transactions={[
            stored('a', { currency: 'USD' }),
            stored('b', { currency: 'USD' }),
          ]}
          onTransactionsImported={importer}
          onViewTransactions={onViewTransactions}
        />
      )

      pickMany()
      await user.click(
        await screen.findByRole('button', { name: 'Revisar 2 movimientos' })
      )

      expect(screen.getAllByRole('button', { name: /^Revisar/ })).toHaveLength(
        1
      )
      expect(onViewTransactions).toHaveBeenCalledWith({
        review: true,
        accountType: 'bank_account',
        currency: 'USD',
        period: { mode: 'range', from: '2025-03-04', to: '2025-12-20' },
      })
    })

    it('opens the newest month among the files with "Ver transacciones"', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      const importer = byName({
        'card.csv': { ...added('a'), month: { y: 2025, m: 2 } },
        'usd.csv': { ...added('b'), month: { y: 2025, m: 10 } },
        'uyu.csv': new StatementReadError('x'),
      })
      vi.spyOn(console, 'error').mockImplementation(() => {})
      render(
        <ImportCSV
          transactions={[]}
          onTransactionsImported={importer}
          onViewTransactions={onViewTransactions}
        />
      )

      pickMany()
      await user.click(
        await screen.findByRole('button', { name: 'Ver transacciones' })
      )

      expect(onViewTransactions).toHaveBeenCalledWith({
        period: { mode: 'month', y: 2025, m: 10 },
      })
    })

    it('warns once about AI failing in every file', async () => {
      const importer = byName({
        'card.csv': { ...added('a'), aiError: new AiError('auth') },
        'usd.csv': { ...added('b'), aiError: new AiError('auth') },
        'uyu.csv': { ...added('c'), aiError: new AiError('auth') },
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(toastMock.warning).toHaveBeenCalledTimes(1)
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Categorización con IA no disponible: la clave API de Anthropic no es válida. Se usaron las reglas de categorización.'
      )
    })

    it('says "no disponible" once when a file failed and another was partial', async () => {
      const importer = byName({
        'card.csv': { ...added('a'), aiPartial: '1 de 3 lotes' },
        'usd.csv': { ...added('b'), aiError: new AiError('auth') },
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany(['card.csv', 'usd.csv'])

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(toastMock.warning).toHaveBeenCalledTimes(1)
      expect(toastMock.warning.mock.calls[0][0]).toContain('no disponible')
    })

    it('adds up the repairs that failed into one toast', async () => {
      const importer = byName({
        'card.csv': { ...added('a'), repairsFailed: 1 },
        'usd.csv': { ...added('b'), repairsFailed: 2 },
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany(['card.csv', 'usd.csv'])

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(toastMock.warning).toHaveBeenCalledTimes(1)
      expect(toastMock.warning).toHaveBeenCalledWith(
        'No se pudieron corregir 3 descripciones. Importá el archivo de nuevo para reintentar.'
      )
    })

    it('stops importing the rest when the dialog closes mid-batch', async () => {
      const resolvers: Array<() => void> = []
      const importer = vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        async (_file, { onParsed }) => {
          onParsed?.()
          await new Promise<void>((resolve) => resolvers.push(resolve))
          return result(added('a'))
        }
      )
      const { unmount } = render(
        <ImportCSV transactions={[]} onTransactionsImported={importer} />
      )

      pickMany()
      await waitFor(() => expect(resolvers).toHaveLength(1))
      unmount()
      await act(async () => resolvers[0]())
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(importer).toHaveBeenCalledTimes(1)
      expect(toastMock.warning).not.toHaveBeenCalled()
    })

    it('shows nothing of the old batch when the workspace changed under it', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const importer = byName({
        'card.csv': new WorkspaceChangedError(),
        'usd.csv': added('b'),
        'uyu.csv': added('c'),
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()

      await waitFor(() => expect(errorSpy).toHaveBeenCalled())
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
      // Same as a cancellation: the rest is not attempted and nothing about
      // the old batch (summary, failure, toasts) reaches the new user.
      expect(
        await screen.findByRole('button', { name: 'Seleccionar archivo' })
      ).toBeInTheDocument()
      expect(importer).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
      expect(toastMock.warning).not.toHaveBeenCalled()
    })

    it('still warns about AI and repairs of the files imported when the dialog closes', async () => {
      const resolvers: Array<() => void> = []
      const importer = vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        async (_file, { onParsed }) => {
          onParsed?.()
          await new Promise<void>((resolve) => resolvers.push(resolve))
          return result({
            ...added('a'),
            aiError: new AiError('auth'),
            repairsFailed: 1,
          })
        }
      )
      const { unmount } = render(
        <ImportCSV transactions={[]} onTransactionsImported={importer} />
      )

      pickMany(['one.csv'])
      await waitFor(() => expect(resolvers).toHaveLength(1))
      unmount()
      await act(async () => resolvers[0]())

      await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(2))
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Categorización con IA no disponible: la clave API de Anthropic no es válida. Se usaron las reglas de categorización.'
      )
    })

    it('warns for the files imported before the dialog closed, and stops the rest', async () => {
      const resolvers: Array<() => void> = []
      const importer = vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        async (_file, { onParsed }) => {
          onParsed?.()
          await new Promise<void>((resolve) => resolvers.push(resolve))
          return result({ ...added('a'), aiError: new AiError('auth') })
        }
      )
      const { unmount } = render(
        <ImportCSV transactions={[]} onTransactionsImported={importer} />
      )

      pickMany()
      await waitFor(() => expect(resolvers).toHaveLength(1))
      await act(async () => resolvers[0]())
      await waitFor(() => expect(resolvers).toHaveLength(2))
      unmount()
      await act(async () => resolvers[1]())

      await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1))
      expect(importer).toHaveBeenCalledTimes(2)
    })

    it('says nothing to the next user when an import finishes after a user change', async () => {
      workspaceStore.setState({ userId: 'user-a', status: 'ready' })
      const resolvers: Array<() => void> = []
      const importer = vi.fn<Parameters<Importer>, ReturnType<Importer>>(
        async (_file, { onParsed }) => {
          onParsed?.()
          await new Promise<void>((resolve) => resolvers.push(resolve))
          return result({
            ...added('a'),
            aiError: new AiError('auth'),
            repairsFailed: 1,
          })
        }
      )
      const { unmount } = render(
        <ImportCSV transactions={[]} onTransactionsImported={importer} />
      )

      pickMany(['one.csv'])
      await waitFor(() => expect(resolvers).toHaveLength(1))
      // The dialog is re-keyed by the user change, then A's import resolves.
      unmount()
      workspaceStore.setState({ userId: 'user-b', status: 'ready' })
      await act(async () => resolvers[0]())
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(toastMock.warning).not.toHaveBeenCalled()
      workspaceStore.setState({ userId: null, status: 'idle' })
    })

    it('names the files where AI failed when the others were fine', async () => {
      const importer = byName({
        'card.csv': added('a'),
        'usd.csv': { ...added('b'), aiError: new AiError('auth') },
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany(['card.csv', 'usd.csv'])

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(toastMock.warning).toHaveBeenCalledTimes(1)
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Categorización con IA no disponible en usd.csv: la clave API de Anthropic no es válida. En ese archivo se usaron las reglas de categorización.'
      )
    })

    it('names the files with an incomplete AI pass and keeps each count', async () => {
      const importer = byName({
        'card.csv': { ...added('a'), aiPartial: '1 de 3 lotes fallaron' },
        'usd.csv': { ...added('b'), aiPartial: '2 de 3 lotes fallaron' },
        'uyu.csv': added('c'),
      })
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)

      pickMany()

      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(toastMock.warning).toHaveBeenCalledTimes(1)
      expect(toastMock.warning).toHaveBeenCalledWith(
        'Categorización con IA incompleta en card.csv (1 de 3 lotes fallaron) y usd.csv (2 de 3 lotes fallaron). El resto se categorizó con reglas.'
      )
    })

    it('opens the newest month among the files that added rows', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      const importer = byName({
        'card.csv': { ...added('a'), month: { y: 2025, m: 2 } },
        // Nothing new, but its newest row is later: not the month to open.
        'usd.csv': { duplicates: [makeTx('b')], month: { y: 2025, m: 10 } },
      })
      render(
        <ImportCSV
          transactions={[]}
          onTransactionsImported={importer}
          onViewTransactions={onViewTransactions}
        />
      )

      pickMany(['card.csv', 'usd.csv'])
      await user.click(
        await screen.findByRole('button', { name: 'Ver transacciones' })
      )

      expect(onViewTransactions).toHaveBeenCalledWith({
        period: { mode: 'month', y: 2025, m: 2 },
      })
    })

    it('falls back to the newest file month when nothing was new', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      const importer = byName({
        'card.csv': { duplicates: [makeTx('a')], month: { y: 2025, m: 2 } },
        'usd.csv': { duplicates: [makeTx('b')], month: { y: 2025, m: 10 } },
      })
      render(
        <ImportCSV
          transactions={[]}
          onTransactionsImported={importer}
          onViewTransactions={onViewTransactions}
        />
      )

      pickMany(['card.csv', 'usd.csv'])
      await user.click(
        await screen.findByRole('button', { name: 'Ver transacciones' })
      )

      expect(onViewTransactions).toHaveBeenCalledWith({
        period: { mode: 'month', y: 2025, m: 10 },
      })
    })

    it('shows a partial save as failed and leaves it out of the Revisar range', async () => {
      const user = userEvent.setup()
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const onViewTransactions = vi.fn()
      const importer = byName({
        'card.csv': {
          ...added('a'),
          fileType: 'bank_account_usd',
          fileRange: { from: '2025-05-01', to: '2025-06-01' },
        },
        'usd.csv': new UserFacingError(
          'Se guardaron 3 de 5 movimientos. Importá el archivo de nuevo.'
        ),
      })
      render(
        <ImportCSV
          transactions={[stored('a', { currency: 'USD' })]}
          onTransactionsImported={importer}
          onViewTransactions={onViewTransactions}
        />
      )

      pickMany(['card.csv', 'usd.csv'])
      await user.click(
        await screen.findByRole('button', { name: 'Revisar 1 movimiento' })
      )

      expect(
        within(section('usd.csv')).getByText(/Se guardaron 3 de 5/)
      ).toBeVisible()
      expect(onViewTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          period: { mode: 'range', from: '2025-05-01', to: '2025-06-01' },
        })
      )
    })

    it('hides the zero lines of each file, but a single file keeps them', async () => {
      const importer = byName({
        'card.csv': added('a'),
        'usd.csv': added('b'),
      })
      const { unmount } = render(
        <ImportCSV transactions={[]} onTransactionsImported={importer} />
      )
      pickMany(['card.csv', 'usd.csv'])
      await screen.findByRole('heading', { name: 'Importación completada' })

      const lines = within(section('card.csv'))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
      expect(lines).toEqual([
        '1 nueva',
        '0 a revisar · sin categoría o con poca seguridad',
      ])
      unmount()

      // One file keeps today's lines, zeros included.
      render(<ImportCSV transactions={[]} onTransactionsImported={importer} />)
      pickMany(['card.csv'])
      await screen.findByRole('heading', { name: 'Importación completada' })
      expect(summaryLines()).toEqual([
        '1 nueva',
        '0 a revisar · sin categoría o con poca seguridad',
        '0 duplicadas omitidas',
        '0 eliminadas antes',
      ])
    })

    it('goes back to the picker with "Importar otro archivo"', async () => {
      const user = userEvent.setup()
      render(
        <ImportCSV
          transactions={[]}
          onTransactionsImported={byName({
            'a.csv': added('a'),
            'b.csv': added('b'),
          })}
          onViewTransactions={vi.fn()}
        />
      )

      pickMany(['a.csv', 'b.csv'])
      await user.click(
        await screen.findByRole('button', { name: 'Importar otro archivo' })
      )

      expect(
        screen.getByRole('button', { name: 'Seleccionar archivo' })
      ).toHaveFocus()
      expect(screen.getByLabelText('Seleccionar archivo')).toHaveAttribute(
        'multiple'
      )
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
        <WithStoreRows
          onViewTransactions={onViewTransactions}
          onTransactionsImported={(file, options) =>
            importStatement(repo, file, options)
          }
        />
      )
      return repo
    }

    afterEach(() => {
      // Still mounted: the dialog reads these rows.
      act(() => transactionStore.getState().clearTransactions())
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

    it('says what the sample card statement leaves to review and opens it', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      renderWithRealImport(onViewTransactions)
      const bytes = readFileSync(
        join(__dirname, '../../samples/CreditCardsMovementsDetail.csv')
      )

      pick('CreditCardsMovementsDetail.csv', new Uint8Array(bytes) as BlobPart)

      expect(
        await screen.findByText(
          periodLine('mar. 2025 – dic. 2025 · 64 movimientos')
        )
      ).toBeInTheDocument()
      const toReview = countReviewRows(
        transactionStore.getState().transactions,
        { review: true }
      )
      expect(toReview).toBeGreaterThanOrEqual(3)
      expect(summaryLines()).toContain(
        `${toReview} a revisar · sin categoría o con poca seguridad`
      )
      await user.click(
        screen.getByRole('button', { name: `Revisar ${toReview} movimientos` })
      )
      expect(onViewTransactions).toHaveBeenCalledWith({
        review: true,
        accountType: 'credit_card',
        period: { mode: 'range', from: '2025-03-17', to: '2025-12-04' },
      })
    })

    it('imports the three sample statements in one pick', async () => {
      const user = userEvent.setup()
      const onViewTransactions = vi.fn()
      renderWithRealImport(onViewTransactions)
      const names = [
        'CreditCardsMovementsDetail.csv',
        'USDmovements.csv',
        'UYUmovements.csv',
      ]

      fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
        target: {
          files: names.map(
            (name) =>
              new File(
                [
                  new Uint8Array(
                    readFileSync(join(__dirname, '../../samples', name))
                  ) as BlobPart,
                ],
                name,
                { type: 'text/csv' }
              )
          ),
        },
      })

      await screen.findByRole('heading', { name: 'Importación completada' })
      for (const name of names) {
        expect(screen.getByRole('region', { name })).toBeInTheDocument()
      }
      const rows = transactionStore.getState().transactions
      expect(rows).toHaveLength(64 + 22 + 13)
      // Per file: its own new rows still to review, read from the store
      // after the whole batch (a transfer pair across files stops counting).
      const toReviewOf = (name: string) =>
        within(screen.getByRole('region', { name }))
          .getAllByRole('listitem')
          .map((item) => item.textContent)
          .find((text) => text?.includes('a revisar'))
      expect(toReviewOf(names[0])).toMatch(/^3 a revisar/)
      expect(toReviewOf(names[1])).toMatch(/^3 a revisar/)
      expect(toReviewOf(names[2])).toMatch(/^1 a revisar/)
      // Mixed accounts: the link is the period alone, and the button's count
      // is what that link lists.
      await user.click(
        screen.getByRole('button', { name: 'Revisar 7 movimientos' })
      )
      const link = onViewTransactions.mock.calls[0][0]
      expect(link).toEqual({
        review: true,
        period: { mode: 'range', from: '2025-03-17', to: '2025-12-04' },
      })
      expect(countReviewRows(rows, link)).toBe(7)
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
