import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ImportCSV } from './ImportCSV'
import type { ParsedData, Transaction } from '../models'

const { parseCSVMock, addTransactionsMock } = vi.hoisted(() => ({
  parseCSVMock: vi.fn(),
  addTransactionsMock: vi.fn(),
}))

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
    globalThis.FileReader = SuccessfulFileReaderMock as unknown as typeof FileReader
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
    expect(screen.getByText('El archivo debe estar en formato CSV')).toBeInTheDocument()
    expect(parseCSVMock).not.toHaveBeenCalled()
    expect(addTransactionsMock).not.toHaveBeenCalled()
  })

  it('shows parser errors and does not persist', async () => {
    parseCSVMock.mockImplementation(() => {
      throw new Error('CSV malformado')
    })
    const onImportComplete = vi.fn()
    render(<ImportCSV onImportComplete={onImportComplete} />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(await screen.findByText('Error al validar archivo')).toBeInTheDocument()
    expect(screen.getByText('CSV malformado')).toBeInTheDocument()
    expect(addTransactionsMock).not.toHaveBeenCalled()
    expect(onImportComplete).not.toHaveBeenCalled()
  })

  it('shows file read errors and does not persist', async () => {
    globalThis.FileReader = FailingFileReaderMock as unknown as typeof FileReader
    render(<ImportCSV />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(await screen.findByText('Error al validar archivo')).toBeInTheDocument()
    expect(screen.getByText('Error al leer el archivo')).toBeInTheDocument()
    expect(parseCSVMock).not.toHaveBeenCalled()
    expect(addTransactionsMock).not.toHaveBeenCalled()
  })

  it('shows validating state while file is being processed', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    addTransactionsMock.mockReturnValue({
      added: [makeTx('tx-1'), makeTx('tx-2'), makeTx('tx-3')],
      duplicates: [],
    })
    globalThis.FileReader = DeferredFileReaderMock as unknown as typeof FileReader

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

    expect(await screen.findByText('Importación completada')).toBeInTheDocument()
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

    expect(await screen.findByText('Importación completada')).toBeInTheDocument()
    expect(
      screen.getByText('1 de 3 transacciones guardadas (2 duplicadas omitidas)')
    ).toBeInTheDocument()

    expect(parseCSVMock).toHaveBeenCalledTimes(1)
    expect(addTransactionsMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onImportComplete).toHaveBeenCalledTimes(1))
  })
})
