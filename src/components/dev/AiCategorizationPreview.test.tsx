import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AiCategorizationPreview } from './AiCategorizationPreview'
import type { Transaction } from '../../models'

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
})
