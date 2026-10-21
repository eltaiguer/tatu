import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { fakeClaudeClient } from '../../test/fake-claude-client'
import { AiError } from './ai-error'
import { analyzeTransactionPatterns } from './prompt-analysis'

function tx(id: string, source: Transaction['source']): Transaction {
  return {
    id,
    date: new Date('2026-03-01T00:00:00.000Z'),
    description: id,
    amount: 10,
    currency: 'UYU',
    type: 'debit',
    source,
    rawData: {},
  }
}

const config = { apiKey: 'sk-test', enabled: true, model: 'claude-haiku-5-5' }

describe('analyzeTransactionPatterns', () => {
  it("returns the model's analysis", async () => {
    const client = fakeClaudeClient(() => '# PREFIX PATTERNS')

    await expect(
      analyzeTransactionPatterns([tx('A', 'credit_card')], config, client)
    ).resolves.toBe('# PREFIX PATTERNS')
  })

  it('sends the samples to the chosen model with room to think', async () => {
    const client = fakeClaudeClient(() => 'ok')

    await analyzeTransactionPatterns(
      [tx('CARD ROW', 'credit_card'), tx('BANK ROW', 'bank_account')],
      config,
      client
    )

    const [request] = client.requests
    expect(request.model).toBe('claude-haiku-5-5')
    expect(request.maxTokens).toBeGreaterThanOrEqual(16000)
    expect(request.effort).toBe('medium')
    expect(request.system).toMatch(/^You are a prompt engineer/)
    expect(request.user).toContain('CARD ROW | uncategorized')
    expect(request.user).toContain('BANK ROW | uncategorized')
  })

  it('passes a truncated analysis on as a failure, never as complete', async () => {
    const client = fakeClaudeClient(() => {
      throw new AiError('truncated')
    })

    await expect(
      analyzeTransactionPatterns([tx('A', 'credit_card')], config, client)
    ).rejects.toThrow(/truncada/)
  })
})
