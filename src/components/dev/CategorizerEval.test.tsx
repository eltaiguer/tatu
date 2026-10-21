import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategorizerEval } from './CategorizerEval'
import type { Transaction } from '../../models'
import { replaceMerchantCategoryOverrides } from '../../services/categorizer/category-overrides'

const jev = vi.hoisted(() => ({ classifyWithJev: vi.fn() }))
vi.mock('../../services/ai/jev-classifier', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/ai/jev-classifier')>()
  return { ...actual, classifyWithJev: jev.classifyWithJev }
})

const claude = vi.hoisted(() => ({ enrichTransactionsWithAi: vi.fn() }))
vi.mock('../../services/ai/transaction-ai', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/ai/transaction-ai')>()
  return {
    ...actual,
    enrichTransactionsWithAi: claude.enrichTransactionsWithAi,
  }
})

function tx(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: new Date('2026-03-01T00:00:00.000Z'),
    description: id,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

const labelled = () => [
  tx('NETFLIX.COM', { category: 'entertainment', categoryConfidence: 1 }),
  tx('KIOSCO 25', { category: 'personal', categoryConfidence: 1 }),
  tx('UBER TRIP', { category: 'transport', categoryConfidence: 0.8 }),
]

beforeEach(() => {
  replaceMerchantCategoryOverrides({})
  claude.enrichTransactionsWithAi.mockReset()
  jev.classifyWithJev.mockReset()
})

describe('CategorizerEval', () => {
  it('counts the user-categorized rows it can score', () => {
    render(
      <CategorizerEval
        transactions={labelled()}
        claudeApiKey=""
        aiModel="claude-haiku"
      />
    )

    expect(
      screen.getByText(/2 transacciones categorizadas por vos/)
    ).toBeTruthy()
  })

  it('scores the rule categorizer without the user rules and lists mismatches', async () => {
    // The user's own override must not make the rules look right
    replaceMerchantCategoryOverrides({
      'kiosco 25': {
        merchantName: 'KIOSCO 25',
        category: 'personal',
        updatedAt: '',
      },
    })
    render(
      <CategorizerEval
        transactions={labelled()}
        claudeApiKey=""
        aiModel="claude-haiku"
      />
    )

    await userEvent.click(
      screen.getByRole('button', { name: /Evaluar reglas/ })
    )

    const rules = screen.getByTestId('eval-rules')
    expect(rules.textContent).toContain('1 de 2')
    expect(rules.textContent).toContain('50 %')
    const mismatches = screen.getByTestId('eval-mismatches')
    expect(mismatches.textContent).toContain('KIOSCO 25')
    expect(mismatches.textContent).not.toContain('NETFLIX.COM')
  })

  it('offers the AI run only with a key', () => {
    render(
      <CategorizerEval
        transactions={labelled()}
        claudeApiKey=""
        aiModel="claude-haiku"
      />
    )

    expect(
      (screen.getByRole('button', { name: /Evaluar IA/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })
})

describe('CategorizerEval — Claude run (review of #224)', () => {
  it('scores only the rows the model answered and marks the run partial', async () => {
    claude.enrichTransactionsWithAi.mockResolvedValue({
      results: new Map([
        [
          'NETFLIX.COM',
          {
            id: 'NETFLIX.COM',
            category: 'entertainment',
            displayDescription: 'Netflix',
            confidence: 0.9,
          },
        ],
      ]),
      partialFailure: '1 de 2 lotes fallaron: 529',
    })
    render(
      <CategorizerEval
        transactions={labelled()}
        claudeApiKey="sk-test"
        aiModel="claude-haiku"
      />
    )

    await userEvent.click(
      screen.getByRole('button', { name: /Evaluar reglas/ })
    )
    await userEvent.click(screen.getByRole('button', { name: /Evaluar IA/ }))

    const row = await screen.findByTestId('eval-ai')
    expect(row.textContent).toContain('1 de 1')
    expect(row.textContent).toContain('parcial')
    // KIOSCO 25 was never answered: no tick, no mismatch, a dash
    const mismatches = screen.getByTestId('eval-mismatches')
    const kiosco = mismatches.querySelector('tr[data-row="KIOSCO 25"]')!
    expect(kiosco.textContent).toContain('—')
    expect(kiosco.textContent).not.toContain('✓')
  })
})

describe('CategorizerEval — Jev', () => {
  it('scores Jev on the same rows once an OpenRouter key is typed', async () => {
    jev.classifyWithJev.mockResolvedValue({
      results: new Map([
        [
          'NETFLIX.COM',
          { id: 'NETFLIX.COM', category: 'entertainment', confidence: 0.9 },
        ],
        [
          'KIOSCO 25',
          { id: 'KIOSCO 25', category: 'personal', confidence: 0.6 },
        ],
      ]),
    })
    render(
      <CategorizerEval
        transactions={labelled()}
        claudeApiKey=""
        aiModel="claude-haiku"
      />
    )

    const jevButton = screen.getByRole('button', { name: /Evaluar Jev/ })
    expect((jevButton as HTMLButtonElement).disabled).toBe(true)

    const keyField = screen.getByLabelText(/OpenRouter API key/)
    expect(keyField.getAttribute('autocomplete')).toBe('off')
    await userEvent.type(keyField, 'or-test-key')
    await userEvent.click(screen.getByRole('button', { name: /Evaluar Jev/ }))

    expect(jev.classifyWithJev).toHaveBeenCalledTimes(1)
    const [inputs, config] = jev.classifyWithJev.mock.calls[0]
    expect(inputs.map((i: { id: string }) => i.id)).toEqual([
      'NETFLIX.COM',
      'KIOSCO 25',
    ])
    expect(config.apiKey).toBe('or-test-key')
    const row = await screen.findByTestId('eval-jev')
    expect(row.textContent).toContain('2 de 2')
    expect(row.textContent).toContain('100 %')
  })
})
