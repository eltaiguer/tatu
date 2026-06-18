import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Category } from '../../models'
import type { Transaction } from '../../models'
import type { CustomCategory } from '../categories/category-store'

const { messagesCreateMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      messages = { create: messagesCreateMock }
    },
  }
})

import {
  validateCategory,
  applyAiEnrichment,
  enrichTransactionsWithAi,
} from './transaction-ai'
import type { AiEnrichmentResult } from './transaction-ai'
import type { CustomPattern } from '../categorizer/custom-patterns'

function makeTx(id: string, description: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: new Date('2025-01-10'),
    description,
    amount: 100,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
    ...overrides,
  }
}

const noCustomCategories: CustomCategory[] = []
const customCategories: CustomCategory[] = [
  { id: 'coffee', label: 'Coffee', color: '#8B4513' },
]

const baseConfig = { apiKey: 'sk-test', enabled: true, model: 'claude-haiku-4-5' }
const emptyContext = { descriptionExamples: [], categoryExamples: [], customCategories: noCustomCategories, customPatterns: [] }

describe('validateCategory', () => {
  it('accepts valid built-in categories', () => {
    expect(validateCategory('groceries', noCustomCategories)).toBe('groceries')
    expect(validateCategory('internal_transfer', noCustomCategories)).toBe('internal_transfer')
    expect(validateCategory('uncategorized', noCustomCategories)).toBe('uncategorized')
  })

  it('accepts valid custom category ids', () => {
    expect(validateCategory('coffee', customCategories)).toBe('coffee')
  })

  it('coerces unknown values to uncategorized', () => {
    expect(validateCategory('food_and_drink', noCustomCategories)).toBe(Category.Uncategorized)
    expect(validateCategory('', noCustomCategories)).toBe(Category.Uncategorized)
    expect(validateCategory('coffee', noCustomCategories)).toBe(Category.Uncategorized)
  })

  it('trims and lowercases input', () => {
    expect(validateCategory('  Groceries  ', noCustomCategories)).toBe('groceries')
  })
})

describe('applyAiEnrichment', () => {
  it('merges AI results onto matching transactions', () => {
    const txs = [makeTx('tx1', 'COMPRA DEVOTO'), makeTx('tx2', 'NETFLIX')]
    const results = new Map<string, AiEnrichmentResult>([
      ['tx1', { id: 'tx1', category: 'groceries', displayDescription: 'Devoto', confidence: 0.85 }],
      ['tx2', { id: 'tx2', category: 'entertainment', displayDescription: 'Netflix', confidence: 0.85 }],
    ])
    const enriched = applyAiEnrichment(txs, results)
    expect(enriched[0].category).toBe('groceries')
    expect(enriched[0].displayDescription).toBe('Devoto')
    expect(enriched[0].categoryConfidence).toBe(0.85)
    expect(enriched[1].category).toBe('entertainment')
    expect(enriched[1].displayDescription).toBe('Netflix')
  })

  it('leaves non-matched transactions unchanged', () => {
    const txs = [makeTx('tx1', 'DEVOTO'), makeTx('tx2', 'NETFLIX')]
    const results = new Map<string, AiEnrichmentResult>([
      ['tx1', { id: 'tx1', category: 'groceries', displayDescription: 'Devoto', confidence: 0.85 }],
    ])
    const enriched = applyAiEnrichment(txs, results)
    expect(enriched[1].category).toBe(txs[1].category)
    expect(enriched[1].displayDescription).toBe(txs[1].displayDescription)
  })

  it('does not mutate original transaction objects', () => {
    const txs = [makeTx('tx1', 'DEVOTO')]
    const originalCategory = txs[0].category
    const results = new Map<string, AiEnrichmentResult>([
      ['tx1', { id: 'tx1', category: 'groceries', displayDescription: 'Devoto', confidence: 0.85 }],
    ])
    applyAiEnrichment(txs, results)
    expect(txs[0].category).toBe(originalCategory)
  })
})

describe('enrichTransactionsWithAi', () => {
  beforeEach(() => {
    messagesCreateMock.mockReset()
  })

  it('parses valid response and returns map keyed by id', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx1', displayDescription: 'Devoto', category: 'groceries', confidence: 0.9 },
      ])}],
    })
    const results = await enrichTransactionsWithAi(
      [{ id: 'tx1', description: 'SUPERMERCADO DEVOTO', type: 'debit', amount: 500, currency: 'UYU', source: 'bank_account' }],
      baseConfig,
      emptyContext
    )
    expect(results.get('tx1')?.category).toBe('groceries')
    expect(results.get('tx1')?.displayDescription).toBe('Devoto')
    expect(results.get('tx1')?.confidence).toBe(0.9)
  })

  it('falls back to 0.7 confidence when AI omits the field', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx1', displayDescription: 'Unknown', category: 'uncategorized' },
      ])}],
    })
    const results = await enrichTransactionsWithAi(
      [{ id: 'tx1', description: 'XXXX', type: 'debit', amount: 100, currency: 'UYU', source: 'bank_account' }],
      baseConfig,
      emptyContext
    )
    expect(results.get('tx1')?.confidence).toBe(0.7)
  })

  it('clamps out-of-range confidence values to [0, 1]', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx1', displayDescription: 'Netflix', category: 'entertainment', confidence: 1.5 },
        { id: 'tx2', displayDescription: 'Unknown', category: 'uncategorized', confidence: -0.2 },
      ])}],
    })
    const results = await enrichTransactionsWithAi(
      [
        { id: 'tx1', description: 'NETFLIX', type: 'debit', amount: 9.99, currency: 'USD', source: 'credit_card' },
        { id: 'tx2', description: 'XXXX', type: 'debit', amount: 100, currency: 'UYU', source: 'bank_account' },
      ],
      baseConfig,
      emptyContext
    )
    expect(results.get('tx1')?.confidence).toBe(1)
    expect(results.get('tx2')?.confidence).toBe(0)
  })

  it('includes custom categories in the system prompt', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx1', displayDescription: 'Starbucks', category: 'coffee' },
      ])}],
    })
    const results = await enrichTransactionsWithAi(
      [{ id: 'tx1', description: 'STARBUCKS', type: 'debit', amount: 200, currency: 'UYU', source: 'bank_account' }],
      baseConfig,
      { ...emptyContext, customCategories }
    )
    expect(results.get('tx1')?.category).toBe('coffee')
    const systemPrompt = messagesCreateMock.mock.calls[0][0].system as string
    expect(systemPrompt).toContain('coffee — Coffee')
  })

  it('coerces invalid category to uncategorized', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx1', displayDescription: 'Somewhere', category: 'food_and_drink' },
      ])}],
    })
    const results = await enrichTransactionsWithAi(
      [{ id: 'tx1', description: 'SOMEWHERE', type: 'debit', amount: 100, currency: 'USD', source: 'credit_card' }],
      baseConfig,
      emptyContext
    )
    expect(results.get('tx1')?.category).toBe(Category.Uncategorized)
  })

  it('silently drops items with missing id', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { displayDescription: 'No ID', category: 'groceries' },
        { id: 'tx2', displayDescription: 'Netflix', category: 'entertainment' },
      ])}],
    })
    const results = await enrichTransactionsWithAi(
      [
        { id: 'tx1', description: 'DEVOTO', type: 'debit', amount: 100, currency: 'UYU', source: 'bank_account' },
        { id: 'tx2', description: 'NETFLIX', type: 'debit', amount: 9.99, currency: 'USD', source: 'credit_card' },
      ],
      baseConfig,
      emptyContext
    )
    expect(results.has('tx1')).toBe(false)
    expect(results.get('tx2')?.category).toBe('entertainment')
  })

  it('throws on unparseable JSON response', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    })
    await expect(
      enrichTransactionsWithAi(
        [{ id: 'tx1', description: 'DEVOTO', type: 'debit', amount: 100, currency: 'UYU', source: 'bank_account' }],
        baseConfig,
        emptyContext
      )
    ).rejects.toThrow('No se pudo parsear la respuesta del modelo')
  })

  it('includes source field in the user message', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
    })
    await enrichTransactionsWithAi(
      [{ id: 'tx1', description: 'PAGO RECIBIDO', type: 'credit', amount: 1200, currency: 'UYU', source: 'credit_card' }],
      baseConfig,
      emptyContext
    )
    const userMessage = messagesCreateMock.mock.calls[0][0].messages[0].content as string
    expect(userMessage).toContain('"source":"credit_card"')
  })

  it('includes correction examples in the user message', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
    })
    await enrichTransactionsWithAi(
      [{ id: 'tx1', description: 'DEVOTO', type: 'debit', amount: 100, currency: 'UYU', source: 'bank_account' }],
      baseConfig,
      {
        descriptionExamples: [{ raw: 'SUPERM DEVOTO', friendly: 'Devoto', category: 'groceries' }],
        categoryExamples: [{ merchant: 'tintoreria', category: 'personal' }],
        customCategories: noCustomCategories,
        customPatterns: [],
      }
    )
    const userMessage = messagesCreateMock.mock.calls[0][0].messages[0].content as string
    expect(userMessage).toContain('SUPERM DEVOTO')
    expect(userMessage).toContain('tintoreria')
  })

  it('includes custom pattern rules in the user message', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
    })
    const customPatterns: CustomPattern[] = [
      { id: 'cp1', pattern: 'farmacia', matchType: 'contains', category: 'healthcare', createdAt: '' },
      { id: 'cp2', pattern: 'ute ', matchType: 'starts_with', category: 'utilities', createdAt: '' },
      { id: 'cp3', pattern: 'salario empresa srl', matchType: 'exact', category: 'income', createdAt: '' },
    ]
    await enrichTransactionsWithAi(
      [{ id: 'tx1', description: 'FARMACIA DEVOTO', type: 'debit', amount: 200, currency: 'UYU', source: 'bank_account' }],
      baseConfig,
      { ...emptyContext, customPatterns }
    )
    const userMessage = messagesCreateMock.mock.calls[0][0].messages[0].content as string
    expect(userMessage).toContain('USER RULES (always apply these')
    expect(userMessage).toContain('contains "farmacia" → healthcare')
    expect(userMessage).toContain('starts with "ute " → utilities')
    expect(userMessage).toContain('exact "salario empresa srl" → income')
  })

  it('omits USER RULES block when no custom patterns exist', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
    })
    await enrichTransactionsWithAi(
      [{ id: 'tx1', description: 'NETFLIX', type: 'debit', amount: 9.99, currency: 'USD', source: 'credit_card' }],
      baseConfig,
      emptyContext
    )
    const userMessage = messagesCreateMock.mock.calls[0][0].messages[0].content as string
    expect(userMessage).not.toContain('USER RULES')
  })

  it('throws when API call fails (caller handles fallback)', async () => {
    messagesCreateMock.mockRejectedValue(new Error('API error'))
    await expect(
      enrichTransactionsWithAi(
        [{ id: 'tx1', description: 'DEVOTO', type: 'debit', amount: 100, currency: 'UYU', source: 'bank_account' }],
        baseConfig,
        emptyContext
      )
    ).rejects.toThrow('API error')
  })
})
