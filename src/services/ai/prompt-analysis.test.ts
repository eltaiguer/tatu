import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../models'

const { messagesCreateMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class {
      messages = { create: messagesCreateMock }
    },
  }
})

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
  beforeEach(() => {
    messagesCreateMock.mockReset()
  })

  it('returns the first text block even when the model thinks first', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: '# PREFIX PATTERNS' },
      ],
      stop_reason: 'end_turn',
    })

    await expect(
      analyzeTransactionPatterns([tx('A', 'credit_card')], config)
    ).resolves.toBe('# PREFIX PATTERNS')
  })

  it('leaves the output budget room for thinking and the analysis', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
    })

    await analyzeTransactionPatterns([tx('A', 'bank_account')], config)

    const params = messagesCreateMock.mock.calls[0][0]
    expect(params.model).toBe('claude-haiku-5-5')
    expect(params.max_tokens).toBeGreaterThanOrEqual(16000)
    expect(params.output_config).toEqual({ effort: 'medium' })
  })

  it('reports a truncated analysis instead of showing it as complete', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '# PREFIX PATTERNS (cut' }],
      stop_reason: 'max_tokens',
    })

    await expect(
      analyzeTransactionPatterns([tx('A', 'credit_card')], config)
    ).rejects.toThrow(/truncada/)
  })
})
