import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '../../models'
import { AiError } from '../../services/ai/ai-error'
import { fakeClaudeClient } from '../../test/fake-claude-client'

// The preview runs the real enrichTransactionsWithAi; only the Claude client
// is a fake, handed in where the app would build the SDK one.
const ai = vi.hoisted(() => ({
  answer: (() => '[]') as () => string,
}))
vi.mock('../../services/ai/transaction-ai', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/ai/transaction-ai')>()
  return {
    ...actual,
    enrichTransactionsWithAi: (
      ...[inputs, config, context]: Parameters<
        typeof actual.enrichTransactionsWithAi
      >
    ) =>
      actual.enrichTransactionsWithAi(
        inputs,
        config,
        context,
        fakeClaudeClient(() => ai.answer())
      ),
  }
})

import { AiCategorizationPreview } from './AiCategorizationPreview'

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

function renderPreview(transactions: Transaction[]) {
  render(
    <AiCategorizationPreview
      transactions={transactions}
      claudeApiKey="sk-test"
      aiModel="claude-haiku"
    />
  )
  return userEvent.click(
    screen.getByRole('button', { name: 'Ejecutar preview de IA' })
  )
}

describe('AiCategorizationPreview', () => {
  afterEach(() => {
    vi.useRealTimers()
    ai.answer = () => '[]'
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

  // The import path (enrichTransactionsWithAi -> validateCategory) stores an
  // answer that is not a known category as Sin categoría; the preview must
  // show what an import would store, not the model's raw word.
  it('shows an unknown AI category as Sin categoría, like an import stores it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 3, 15, 12))
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    ai.answer = () =>
      JSON.stringify([
        {
          id: 'vet',
          displayDescription: 'Veterinaria Pocitos',
          category: 'mascotas',
          confidence: 0.9,
        },
      ])

    await renderPreview([
      { ...at('vet', '2026-03-10T00:00:00.000Z'), category: 'groceries' },
    ])

    const row = within(
      (await screen.findByText('Veterinaria Pocitos')).closest(
        'tr'
      ) as HTMLElement
    )
    expect(row.getByText('Sin categoría')).toBeTruthy()
    expect(row.queryByText('Mascotas')).toBeNull()
  })

  it('says why the preview failed in Spanish', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 3, 15, 12))
    ai.answer = () => {
      throw new AiError('auth')
    }

    await renderPreview([at('mar-1', '2026-03-01T00:00:00.000Z')])

    expect(
      await screen.findByText('la clave API de Anthropic no es válida')
    ).toBeInTheDocument()
  })

  // A diagnostics panel: a failure that is not Claude's (a bug in the
  // preview itself) shows its own text, and is logged.
  it('shows and logs the text of a failure that is not an AI error', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 3, 15, 12))
    const bug = new TypeError('x is undefined')
    ai.answer = () => {
      throw bug
    }
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderPreview([at('mar-1', '2026-03-01T00:00:00.000Z')])

    expect(
      await screen.findByText('error inesperado del servicio de IA')
    ).toBeInTheDocument()
    expect(logged).toHaveBeenCalledWith('AI preview failed:', bug)
    logged.mockRestore()
  })
})
