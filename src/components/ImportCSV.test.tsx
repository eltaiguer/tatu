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
      render(<ImportCSV />)
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
      render(<ImportCSV />)
      const input = screen.getByLabelText('Seleccionar archivo')
      const click = vi.spyOn(input, 'click').mockImplementation(() => {})

      await user.tab()
      await user.keyboard(' ')
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('does not promise a clickable drop zone', () => {
      render(<ImportCSV />)
      expect(
        screen.queryByText('o hacé clic para seleccionar')
      ).not.toBeInTheDocument()
    })
  })

  describe('copy and states (#204)', () => {
    it('uses sentence case and the copy guide’s account names', () => {
      render(<ImportCSV />)

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
      parseCSVMock.mockReturnValue(makeParsedData())
      const onTransactionsImported = vi.fn(() => new Promise<never>(() => {}))
      render(<ImportCSV onTransactionsImported={onTransactionsImported} />)

      fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
        target: {
          files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
        },
      })

      expect(await screen.findByText('Importando…')).toBeInTheDocument()
      expect(screen.queryByText(/Validando archivo/)).not.toBeInTheDocument()
    })

    it('titles a save failure "No se pudo importar", not a validation error', async () => {
      parseCSVMock.mockReturnValue(makeParsedData())
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const onTransactionsImported = vi
        .fn()
        .mockRejectedValue(new Error('duplicate key value violates'))
      render(<ImportCSV onTransactionsImported={onTransactionsImported} />)

      fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
        target: {
          files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
        },
      })

      expect(await screen.findByText('No se pudo importar')).toBeInTheDocument()
      expect(
        screen.queryByText('Error al validar archivo')
      ).not.toBeInTheDocument()
      expect(
        screen.getByText('No se pudo guardar la importación')
      ).toBeInTheDocument()
      expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
    })

    it('labels the account type of a successful import in sentence case', async () => {
      parseCSVMock.mockReturnValue({
        ...makeParsedData(),
        fileType: 'credit_card',
      })
      addTransactionsMock.mockReturnValue({
        added: [makeTx('tx-1')],
        duplicates: [],
      })
      render(<ImportCSV />)

      fireEvent.change(screen.getByLabelText('Seleccionar archivo'), {
        target: {
          files: [new File(['a,b'], 'card.csv', { type: 'text/csv' })],
        },
      })

      await screen.findByText('Importación completada')
      expect(screen.getAllByText('Tarjeta de crédito')).toHaveLength(2)
    })
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
    const onViewTransactions = vi.fn()
    render(<ImportCSV onViewTransactions={onViewTransactions} />)

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
    expect(onViewTransactions).not.toHaveBeenCalled()
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

    expect(screen.getByText('Validando archivo…')).toBeInTheDocument()

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

  it('persists immediately and reports duplicates without leaving the dialog', async () => {
    parseCSVMock.mockReturnValue(makeParsedData())
    addTransactionsMock.mockReturnValue({
      added: [makeTx('tx-1')],
      duplicates: [makeTx('tx-2'), makeTx('tx-3')],
    })
    const onViewTransactions = vi.fn()

    render(<ImportCSV onViewTransactions={onViewTransactions} />)

    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File(['a,b'], 'movements.csv', { type: 'text/csv' })],
      },
    })

    expect(
      await screen.findByText('Importación completada')
    ).toBeInTheDocument()
    expect(summaryLine('1 nueva')).toBeInTheDocument()
    expect(summaryLine('2 duplicadas omitidas')).toBeInTheDocument()

    expect(parseCSVMock).toHaveBeenCalledTimes(1)
    expect(addTransactionsMock).toHaveBeenCalledTimes(1)
    // Navigating is the user's choice ("Ver transacciones"), never automatic.
    expect(onViewTransactions).not.toHaveBeenCalled()
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
    expect(summaryLine('2 nuevas')).toBeInTheDocument()
    expect(summaryLine('1 duplicada omitida')).toBeInTheDocument()
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

    expect(await findSummaryLine('1 eliminada antes')).toBeInTheDocument()
    expect(summaryLine('1 nueva')).toBeInTheDocument()
    expect(summaryLine('0 duplicadas omitidas')).toBeInTheDocument()
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
  describe('summary after an import (#202)', () => {
    // Local dates, so the month does not depend on the test machine's zone.
    function txOn(id: string, y: number, m: number, d: number): Transaction {
      return { ...makeTx(id), date: new Date(y, m, d, 12) }
    }

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
      parseCSVMock.mockReturnValue(makeParsedData())
      const onViewTransactions = vi.fn()
      const onTransactionsImported = vi.fn().mockResolvedValue({
        added: [txOn('a', 2026, 2, 3), txOn('b', 2026, 2, 9)],
        duplicates: [txOn('c', 2026, 2, 1)],
        previouslyDeleted: [txOn('d', 2026, 1, 28)],
      })
      render(
        <ImportCSV
          onTransactionsImported={onTransactionsImported}
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

    it('"Ver transacciones" goes to the month of the newest new row', async () => {
      const user = userEvent.setup()
      parseCSVMock.mockReturnValue(makeParsedData())
      const onViewTransactions = vi.fn()
      const onTransactionsImported = vi.fn().mockResolvedValue({
        added: [txOn('a', 2026, 1, 27), txOn('b', 2026, 2, 2)],
        duplicates: [],
      })
      render(
        <ImportCSV
          onTransactionsImported={onTransactionsImported}
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
      parseCSVMock.mockReturnValue({
        ...makeParsedData(),
        transactions: [txOn('a', 2025, 10, 4), txOn('b', 2025, 10, 27)],
      })
      const onViewTransactions = vi.fn()
      const onTransactionsImported = vi.fn().mockResolvedValue({
        added: [],
        duplicates: [txOn('a', 2025, 10, 4), txOn('b', 2025, 10, 27)],
      })
      render(
        <ImportCSV
          onTransactionsImported={onTransactionsImported}
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
      parseCSVMock.mockReturnValue(makeParsedData())
      const onTransactionsImported = vi.fn().mockResolvedValue({
        added: [txOn('a', 2026, 2, 3)],
        duplicates: [],
      })
      render(
        <ImportCSV
          onTransactionsImported={onTransactionsImported}
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
      parseCSVMock.mockReturnValue(makeParsedData())
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const onViewTransactions = vi.fn()
      const onTransactionsImported = vi
        .fn()
        .mockRejectedValue(new Error('network down'))
      render(
        <ImportCSV
          onTransactionsImported={onTransactionsImported}
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
})
