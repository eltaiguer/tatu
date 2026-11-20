import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Toaster } from './ui/sonner'
import {
  merchantKeyOf,
  merchantLabelFor,
} from '../services/merchants/merchant-key'
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
import { AiError } from '../services/ai/ai-error'

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
    // A month can become complete on the 1st with no transaction changed.
    expect(
      screen.getByText(
        /Desde la última vez que generaste insights cambiaron tus transacciones o se completó un mes\./
      )
    ).toBeInTheDocument()
  })

  it('goes stale when the calendar rolls into a new month with no data change', async () => {
    // One account, July to October. On Oct 31 October is still running, so
    // the comparison is September's; on Nov 1 October is complete.
    const rows = [
      makeTransaction('j', { date: new Date('2026-07-02T00:00:00.000Z') }),
      makeTransaction('a', { date: new Date('2026-08-10T00:00:00.000Z') }),
      makeTransaction('s', { date: new Date('2026-09-10T00:00:00.000Z') }),
      makeTransaction('o', {
        date: new Date('2026-10-30T00:00:00.000Z'),
        amount: 300,
      }),
    ]
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const oct31 = new Date('2026-10-31T12:00:00.000Z')
      vi.setSystemTime(oct31)
      repo.insights = {
        inputHash: hashInsightInput(
          buildInsightInput(rows, 'USD', 40.5, { now: oct31 })
        ),
        model: 'claude-opus-4-8',
        insights: sampleResult,
        generatedAt: '2026-10-31T10:00:00.000Z',
      }
      const props = { transactions: rows }
      const { rerender } = renderInsights(props)
      await screen.findByText('Restaurantes domina tu gasto')
      expect(screen.queryByText(/desactualizados/)).not.toBeInTheDocument()

      vi.setSystemTime(new Date('2026-11-01T12:00:00.000Z'))
      rerender(
        <Insights
          transactions={rows}
          homeCurrency="USD"
          fxRate={40.5}
          repository={repo}
          aiEnabled={true}
          claudeApiKey="sk-test"
          onNavigateToTransactions={vi.fn()}
          onNavigateToSettings={vi.fn()}
        />
      )

      expect(await screen.findByText(/desactualizados/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
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
      .mockRejectedValueOnce(new AiError('auth'))
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
  describe('actionable cards (#286)', () => {
    const netflixRows = [
      makeTransaction('n1', {
        description: 'NETFLIX.COM',
        date: new Date('2026-04-05T00:00:00.000Z'),
      }),
      makeTransaction('n2', {
        description: 'NETFLIX.COM',
        date: new Date('2026-05-05T00:00:00.000Z'),
      }),
      makeTransaction('n3', {
        description: 'NETFLIX.COM',
        date: new Date('2026-06-05T00:00:00.000Z'),
      }),
    ]
    const netflixLabel = merchantLabelFor(netflixRows)

    function seed(
      insights: InsightsResult['insights'],
      rows: Transaction[],
      slot: 'insights' | 'householdInsights' = 'insights'
    ) {
      repo[slot] = {
        inputHash: 'any-hash',
        model: 'claude-opus-4-8',
        insights: { insights },
        generatedAt: '2026-06-20T10:00:00.000Z',
      }
      return rows
    }

    const recurringCard = {
      type: 'recurring' as const,
      title: 'Netflix cada mes',
      narrative: 'N',
      currency: 'USD' as const,
      merchant: netflixLabel,
      severity: 'medium' as const,
    }

    it('links a merchant-only insight by its exact merchant key', async () => {
      const rows = seed(
        [{ ...recurringCard, type: 'bleeding_money', title: 'Gasto fijo' }],
        netflixRows
      )
      const onNavigateToTransactions = vi.fn()
      renderInsights({ transactions: rows, onNavigateToTransactions })

      fireEvent.click(await screen.findByText('Ver transacciones →'))

      expect(onNavigateToTransactions).toHaveBeenCalledWith({
        merchant: merchantKeyOf(netflixRows[0]),
        type: 'debit',
      })
    })

    it('offers "Revisar N" on a Sin categoría insight', async () => {
      const rows = [
        makeTransaction('u1', { category: Category.Uncategorized }),
        makeTransaction('u2', { category: Category.Uncategorized }),
        makeTransaction('r1'),
      ]
      seed(
        [
          {
            type: 'bleeding_money',
            title: 'Sin categoría pesa',
            narrative: 'N',
            currency: 'USD',
            category: Category.Uncategorized,
            severity: 'high',
          },
        ],
        rows
      )
      const onNavigateToTransactions = vi.fn()
      renderInsights({ transactions: rows, onNavigateToTransactions })

      fireEvent.click(await screen.findByText('Revisar 2 →'))

      expect(onNavigateToTransactions).toHaveBeenCalledWith({
        categories: [Category.Uncategorized],
        type: 'debit',
      })
    })

    it('marks a recurring merchant as household from its card', async () => {
      seed([recurringCard], netflixRows)
      const onApplyHouseholdToSimilar = vi
        .fn()
        .mockResolvedValue({ affected: 3 })
      render(<Toaster />)
      renderInsights({
        transactions: netflixRows,
        onApplyHouseholdToSimilar,
      })

      expect(await screen.findByText('Ver cargos →')).toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: /^Marcar como hogar/ })
      )

      expect(onApplyHouseholdToSimilar).toHaveBeenCalledWith('n3', true)
      expect(
        await screen.findByText(
          `Hogar: Sí en 3 transacciones de ${netflixLabel}`
        )
      ).toBeInTheDocument()
    })

    it('offers no household mark in Hogar mode', async () => {
      const rows = netflixRows.map((row) => ({
        ...row,
        category: Category.Groceries,
      }))
      seed([recurringCard], rows, 'householdInsights')
      renderInsights({
        transactions: rows,
        householdMode: true,
        onApplyHouseholdToSimilar: vi.fn(),
      })

      expect(await screen.findByText('Netflix cada mes')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /^Marcar como hogar/ })
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Hogar: Sí')).not.toBeInTheDocument()
    })

    it('keeps each card disabled until its own write settles', async () => {
      const otherRows = [
        makeTransaction('s1', { description: 'SPOTIFY.COM' }),
        makeTransaction('s2', { description: 'SPOTIFY.COM' }),
      ]
      const rows = [...netflixRows, ...otherRows]
      seed(
        [
          recurringCard,
          {
            ...recurringCard,
            title: 'Spotify cada mes',
            merchant: merchantLabelFor(otherRows),
          },
        ],
        rows
      )
      const pending: Array<(value: { affected: number }) => void> = []
      const onApplyHouseholdToSimilar = vi.fn(
        () =>
          new Promise<{ affected: number }>((resolve) => pending.push(resolve))
      )
      renderInsights({ transactions: rows, onApplyHouseholdToSimilar })

      const buttons = await screen.findAllByRole('button', {
        name: /^Marcar como hogar/,
      })
      fireEvent.click(buttons[0])
      fireEvent.click(buttons[1])
      expect(
        await screen.findAllByRole('button', { name: 'Marcando…' })
      ).toHaveLength(2)

      pending[0]({ affected: 1 })
      await waitFor(() =>
        expect(
          screen.getAllByRole('button', { name: 'Marcando…' })
        ).toHaveLength(1)
      )
    })

    it('writes one rule per key of a merchant and toasts the summed count', async () => {
      const rows = [
        makeTransaction('a1', {
          description: 'NETFLIX.COM',
          displayDescription: 'Netflix',
          date: new Date('2026-04-05T00:00:00.000Z'),
        }),
        makeTransaction('b1', {
          description: 'NETFLIX AR',
          displayDescription: 'Netflix',
          date: new Date('2026-05-05T00:00:00.000Z'),
        }),
      ]
      seed([{ ...recurringCard, merchant: 'Netflix' }], rows)
      const onApplyHouseholdToSimilar = vi
        .fn()
        .mockResolvedValueOnce({ affected: 2 })
        .mockResolvedValueOnce({ affected: 3 })
      render(<Toaster />)
      renderInsights({ transactions: rows, onApplyHouseholdToSimilar })

      fireEvent.click(
        await screen.findByRole('button', { name: /^Marcar como hogar/ })
      )

      expect(
        await screen.findByText('Hogar: Sí en 5 transacciones de Netflix')
      ).toBeInTheDocument()
      expect(onApplyHouseholdToSimilar).toHaveBeenCalledTimes(2)
    })

    it('reports a failed household mark', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      seed([recurringCard], netflixRows)
      render(<Toaster />)
      renderInsights({
        transactions: netflixRows,
        onApplyHouseholdToSimilar: vi.fn().mockRejectedValue(new Error('boom')),
      })

      fireEvent.click(
        await screen.findByRole('button', { name: /^Marcar como hogar/ })
      )

      expect(
        await screen.findByText('No se pudo marcar como hogar')
      ).toBeInTheDocument()
      expect(errorSpy).toHaveBeenCalled()
    })

    it('keeps one Regenerar control while stale, with no link in the banner', async () => {
      cacheInsights({ stale: true })
      renderInsights()

      expect(
        await screen.findByText('Los insights pueden estar desactualizados.', {
          exact: false,
        })
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /regenerar ahora/i })
      ).not.toBeInTheDocument()
      expect(
        screen.getAllByRole('button', { name: /regenerar/i })
      ).toHaveLength(1)
    })
  })
})
