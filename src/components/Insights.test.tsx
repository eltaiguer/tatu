import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Insights } from './Insights'
import type { Transaction } from '../models'
import { Category } from '../models'
import type { InsightsResult } from '../services/insights/insight-generator'
import { UserFacingError } from '../utils/user-error'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../services/repository/in-memory-repository'
import { buildInsightInput } from '../services/insights/insight-data'
import { hashInsightInput } from '../services/insights/insight-cache'

const { generateInsightsMock } = vi.hoisted(() => ({
  generateInsightsMock: vi.fn(),
}))

vi.mock('../services/insights/insight-generator', async () => {
  const actual = await vi.importActual<
    typeof import('../services/insights/insight-generator')
  >('../services/insights/insight-generator')
  return {
    ...actual,
    generateInsights: generateInsightsMock,
  }
})

const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('../services/monitoring/error-reporting', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../services/monitoring/error-reporting')
  >()),
  captureError: reporting.captureError,
}))

let repo: InMemoryRepository

function makeTransaction(
  id: string,
  overrides: Partial<Transaction> = {}
): Transaction {
  return {
    id,
    date: new Date('2026-06-10T00:00:00.000Z'),
    description: `Transaction ${id}`,
    amount: 100,
    currency: 'USD',
    type: 'debit',
    source: 'bank_account',
    category: Category.Restaurants,
    rawData: {},
    ...overrides,
  }
}

const transactions = [makeTransaction('t1')]

const sampleResult: InsightsResult = {
  insights: [
    {
      type: 'bleeding_money',
      title: 'Restaurantes domina tu gasto',
      narrative: 'El gasto en restaurantes es tu categoría más grande.',
      amount: 100,
      currency: 'USD',
      category: Category.Restaurants,
      severity: 'high',
    },
  ],
}

function renderInsights(
  overrides: Partial<Parameters<typeof Insights>[0]> = {}
) {
  return render(
    <Insights
      transactions={transactions}
      homeCurrency="USD"
      fxRate={40.5}
      repository={repo}
      aiEnabled={true}
      claudeApiKey="sk-test"
      onNavigateToTransactions={vi.fn()}
      onNavigateToSettings={vi.fn()}
      {...overrides}
    />
  )
}

// Stores `sampleResult` as this user's cached insights, computed from the
// rendered transactions (fresh) or from other data (stale).
function cacheInsights({ stale }: { stale: boolean }) {
  const input = buildInsightInput(transactions, 'USD', 40.5)
  repo.insights = {
    inputHash: stale ? 'stale-hash' : hashInsightInput(input),
    model: 'claude-opus-4-8',
    insights: sampleResult,
    generatedAt: '2026-06-20T10:00:00.000Z',
  }
}

describe('Insights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repo = createInMemoryRepository()
  })

  it('shows an empty state pointing to import when there are no transactions', () => {
    const onNavigateToImport = vi.fn()
    renderInsights({ transactions: [], onNavigateToImport })

    expect(
      screen.getByText('Importá tus movimientos primero')
    ).toBeInTheDocument()
    expect(repo.requests.loadInsights).toBeUndefined()
  })

  it('shows a disabled state pointing to Settings when AI is not configured', () => {
    const onNavigateToSettings = vi.fn()
    renderInsights({ aiEnabled: false, claudeApiKey: '', onNavigateToSettings })

    expect(
      screen.getByText('Activá la IA para ver insights')
    ).toBeInTheDocument()
    expect(repo.requests.loadInsights).toBeUndefined()
  })

  it('shows an empty state with a generate CTA when there is no cached result', async () => {
    renderInsights()

    await waitFor(() =>
      expect(
        screen.getByText('Generá tus primeros insights')
      ).toBeInTheDocument()
    )
    // Before the first paid call, say what leaves the browser and who pays.
    expect(
      screen.getByText(/Se envían a Anthropic tus totales por categoría/)
    ).toBeInTheDocument()
  })

  it('fetches cached insights exactly once on mount', async () => {
    renderInsights()

    await waitFor(() => expect(repo.requests.loadInsights).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(repo.requests.loadInsights).toBe(1)
  })

  it('renders cached insight cards grouped by type with the hard number from the input', async () => {
    cacheInsights({ stale: false })

    renderInsights()

    await waitFor(() =>
      expect(
        screen.getByText('Restaurantes domina tu gasto')
      ).toBeInTheDocument()
    )
    expect(screen.getByText('¿Dónde se fue tu dinero?')).toBeInTheDocument()
    expect(screen.getByText('US$ 100,00')).toBeInTheDocument()
    expect(screen.queryByText(/desactualizados/)).not.toBeInTheDocument()
  })

  it('navigates to Transactions filtered by category when "Ver transacciones" is clicked', async () => {
    cacheInsights({ stale: false })
    const onNavigateToTransactions = vi.fn()

    renderInsights({ onNavigateToTransactions })

    await waitFor(() =>
      expect(screen.getByText('Ver transacciones →')).toBeInTheDocument()
    )
    fireEvent.click(screen.getByText('Ver transacciones →'))

    expect(onNavigateToTransactions).toHaveBeenCalledWith({
      category: Category.Restaurants,
    })
  })

  it('shows a stale banner when the cached input no longer matches the current data', async () => {
    cacheInsights({ stale: true })

    renderInsights()

    await waitFor(() =>
      expect(screen.getByText(/desactualizados/)).toBeInTheDocument()
    )
  })

  it('generates and caches new insights when the generate button is clicked', async () => {
    generateInsightsMock.mockResolvedValue(sampleResult)

    renderInsights()

    await waitFor(() =>
      expect(screen.getByText('Generar insights')).toBeInTheDocument()
    )
    fireEvent.click(screen.getByText('Generar insights'))

    await waitFor(() =>
      expect(
        screen.getByText('Restaurantes domina tu gasto')
      ).toBeInTheDocument()
    )

    expect(generateInsightsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        historyStart: '2026-06-10',
        historyEnd: '2026-06-10',
      }),
      'sk-test'
    )
    expect(repo.insights).toMatchObject({
      inputHash: hashInsightInput(buildInsightInput(transactions, 'USD', 40.5)),
      model: 'claude-opus-5-5',
      insights: sampleResult,
    })
  })

  it('reports an unexpected failure to generate insights, not a bad key', async () => {
    const bug = new TypeError('x is undefined')
    generateInsightsMock
      .mockRejectedValueOnce(new Error('401 invalid x-api-key'))
      .mockRejectedValueOnce(bug)
    renderInsights()

    fireEvent.click(await screen.findByText('Generar insights'))
    await screen.findByText(
      'No se pudieron generar los insights: la clave API de Anthropic no es válida'
    )
    // Handed over without a cause, which reporting drops (sentry test).
    for (const [error] of reporting.captureError.mock.calls) {
      expect(error).toBeInstanceOf(UserFacingError)
      expect((error as UserFacingError).cause).toBeUndefined()
    }

    fireEvent.click(screen.getByText('Generar insights'))
    await screen.findByText(
      'No se pudieron generar los insights: error inesperado del servicio de IA'
    )
    expect(screen.queryByText(/x is undefined/)).not.toBeInTheDocument()
    expect(reporting.captureError).toHaveBeenCalledWith(bug, 'insights')
  })

  it('does not report a missing insights table, which needs schema.sql', async () => {
    repo.failOn('loadInsights', {
      error: new UserFacingError(
        'Falta crear la tabla de insights en la base de datos.'
      ),
    })
    renderInsights()

    await screen.findByText(
      'Falta crear la tabla de insights en la base de datos.'
    )
    // Handed over without a cause, which reporting drops (sentry test).
    for (const [error] of reporting.captureError.mock.calls) {
      expect(error).toBeInstanceOf(UserFacingError)
      expect((error as UserFacingError).cause).toBeUndefined()
    }
  })

  it('reports a failure to save generated insights as a storage failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    generateInsightsMock.mockResolvedValue(sampleResult)
    const failure = new Error('permission denied for table ai_insights')
    repo.failOn('saveInsights', { error: failure })
    renderInsights()

    fireEvent.click(await screen.findByText('Generar insights'))
    await screen.findByText('No se pudieron guardar los insights')
    // Generated (and paid for) already: shown even though it wasn't saved.
    expect(screen.getByText('Restaurantes domina tu gasto')).toBeInTheDocument()
    expect(screen.queryByText(failure.message)).not.toBeInTheDocument()
    expect(reporting.captureError).toHaveBeenCalledWith(failure, 'insights')
    expect(errorSpy).toHaveBeenCalledWith(failure)
  })

  it('reports a failure to load cached insights', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('permission denied for table ai_insights')
    repo.failOn('loadInsights', { error: failure })
    renderInsights()

    await screen.findByText('No se pudieron cargar los insights')
    expect(screen.queryByText(failure.message)).not.toBeInTheDocument()
    expect(reporting.captureError).toHaveBeenCalledWith(failure, 'insights')
    expect(errorSpy).toHaveBeenCalledWith(failure)
  })
})
