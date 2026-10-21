import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AiCategorizationPreview } from './AiCategorizationPreview'
import { AiError } from '../../services/ai/ai-error'
import type { Transaction } from '../../models'

const ai = vi.hoisted(() => ({ enrichTransactionsWithAi: vi.fn() }))
vi.mock('../../services/ai/transaction-ai', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../services/ai/transaction-ai')
  >()),
  enrichTransactionsWithAi: ai.enrichTransactionsWithAi,
}))

function at(id: string, iso: string): Transaction {
  return {
    id,
    date: new Date(iso),
    description: id,
    amount: 10,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }
}

describe('AiCategorizationPreview', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // #58: the sample is last month's rows by calendar day — rows stored at UTC
  // midnight and rows stored before #58 at 03:00Z alike.
  it('samples the rows dated in last calendar month', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 3, 15, 12))

    render(
      <AiCategorizationPreview
        transactions={[
          at('feb-28-pre-58', '2026-02-28T03:00:00.000Z'),
          at('mar-1', '2026-03-01T00:00:00.000Z'),
          at('mar-31-pre-58', '2026-03-31T03:00:00.000Z'),
          at('apr-1-pre-58', '2026-04-01T03:00:00.000Z'),
        ]}
        claudeApiKey="sk-test"
        aiModel="claude-haiku"
      />
    )

    expect(screen.getByText(/^2 transacciones de marzo/)).toBeTruthy()
  })

  it('says why the preview failed in Spanish', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 3, 15, 12))
    ai.enrichTransactionsWithAi.mockRejectedValue(new AiError('auth'))

    render(
      <AiCategorizationPreview
        transactions={[at('mar-1', '2026-03-01T00:00:00.000Z')]}
        claudeApiKey="sk-test"
        aiModel="claude-haiku"
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Ejecutar preview de IA' })
    )

    expect(
      await screen.findByText('la clave API de Anthropic no es válida')
    ).toBeInTheDocument()
  })

  it('logs an unexpected failure it does not show', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 3, 15, 12))
    const bug = new TypeError('x is undefined')
    ai.enrichTransactionsWithAi.mockRejectedValue(bug)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AiCategorizationPreview
        transactions={[at('mar-1', '2026-03-01T00:00:00.000Z')]}
        claudeApiKey="sk-test"
        aiModel="claude-haiku"
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Ejecutar preview de IA' })
    )

    expect(
      await screen.findByText('error inesperado del servicio de IA')
    ).toBeInTheDocument()
    expect(logged).toHaveBeenCalledWith('AI preview failed:', bug)
    logged.mockRestore()
  })
})
