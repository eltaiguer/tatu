import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Category } from '../../models'
import type { Transaction } from '../../models'
import type { CustomCategory } from '../categories/category-store'
import { fakeClaudeClient } from '../../test/fake-claude-client'
import { AiError } from './ai-error'

const reporting = vi.hoisted(() => ({ captureError: vi.fn() }))
vi.mock('../monitoring/error-reporting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../monitoring/error-reporting')>()),
  captureError: reporting.captureError,
}))

import {
  validateCategory,
  applyAiEnrichment,
  enrichTransactionsWithAi,
} from './transaction-ai'
import type {
  AiCorrectionContext,
  AiEnrichmentInput,
  AiEnrichmentResult,
} from './transaction-ai'
import type { CustomPattern } from '../categorizer/custom-patterns'

function makeTx(
  id: string,
  description: string,
  overrides: Partial<Transaction> = {}
): Transaction {
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

const baseConfig = {
  apiKey: 'sk-test',
  enabled: true,
  model: 'claude-haiku-4-5',
}

// What the fake Claude answers on each call, in order; the last one repeats.
// An array is sent back as the JSON text, a string as is.
type Reply = unknown[] | string | { throws: unknown }

let client: ReturnType<typeof fakeClaudeClient>

function answers(...replies: Reply[]) {
  client = fakeClaudeClient((_request, call) => {
    const reply = replies[Math.min(call, replies.length - 1)]
    if (typeof reply === 'string') return reply
    if (Array.isArray(reply)) return JSON.stringify(reply)
    throw reply.throws
  })
}

function enrich(
  inputs: AiEnrichmentInput[],
  context: AiCorrectionContext = emptyContext
) {
  return enrichTransactionsWithAi(inputs, baseConfig, context, client)
}

function userMessageOf(call: number): string {
  return client.requests[call].user
}

function input(
  id: string,
  description: string,
  overrides: Partial<AiEnrichmentInput> = {}
): AiEnrichmentInput {
  return {
    id,
    description,
    type: 'debit',
    amount: 100,
    currency: 'UYU',
    source: 'bank_account',
    ...overrides,
  }
}

function makeInputs(count: number) {
  return Array.from({ length: count }, (_, i) =>
    input(`tx${i}`, `MERCHANT ${i}`)
  )
}
const emptyContext: AiCorrectionContext = {
  descriptionExamples: [],
  categoryExamples: [],
  customCategories: noCustomCategories,
  customPatterns: [],
}

describe('validateCategory', () => {
  it('accepts valid built-in categories', () => {
    expect(validateCategory('groceries', noCustomCategories)).toBe('groceries')
    expect(validateCategory('internal_transfer', noCustomCategories)).toBe(
      'internal_transfer'
    )
    expect(validateCategory('uncategorized', noCustomCategories)).toBe(
      'uncategorized'
    )
  })

  it('accepts valid custom category ids', () => {
    expect(validateCategory('coffee', customCategories)).toBe('coffee')
  })

  it('coerces unknown values to uncategorized', () => {
    expect(validateCategory('food_and_drink', noCustomCategories)).toBe(
      Category.Uncategorized
    )
    expect(validateCategory('', noCustomCategories)).toBe(
      Category.Uncategorized
    )
    expect(validateCategory('coffee', noCustomCategories)).toBe(
      Category.Uncategorized
    )
  })

  it('trims and lowercases input', () => {
    expect(validateCategory('  Groceries  ', noCustomCategories)).toBe(
      'groceries'
    )
  })

  it('resolves pre-rename aliases the model may still use (audit)', () => {
    expect(validateCategory('food', noCustomCategories)).toBe('groceries')
    expect(validateCategory('restaurant', noCustomCategories)).toBe(
      'restaurants'
    )
    expect(validateCategory('transfer', noCustomCategories)).toBe(
      'internal_transfer'
    )
    expect(validateCategory('health', noCustomCategories)).toBe('healthcare')
  })
})

describe('applyAiEnrichment', () => {
  it('merges AI results onto matching transactions', () => {
    const txs = [makeTx('tx1', 'COMPRA DEVOTO'), makeTx('tx2', 'NETFLIX')]
    const results = new Map<string, AiEnrichmentResult>([
      [
        'tx1',
        {
          id: 'tx1',
          category: 'groceries',
          displayDescription: 'Devoto',
          confidence: 0.85,
        },
      ],
      [
        'tx2',
        {
          id: 'tx2',
          category: 'entertainment',
          displayDescription: 'Netflix',
          confidence: 0.85,
        },
      ],
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
      [
        'tx1',
        {
          id: 'tx1',
          category: 'groceries',
          displayDescription: 'Devoto',
          confidence: 0.85,
        },
      ],
    ])
    const enriched = applyAiEnrichment(txs, results)
    expect(enriched[1].category).toBe(txs[1].category)
    expect(enriched[1].displayDescription).toBe(txs[1].displayDescription)
  })

  it('does not mutate original transaction objects', () => {
    const txs = [makeTx('tx1', 'DEVOTO')]
    const originalCategory = txs[0].category
    const results = new Map<string, AiEnrichmentResult>([
      [
        'tx1',
        {
          id: 'tx1',
          category: 'groceries',
          displayDescription: 'Devoto',
          confidence: 0.85,
        },
      ],
    ])
    applyAiEnrichment(txs, results)
    expect(txs[0].category).toBe(originalCategory)
  })
})

describe('enrichTransactionsWithAi', () => {
  beforeEach(() => {
    reporting.captureError.mockClear()
  })

  it('parses valid response and returns map keyed by id', async () => {
    answers([
      {
        id: 'tx1',
        displayDescription: 'Devoto',
        category: 'groceries',
        confidence: 0.9,
      },
    ])
    const { results } = await enrich([
      input('tx1', 'SUPERMERCADO DEVOTO', { amount: 500 }),
    ])
    expect(results.get('tx1')?.category).toBe('groceries')
    expect(results.get('tx1')?.displayDescription).toBe('Devoto')
    expect(results.get('tx1')?.confidence).toBe(0.9)
  })

  it("caps the model's confidence below 1, so 1 stays the user's (review of #224)", async () => {
    answers([
      {
        id: 'tx1',
        displayDescription: 'Netflix',
        category: 'entertainment',
        confidence: 1,
      },
    ])
    const { results } = await enrich([input('tx1', 'NETFLIX.COM')])
    expect(results.get('tx1')?.confidence).toBeLessThan(1)
    expect(results.get('tx1')?.confidence).toBeGreaterThanOrEqual(0.95)
  })

  it('asks the chosen model for low effort: classification, not reasoning', async () => {
    answers([])
    await enrich([input('tx1', 'X')])
    expect(client.requests[0]).toMatchObject({
      model: 'claude-haiku-4-5',
      effort: 'low',
    })
  })

  it('finds the JSON when the model wraps it in fences', async () => {
    answers(
      '```json\n[{"id":"tx1","displayDescription":"Devoto","category":"groceries"}]\n```'
    )
    const { results } = await enrich([input('tx1', 'DEVOTO')])
    expect(results.get('tx1')?.category).toBe('groceries')
  })

  it('falls back to 0.7 confidence when AI omits the field', async () => {
    answers([
      { id: 'tx1', displayDescription: 'Unknown', category: 'uncategorized' },
    ])
    const { results } = await enrich([input('tx1', 'XXXX')])
    expect(results.get('tx1')?.confidence).toBe(0.7)
  })

  it('clamps out-of-range confidence values to [0, 0.99]', async () => {
    answers([
      {
        id: 'tx1',
        displayDescription: 'Netflix',
        category: 'entertainment',
        confidence: 1.5,
      },
      {
        id: 'tx2',
        displayDescription: 'Unknown',
        category: 'uncategorized',
        confidence: -0.2,
      },
    ])
    const { results } = await enrich([
      input('tx1', 'NETFLIX', { currency: 'USD', source: 'credit_card' }),
      input('tx2', 'XXXX'),
    ])
    // The upper bound is just below 1: confidence 1 is reserved for the user
    expect(results.get('tx1')?.confidence).toBe(0.99)
    expect(results.get('tx2')?.confidence).toBe(0)
  })

  it('includes custom categories in the system prompt', async () => {
    answers([
      { id: 'tx1', displayDescription: 'Starbucks', category: 'coffee' },
    ])
    const { results } = await enrich([input('tx1', 'STARBUCKS')], {
      ...emptyContext,
      customCategories,
    })
    expect(results.get('tx1')?.category).toBe('coffee')
    expect(client.requests[0].system).toContain('coffee — Coffee')
  })

  it('coerces invalid category to uncategorized', async () => {
    answers([
      {
        id: 'tx1',
        displayDescription: 'Somewhere',
        category: 'food_and_drink',
      },
    ])
    const { results } = await enrich([input('tx1', 'SOMEWHERE')])
    expect(results.get('tx1')?.category).toBe(Category.Uncategorized)
  })

  it('skips items of the wrong shape instead of losing the batch', async () => {
    answers([
      { id: 'tx1', displayDescription: 'Devoto', category: 5 },
      { id: 7, displayDescription: 'Seven', category: 'groceries' },
      null,
      'tx3',
      { id: 'tx4', displayDescription: 'Netflix', category: 'entertainment' },
    ])

    const { results, partialFailure } = await enrich([
      input('tx1', 'DEVOTO'),
      input('tx4', 'NETFLIX'),
    ])

    expect([...results.keys()]).toEqual(['tx4'])
    expect(partialFailure).toBeUndefined()
    expect(reporting.captureError).not.toHaveBeenCalled()
  })

  it('silently drops items with missing id', async () => {
    answers([
      { displayDescription: 'No ID', category: 'groceries' },
      { id: 'tx2', displayDescription: 'Netflix', category: 'entertainment' },
    ])
    const { results } = await enrich([
      input('tx1', 'DEVOTO'),
      input('tx2', 'NETFLIX'),
    ])
    expect(results.has('tx1')).toBe(false)
    expect(results.get('tx2')?.category).toBe('entertainment')
  })

  it('throws on unparseable JSON response, and reports it as a bad response', async () => {
    answers('not json at all')

    const error = await enrich([input('tx1', 'DEVOTO')]).catch(
      (e: unknown) => e
    )

    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('bad_response')
    expect((error as AiError).message).toMatch(
      /^no se pudo parsear la respuesta del modelo/
    )
    expect(reporting.captureError).toHaveBeenCalledTimes(1)
    expect(reporting.captureError).toHaveBeenCalledWith(error, 'ai')
  })

  it('treats JSON that is not a list as a bad response, not a crash', async () => {
    answers('{"id":"tx1"}')

    const error = await enrich([input('tx1', 'DEVOTO')]).catch(
      (e: unknown) => e
    )

    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('bad_response')
  })

  it('includes source field in the user message', async () => {
    answers([])
    await enrich([
      input('tx1', 'PAGO RECIBIDO', {
        type: 'credit',
        amount: 1200,
        source: 'credit_card',
      }),
    ])
    expect(userMessageOf(0)).toContain('"source":"credit_card"')
  })

  it('includes correction examples in the user message', async () => {
    answers([])
    await enrich([input('tx1', 'DEVOTO')], {
      descriptionExamples: [
        { raw: 'SUPERM DEVOTO', friendly: 'Devoto', category: 'groceries' },
      ],
      categoryExamples: [{ merchant: 'tintoreria', category: 'personal' }],
      customCategories: noCustomCategories,
      customPatterns: [],
    })
    expect(userMessageOf(0)).toContain('SUPERM DEVOTO')
    expect(userMessageOf(0)).toContain('tintoreria')
  })

  it('includes custom pattern rules in the user message', async () => {
    answers([])
    const customPatterns: CustomPattern[] = [
      {
        id: 'cp1',
        pattern: 'farmacia',
        matchType: 'contains',
        category: 'healthcare',
        createdAt: '',
      },
      {
        id: 'cp2',
        pattern: 'ute ',
        matchType: 'starts_with',
        category: 'utilities',
        createdAt: '',
      },
      {
        id: 'cp3',
        pattern: 'salario empresa srl',
        matchType: 'exact',
        category: 'income',
        createdAt: '',
      },
    ]
    await enrich([input('tx1', 'FARMACIA DEVOTO')], {
      ...emptyContext,
      customPatterns,
    })
    const userMessage = userMessageOf(0)
    expect(userMessage).toContain('USER RULES (always apply these')
    expect(userMessage).toContain('contains "farmacia" → healthcare')
    expect(userMessage).toContain('starts with "ute " → utilities')
    expect(userMessage).toContain('exact "salario empresa srl" → income')
  })

  it('omits USER RULES block when no custom patterns exist', async () => {
    answers([])
    await enrich([input('tx1', 'NETFLIX')])
    expect(userMessageOf(0)).not.toContain('USER RULES')
  })

  it('throws when the call fails (caller handles fallback)', async () => {
    answers({ throws: new AiError('unavailable') })
    await expect(enrich([input('tx1', 'DEVOTO')])).rejects.toThrow(
      'el servicio de IA no está disponible en este momento'
    )
  })
})

describe('enrichTransactionsWithAi — response truncation', () => {
  it('passes a cut-off answer on as the client named it', async () => {
    const truncated = new AiError('truncated')
    answers({ throws: truncated })

    await expect(enrich(makeInputs(1))).rejects.toBe(truncated)
  })

  it('keeps every batch inside the output token budget, and sends them all', async () => {
    answers([])

    await enrich(makeInputs(400))

    const batchSizes = client.requests.map(
      (request) => (request.user.match(/"id":"tx\d+"/g) ?? []).length
    )

    // The property that matters is the one that broke: a batch's worst-case
    // output must fit under max_tokens. Each result object costs ~60 output
    // tokens, and max_tokens is 16000.
    const WORST_CASE_TOKENS_PER_RESULT = 60
    const maxTokens = client.requests[0].maxTokens
    expect(Math.max(...batchSizes) * WORST_CASE_TOKENS_PER_RESULT).toBeLessThan(
      maxTokens
    )

    // ...and nothing may be dropped while batching.
    expect(batchSizes.reduce((a, b) => a + b, 0)).toBe(400)
  })
})

describe('enrichTransactionsWithAi — partial batch failures', () => {
  beforeEach(() => {
    reporting.captureError.mockClear()
  })

  it('keeps results from batches that succeeded, and says how many failed and why', async () => {
    answers(
      [{ id: 'tx0', displayDescription: 'Devoto', category: 'groceries' }],
      { throws: new AiError('unavailable') },
      []
    )

    const { results, partialFailure } = await enrich(makeInputs(450))

    expect(results.get('tx0')?.category).toBe('groceries')
    expect(partialFailure).toBe(
      '1 de 3 lotes fallaron (el servicio de IA no está disponible en este momento)'
    )
  })

  it('reports no partial failure when every batch succeeds', async () => {
    answers([])

    const { partialFailure } = await enrich(makeInputs(450))

    expect(partialFailure).toBeUndefined()
  })

  it('rethrows the first error as thrown when every batch fails', async () => {
    const bug = new TypeError('x is undefined')
    answers({ throws: bug })

    await expect(enrich(makeInputs(450))).rejects.toBe(bug)
  })

  it('reports a code bug in a later batch even when an earlier one hit a rate limit', async () => {
    const bug = new TypeError('x is undefined')
    answers({ throws: new AiError('rate_limit') }, { throws: bug }, [])

    await enrich(makeInputs(450))

    expect(reporting.captureError).toHaveBeenCalledTimes(1)
    expect(reporting.captureError).toHaveBeenCalledWith(bug, 'ai')
  })

  it('reports a code bug once even when every batch fails with it', async () => {
    const bug = new TypeError('x is undefined')
    answers({ throws: bug })

    await expect(enrich(makeInputs(450))).rejects.toBe(bug)

    expect(reporting.captureError).toHaveBeenCalledTimes(1)
    expect(reporting.captureError).toHaveBeenCalledWith(bug, 'ai')
  })

  it('reports a bug before the first batch, then rethrows it', async () => {
    answers([])
    const malformed = { ...emptyContext, customCategories: null as never }

    const error = await enrich(makeInputs(10), malformed).catch(
      (e: unknown) => e
    )

    expect(error).toBeInstanceOf(TypeError)
    expect(reporting.captureError).toHaveBeenCalledWith(error, 'ai')
  })

  it('counts the batches a bad key left unsent as failed', async () => {
    answers([], { throws: new AiError('auth') })

    const { partialFailure } = await enrich(makeInputs(450))

    expect(partialFailure).toBe(
      '2 de 3 lotes fallaron (la clave API de Anthropic no es válida)'
    )
  })

  it('keeps the message of a non-Error rejection', async () => {
    answers({ throws: { message: '529 overloaded' } })

    await expect(enrich(makeInputs(450))).rejects.toThrow('529 overloaded')
  })

  it('does not report a failure the user can act on', async () => {
    for (const kind of [
      'auth',
      'rate_limit',
      'billing',
      'unavailable',
      'network',
      'stale_chunk',
      'refused',
      'truncated',
    ] as const) {
      answers({ throws: new AiError(kind) })
      await expect(enrich(makeInputs(450))).rejects.toThrow()
    }

    expect(reporting.captureError).not.toHaveBeenCalled()
  })

  it('throws when no batch succeeds at all', async () => {
    answers({ throws: new AiError('auth') })

    await expect(enrich(makeInputs(450))).rejects.toThrow(
      'la clave API de Anthropic no es válida'
    )
  })
})

describe('enrichTransactionsWithAi — prompt caching', () => {
  it('marks the system prompt as cacheable so it is not re-billed per batch', async () => {
    answers([])

    await enrich(makeInputs(450))

    expect(client.requests).toHaveLength(3)
    for (const request of client.requests) {
      expect(request.cacheSystem).toBe(true)
    }
  })

  it('sends a byte-identical system prompt across batches so the prefix hits', async () => {
    answers([])

    await enrich(makeInputs(450))

    const prompts = client.requests.map((request) => request.system)
    expect(new Set(prompts).size).toBe(1)
  })
})

describe('enrichTransactionsWithAi — failures every batch would repeat', () => {
  // A bad key or an empty account fails identically for every batch.
  // Carrying on would fire one doomed request per batch before the user
  // sees the same message.
  it('stops immediately on an auth error instead of retrying every batch', async () => {
    answers({ throws: new AiError('auth') })

    await expect(enrich(makeInputs(600))).rejects.toThrow(
      'la clave API de Anthropic no es válida'
    )

    expect(client.requests).toHaveLength(1)
  })

  it('names the failure that stopped the run, not an earlier transient one', async () => {
    const auth = new AiError('auth')
    answers({ throws: new AiError('rate_limit') }, { throws: auth })

    await expect(enrich(makeInputs(600))).rejects.toBe(auth)
  })

  it('names the failure that stopped a partial run', async () => {
    answers(
      [],
      { throws: new AiError('rate_limit') },
      { throws: new AiError('auth') }
    )

    const { partialFailure } = await enrich(makeInputs(600))

    expect(partialFailure).toBe(
      '3 de 4 lotes fallaron (la clave API de Anthropic no es válida)'
    )
  })

  it('stops immediately when the account has no credit', async () => {
    answers({ throws: new AiError('billing') })

    await expect(enrich(makeInputs(600))).rejects.toThrow(
      'la cuenta de Anthropic no tiene saldo'
    )

    expect(client.requests).toHaveLength(1)
  })

  it('keeps trying later batches after a transient error', async () => {
    answers({ throws: new AiError('unavailable') }, [
      { id: 'tx199', displayDescription: 'Devoto', category: 'groceries' },
    ])

    const { results, partialFailure } = await enrich(makeInputs(450))

    expect(client.requests.length).toBeGreaterThan(1)
    expect(results.get('tx199')?.category).toBe('groceries')
    expect(partialFailure).toContain('no está disponible')
  })
})
