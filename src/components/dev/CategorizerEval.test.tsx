import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategorizerEval } from './CategorizerEval'
import type { Transaction } from '../../models'
import { replaceMerchantCategoryOverrides } from '../../services/categorizer/category-overrides'

const jev = vi.hoisted(() => ({ classifyWithJev: vi.fn() }))
vi.mock('../../services/ai/jev-classifier', () => ({
  classifyWithJev: jev.classifyWithJev,
}))

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

    await userEvent.type(
      screen.getByLabelText(/OpenRouter API key/),
      'or-test-key'
    )
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
