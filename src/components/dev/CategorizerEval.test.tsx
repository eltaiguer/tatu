import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategorizerEval } from './CategorizerEval'
import type { Transaction } from '../../models'
import { replaceMerchantCategoryOverrides } from '../../services/categorizer/category-overrides'

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
