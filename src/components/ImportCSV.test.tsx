import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ImportCSV } from './ImportCSV'
import { UserFacingError } from '../utils/user-error'
import type { ParsedData, Transaction } from '../models'

const { parseCSVMock, addTransactionsMock, toastMock } = vi.hoisted(() => ({
  parseCSVMock: vi.fn(),
  addTransactionsMock: vi.fn(),
  toastMock: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: toastMock }))

vi.mock('../services/parsers/csv-parser', () => ({
  parseCSV: parseCSVMock,
}))

vi.mock('../stores/transaction-store', () => ({
  transactionStore: {
    getState: () => ({
      addTransactions: addTransactionsMock,
    }),
  },
}))

const OriginalFileReader = globalThis.FileReader

class SuccessfulFileReaderMock {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: (() => void) | null = null

  readAsText() {
    this.onload?.({
      target: { result: 'mock-csv-content' },
    } as unknown as ProgressEvent<FileReader>)
  }
}

class DeferredFileReaderMock {
  static instances: DeferredFileReaderMock[] = []
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    DeferredFileReaderMock.instances.push(this)
  }

  readAsText() {}
}

class FailingFileReaderMock {
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null
  onerror: (() => void) | null = null

  readAsText() {
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

function makeParsedData(): ParsedData {
  return {
    fileType: 'bank_account_uyu',
    transactions: [makeTx('tx-1'), makeTx('tx-2'), makeTx('tx-3')],
    metadata: {
      cliente: 'Test',
      cuenta: 'Cuenta',
      numero: '123',
      moneda: 'UYU',
      sucursal: '01',
      periodoDesde: '01/01/2026',
      periodoHasta: '31/01/2026',
    },
    fileName: 'movements.csv',
    parsedAt: new Date('2026-01-31T12:00:00.000Z'),
  }
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

  it('rejects non-csv files before parsing', () => {
    render(<ImportCSV />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['x'], 'notes.txt', { type: 'text/plain' })],
      },
    })

    expect(screen.getByText('Error al validar archivo')).toBeInTheDocument()
    expect(
      screen.getByText('El archivo debe estar en formato CSV')
    ).toBeInTheDocument()
    expect(parseCSVMock).not.toHaveBeenCalled()
    expect(addTransactionsMock).not.toHaveBeenCalled()
  })

  describe('files that are not a Santander statement (#198)', () => {
    async function useRealParser() {
      const actual = await vi.importActual<
        typeof import('../services/parsers/csv-parser')
      >('../services/parsers/csv-parser')
      parseCSVMock.mockImplementation(actual.parseCSV)
    }

    function pick(content: string, name: string) {
      globalThis.FileReader = class {
        onload: ((event: ProgressEvent<FileReader>) => void) | null = null
        onerror: (() => void) | null = null
        result: string | null = null
        readAsText() {
          this.result = content
          this.onload?.({} as ProgressEvent<FileReader>)
        }
      } as unknown as typeof FileReader
      fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
        target: { files: [new File([content], name, { type: 'text/csv' })] },
      })
    }

    it('explains in Spanish that another bank’s CSV is not recognized', async () => {
      await useRealParser()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      render(<ImportCSV />)

      pick('date,description,amount\n2026-01-01,Coffee,3.50\n', 'other.csv')

      expect(
        await screen.findByText(
          'No reconocemos este archivo. Tatú importa extractos CSV de Santander Uruguay (tarjeta de crédito o caja de ahorro).'
        )
      ).toBeInTheDocument()
      expect(screen.queryByText(/Unable to detect/)).not.toBeInTheDocument()
      expect(addTransactionsMock).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
    })

    it('says an empty file is empty', async () => {
      await useRealParser()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      render(<ImportCSV />)

      pick('', 'empty.csv')

      expect(
        await screen.findByText('El archivo está vacío.')
      ).toBeInTheDocument()
      expect(screen.queryByText(/Unable to detect/)).not.toBeInTheDocument()
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
    })
  })

  it('accepts a .CSV extension in upper case', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    addTransactionsMock.mockReturnValue({
      added: [makeTx('tx-1')],
      duplicates: [],
    })
    render(<ImportCSV />)

    fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
      target: {
        files: [new File(['a,b'], 'MOVIMIENTOS.CSV', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(parseCSVMock).toHaveBeenCalledWith(
      expect.any(String),
      'MOVIMIENTOS.CSV'
    )
  })

  it('shows parser errors and does not persist', async () => {
    parseCSVMock.mockImplementation(() => {
      throw new UserFacingError('Fila 17: Importe ilegible: "abc"')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onImportComplete = vi.fn()
    render(<ImportCSV onImportComplete={onImportComplete} />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText('Error al validar archivo')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Fila 17: Importe ilegible: "abc"')
    ).toBeInTheDocument()
    expect(addTransactionsMock).not.toHaveBeenCalled()
    expect(onImportComplete).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
  })

  it('never shows the raw text of an unexpected parser failure', async () => {
    parseCSVMock.mockImplementation(() => {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'trim')"
      )
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ImportCSV />)

    fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText(
        'No se pudo leer el archivo. Revisá que sea un extracto CSV de Santander.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Cannot read/)).not.toBeInTheDocument()
    expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
  })

  it('shows file read errors and does not persist', async () => {
    globalThis.FileReader =
      FailingFileReaderMock as unknown as typeof FileReader
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ImportCSV />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText('Error al validar archivo')
    ).toBeInTheDocument()
    expect(screen.getByText('Error al leer el archivo')).toBeInTheDocument()
    expect(parseCSVMock).not.toHaveBeenCalled()
    expect(addTransactionsMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
  })

  it('shows validating state while file is being processed', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    addTransactionsMock.mockReturnValue({
      added: [makeTx('tx-1'), makeTx('tx-2'), makeTx('tx-3')],
      duplicates: [],
    })
    globalThis.FileReader =
      DeferredFileReaderMock as unknown as typeof FileReader

    render(<ImportCSV />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(screen.getByText('Validando archivo...')).toBeInTheDocument()

    const reader = DeferredFileReaderMock.instances[0]
    await act(async () => {
      reader.onload?.({
        target: { result: 'mock-csv-content' },
      } as unknown as ProgressEvent<FileReader>)
    })

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
  })

  it('persists immediately, reports duplicates, and triggers navigation callback', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    addTransactionsMock.mockReturnValue({
      added: [makeTx('tx-1')],
      duplicates: [makeTx('tx-2'), makeTx('tx-3')],
    })
    const onImportComplete = vi.fn()

    render(<ImportCSV onImportComplete={onImportComplete} />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(
      screen.getByText('1 de 3 transacciones guardadas (2 duplicadas omitidas)')
    ).toBeInTheDocument()

    expect(parseCSVMock).toHaveBeenCalledTimes(1)
    expect(addTransactionsMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onImportComplete).toHaveBeenCalledTimes(1))
  })

  it('uses custom import handler when provided', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    addTransactionsMock.mockReturnValue({
      added: [],
      duplicates: [],
    })
    const onTransactionsImported = vi.fn().mockResolvedValue({
      added: [makeTx('tx-1'), makeTx('tx-2')],
      duplicates: [makeTx('tx-3')],
    })

    render(<ImportCSV onTransactionsImported={onTransactionsImported} />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(
      screen.getByText('2 de 3 transacciones guardadas (1 duplicadas omitidas)')
    ).toBeInTheDocument()
    expect(onTransactionsImported).toHaveBeenCalledTimes(1)
    expect(onTransactionsImported).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        fileName: 'movements.csv',
        csvContent: expect.any(String),
        parsedData: expect.objectContaining({
          fileType: 'bank_account_uyu',
        }),
      })
    )
    expect(addTransactionsMock).not.toHaveBeenCalled()
  })

  it('warns that AI categorization failed while still reporting a successful import', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    const onTransactionsImported = vi.fn().mockResolvedValue({
      added: [makeTx('tx-1'), makeTx('tx-2')],
      duplicates: [makeTx('tx-3')],
      aiError: '401 invalid x-api-key',
    })

    render(<ImportCSV onTransactionsImported={onTransactionsImported} />)

    fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    // The import still succeeded ...
    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(
      screen.getByText('2 de 3 transacciones guardadas (1 duplicadas omitidas)')
    ).toBeInTheDocument()

    // ... but the user is told the AI step did not run, and why.
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1))
    // Translated: the raw SDK text never reaches the user.
    expect(toastMock.warning.mock.calls[0][0]).toContain(
      'la clave API de Anthropic no es válida'
    )
    expect(toastMock.warning.mock.calls[0][0]).not.toContain('x-api-key')
  })

  it('tells the user deleted rows were skipped, with the right plural', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    const onTransactionsImported = vi.fn().mockResolvedValue({
      added: [makeTx('tx-1')],
      duplicates: [],
      previouslyDeleted: [makeTx('tx-2')],
    })

    render(<ImportCSV onTransactionsImported={onTransactionsImported} />)
    fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    expect(toastMock.success.mock.calls[0][0]).toBe(
      '1 nueva · 0 duplicadas omitidas · 1 que eliminaste antes omitida'
    )
  })

  it('does not warn about AI when the import reports no AI failure', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    const onTransactionsImported = vi.fn().mockResolvedValue({
      added: [makeTx('tx-1')],
      duplicates: [],
    })

    render(<ImportCSV onTransactionsImported={onTransactionsImported} />)

    fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(toastMock.warning).not.toHaveBeenCalled()
  })

  it('says the AI run was incomplete, not unavailable, on a partial failure', async () => {
    // "no disponible" would be plainly wrong when 10 of 12 batches enriched.
    parseCSVMock.mockReturnValue(makeParsedData())
    const onTransactionsImported = vi.fn().mockResolvedValue({
      added: [makeTx('tx-1')],
      duplicates: [],
      aiPartial: '2 de 12 lotes fallaron: 529 overloaded',
    })

    render(<ImportCSV onTransactionsImported={onTransactionsImported} />)

    fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1))
    const message = toastMock.warning.mock.calls[0][0] as string
    expect(message).toContain('incompleta')
    expect(message).not.toContain('no disponible')
  })
})
