import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AiPatternAnalysis } from './AiPatternAnalysis'
import { AiError } from '../../services/ai/ai-error'
import type { Transaction } from '../../models'

const ai = vi.hoisted(() => ({ analyzeTransactionPatterns: vi.fn() }))
vi.mock('../../services/ai/prompt-analysis', () => ({
  analyzeTransactionPatterns: ai.analyzeTransactionPatterns,
}))

const row: Transaction = {
  id: 'tx-1',
  date: new Date('2026-03-01T00:00:00.000Z'),
  description: 'DEVOTO',
  amount: 10,
  currency: 'UYU',
  type: 'debit',
  source: 'bank_account',
  rawData: {},
}

function run() {
  render(
    <AiPatternAnalysis
      transactions={[row]}
      claudeApiKey="sk-test"
      aiModel="claude-haiku"
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Analizar patrones' }))
}

describe('AiPatternAnalysis — errors', () => {
  beforeEach(() => {
    ai.analyzeTransactionPatterns.mockReset()
  })

  it('says what went wrong in Spanish', async () => {
    ai.analyzeTransactionPatterns.mockRejectedValue(new AiError('rate_limit'))

    run()

    expect(
      await screen.findByText('se alcanzó el límite de uso de la API')
    ).toBeInTheDocument()
  })

  it('never shows the raw text of an unexpected failure, but logs it', async () => {
    const bug = new TypeError('x is undefined')
    ai.analyzeTransactionPatterns.mockRejectedValue(bug)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    run()

    expect(
      await screen.findByText('error inesperado del servicio de IA')
    ).toBeInTheDocument()
    expect(screen.queryByText(/x is undefined/)).not.toBeInTheDocument()
    expect(logged).toHaveBeenCalledWith('AI pattern analysis failed:', bug)
    logged.mockRestore()
  })
})
