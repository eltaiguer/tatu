import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Transaction } from '../../models'

const { messagesCreateMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: messagesCreateMock }
  },
}))

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

describe('AiCategorizationPreview', () => {
  afterEach(() => {
    vi.useRealTimers()
    messagesCreateMock.mockReset()
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
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              id: 'vet',
              displayDescription: 'Veterinaria Pocitos',
              category: 'mascotas',
              confidence: 0.9,
            },
          ]),
        },
      ],
    })

    render(
      <AiCategorizationPreview
        transactions={[
          {
            ...at('vet', '2026-03-10T00:00:00.000Z'),
            category: 'groceries',
          },
        ]}
        claudeApiKey="sk-test"
        aiModel="claude-haiku"
      />
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Ejecutar preview de IA' })
    )

    const row = within(
      (await screen.findByText('Veterinaria Pocitos')).closest(
        'tr'
      ) as HTMLElement
    )
    expect(row.getByText('Sin categoría')).toBeTruthy()
    expect(row.queryByText('Mascotas')).toBeNull()
  })
})
