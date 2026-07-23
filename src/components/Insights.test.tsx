import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Insights } from './Insights'
import type { Transaction } from '../models'
import { Category } from '../models'
import type { SupabaseSession } from '../services/supabase/client'
import type { InsightsResult } from '../services/insights/insight-generator'

const {
  getCachedInsightsMock,
  saveCachedInsightsMock,
  generateInsightsMock,
} = vi.hoisted(() => ({
  getCachedInsightsMock: vi.fn(),
  saveCachedInsightsMock: vi.fn(),
  generateInsightsMock: vi.fn(),
}))

vi.mock('../services/insights/insight-cache', () => ({
  getCachedInsights: getCachedInsightsMock,
  saveCachedInsights: saveCachedInsightsMock,
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

const session = { user: { id: 'user-1' } } as unknown as SupabaseSession

function makeTransaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
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

const referenceDate = new Date('2026-06-20T00:00:00.000Z')
const transactions = [makeTransaction('t1')]

const sampleResult: InsightsResult = {
  insights: [
    {
      type: 'bleeding_money',
      title: 'Restaurantes creció fuerte',
      narrative: 'El gasto en restaurantes subió este mes.',
      amount: 100,
      currency: 'USD',
      category: Category.Restaurants,
      severity: 'high',
    },
  ],
}

describe('Insights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a disabled state pointing to Settings when AI is not configured', () => {
    const onNavigateToSettings = vi.fn()
    render(
      <Insights
        transactions={transactions}
        homeCurrency="USD"
        fxRate={40.5}
        session={session}
        aiEnabled={false}
        claudeApiKey=""
        onNavigateToTransactions={vi.fn()}
        onNavigateToSettings={onNavigateToSettings}
        referenceDate={referenceDate}
      />
    )

    expect(screen.getByText('Activá la IA para ver insights')).toBeInTheDocument()
    expect(getCachedInsightsMock).not.toHaveBeenCalled()
  })

  it('shows an empty state with a generate CTA when there is no cached result', async () => {
    getCachedInsightsMock.mockResolvedValue(null)

    render(
      <Insights
        transactions={transactions}
        homeCurrency="USD"
        fxRate={40.5}
        session={session}
        aiEnabled={true}
        claudeApiKey="sk-test"
        onNavigateToTransactions={vi.fn()}
        onNavigateToSettings={vi.fn()}
        referenceDate={referenceDate}
      />
    )

    await waitFor(() =>
      expect(screen.getByText('Generá tus primeros insights')).toBeInTheDocument()
    )
  })

  it('renders cached insight cards grouped by type with the hard number from the input', async () => {
    getCachedInsightsMock.mockResolvedValue({
      result: sampleResult,
      model: 'claude-opus-4-8',
      generatedAt: '2026-06-20T10:00:00.000Z',
      isStale: false,
    })

    render(
      <Insights
        transactions={transactions}
        homeCurrency="USD"
        fxRate={40.5}
        session={session}
        aiEnabled={true}
        claudeApiKey="sk-test"
        onNavigateToTransactions={vi.fn()}
        onNavigateToSettings={vi.fn()}
        referenceDate={referenceDate}
      />
    )

    await waitFor(() =>
      expect(screen.getByText('Restaurantes creció fuerte')).toBeInTheDocument()
    )
    expect(screen.getByText('¿Dónde se fue tu dinero?')).toBeInTheDocument()
    expect(screen.getByText('US$ 100,00')).toBeInTheDocument()
    expect(screen.queryByText(/desactualizados/)).not.toBeInTheDocument()
  })

  it('navigates to Transactions filtered by category when "Ver transacciones" is clicked', async () => {
    getCachedInsightsMock.mockResolvedValue({
      result: sampleResult,
      model: 'claude-opus-4-8',
      generatedAt: '2026-06-20T10:00:00.000Z',
      isStale: false,
    })
    const onNavigateToTransactions = vi.fn()
    const user = userEvent.setup()

    render(
      <Insights
        transactions={transactions}
        homeCurrency="USD"
        fxRate={40.5}
        session={session}
        aiEnabled={true}
        claudeApiKey="sk-test"
        onNavigateToTransactions={onNavigateToTransactions}
        onNavigateToSettings={vi.fn()}
        referenceDate={referenceDate}
      />
    )

    await waitFor(() =>
      expect(screen.getByText('Ver transacciones →')).toBeInTheDocument()
    )
    await user.click(screen.getByText('Ver transacciones →'))

    expect(onNavigateToTransactions).toHaveBeenCalledWith({
      category: Category.Restaurants,
    })
  })

  it('shows a stale banner when the cached input no longer matches the current data', async () => {
    getCachedInsightsMock.mockResolvedValue({
      result: sampleResult,
      model: 'claude-opus-4-8',
      generatedAt: '2026-06-20T10:00:00.000Z',
      isStale: true,
    })

    render(
      <Insights
        transactions={transactions}
        homeCurrency="USD"
        fxRate={40.5}
        session={session}
        aiEnabled={true}
        claudeApiKey="sk-test"
        onNavigateToTransactions={vi.fn()}
        onNavigateToSettings={vi.fn()}
        referenceDate={referenceDate}
      />
    )

    await waitFor(() => expect(screen.getByText(/desactualizados/)).toBeInTheDocument())
  })

  it('generates and caches new insights when the generate button is clicked', async () => {
    getCachedInsightsMock.mockResolvedValue(null)
    generateInsightsMock.mockResolvedValue(sampleResult)
    saveCachedInsightsMock.mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <Insights
        transactions={transactions}
        homeCurrency="USD"
        fxRate={40.5}
        session={session}
        aiEnabled={true}
        claudeApiKey="sk-test"
        onNavigateToTransactions={vi.fn()}
        onNavigateToSettings={vi.fn()}
        referenceDate={referenceDate}
      />
    )

    await waitFor(() =>
      expect(screen.getByText('Generar insights')).toBeInTheDocument()
    )
    await user.click(screen.getByText('Generar insights'))

    await waitFor(() =>
      expect(screen.getByText('Restaurantes creció fuerte')).toBeInTheDocument()
    )

    expect(generateInsightsMock).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: '2026-06-01', periodEnd: '2026-06-30' }),
      'sk-test'
    )
    expect(saveCachedInsightsMock).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ periodStart: '2026-06-01' }),
      sampleResult,
      'claude-opus-4-8'
    )
  })
})
