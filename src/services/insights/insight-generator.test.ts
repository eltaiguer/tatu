import { describe, expect, it } from 'vitest'
import type { InsightInput } from './insight-data'
import { buildInsightInput } from './insight-data'
import type { Transaction } from '../../models'
import { Category } from '../../models'
import { fakeClaudeClient } from '../../test/fake-claude-client'
import { AiError } from '../ai/ai-error'
import { buildInsightSystemPrompt } from './insight-prompt'
import { parseInsightsResponse, generateInsights } from './insight-generator'

const baseInput: InsightInput = {
  historyStart: '2026-01-01',
  historyEnd: '2026-06-30',
  homeCurrency: 'USD',
  categoryTotals: [
    { category: 'restaurants', amount: 120, pctOfTotal: 40 },
    { category: 'groceries', amount: 80, pctOfTotal: 26.7 },
  ],
  topMerchants: [{ merchant: 'Netflix', amount: 15, count: 1 }],
  recurringCharges: [
    {
      merchant: 'Spotify',
      approxAmount: 12,
      cadence: 'monthly',
      monthsSeen: 4,
      lastSeenMonth: '2026-06',
      monthsSinceLastSeen: 0,
    },
  ],
  monthlyTrend: [{ month: '2026-06', income: 1000, expense: 300 }],
}

describe('parseInsightsResponse', () => {
  it('parses a well-formed JSON response', () => {
    const text = JSON.stringify({
      insights: [
        {
          type: 'bleeding_money',
          title: 'Restaurantes domina tu gasto',
          narrative: 'El gasto en restaurantes es tu categoría más grande.',
          amount: 120,
          currency: 'USD',
          category: 'restaurants',
          severity: 'high',
        },
      ],
    })

    const result = parseInsightsResponse(text, baseInput)

    expect(result.insights).toHaveLength(1)
    expect(result.insights[0]).toEqual({
      type: 'bleeding_money',
      title: 'Restaurantes domina tu gasto',
      narrative: 'El gasto en restaurantes es tu categoría más grande.',
      amount: 120,
      currency: 'USD',
      category: 'restaurants',
      severity: 'high',
    })
  })

  it('strips markdown fences before parsing', () => {
    const text = '```json\n' + JSON.stringify({ insights: [] }) + '\n```'
    expect(parseInsightsResponse(text, baseInput).insights).toEqual([])
  })

  it('drops an insight whose amount does not match any value in the input', () => {
    const text = JSON.stringify({
      insights: [
        {
          type: 'bleeding_money',
          title: 'Gasto inventado',
          narrative: 'Este número no viene del input.',
          amount: 999999,
          currency: 'USD',
          severity: 'high',
        },
      ],
    })

    // The whole insight is dropped, not just the bad field — a title/narrative
    // pair that claims an unverifiable number is not trustworthy on its own.
    const result = parseInsightsResponse(text, baseInput)
    expect(result.insights).toHaveLength(1)
    expect(result.insights[0].amount).toBeUndefined()
  })

  it('drops a category or merchant not present in the input, keeping the rest of the insight', () => {
    const text = JSON.stringify({
      insights: [
        {
          type: 'easiest_cut',
          title: 'Título válido',
          narrative: 'Narrativa válida.',
          category: 'not_a_real_category',
          merchant: 'Merchant Inventado',
          severity: 'low',
        },
      ],
    })

    const result = parseInsightsResponse(text, baseInput)
    expect(result.insights[0].category).toBeUndefined()
    expect(result.insights[0].merchant).toBeUndefined()
  })

  it('accepts an amount that matches a recurringCharges approxAmount value', () => {
    const text = JSON.stringify({
      insights: [
        {
          type: 'recurring',
          title: 'Suscripción activa',
          narrative: 'Spotify se cobra todos los meses.',
          amount: 12,
          merchant: 'Spotify',
          severity: 'medium',
        },
      ],
    })

    const result = parseInsightsResponse(text, baseInput)
    expect(result.insights[0].amount).toBe(12)
    expect(result.insights[0].merchant).toBe('Spotify')
  })

  it('matches a merchant the model echoed with other accents, case or separator', () => {
    const input: InsightInput = {
      ...baseInput,
      topMerchants: [
        {
          merchant: 'JOSÉ PEÑA · Transf. instantánea enviada',
          amount: 15,
          count: 1,
        },
      ],
    }
    const echoed = [
      'JOSE PENA · Transf. instantanea enviada',
      'José Peña - Transf. instantánea enviada',
      'JOSÉ PEÑA  —  Transf. instantánea enviada',
    ]
    for (const merchant of echoed) {
      const text = JSON.stringify({
        insights: [
          {
            type: 'bleeding_money',
            title: 'Transferencias',
            narrative: 'x',
            merchant,
            severity: 'low',
          },
        ],
      })
      expect(parseInsightsResponse(text, input).insights[0].merchant).toBe(
        'JOSÉ PEÑA · Transf. instantánea enviada'
      )
    }
  })

  it('drops a merchant that matches two input merchants once folded', () => {
    const input: InsightInput = {
      ...baseInput,
      topMerchants: [
        { merchant: 'Uber - Eats', amount: 15, count: 1 },
        { merchant: 'UBER EATS', amount: 10, count: 1 },
      ],
    }
    const text = JSON.stringify({
      insights: [
        {
          type: 'bleeding_money',
          title: 'Delivery',
          narrative: 'x',
          merchant: 'uber eats',
          severity: 'low',
        },
      ],
    })
    expect(parseInsightsResponse(text, input).insights[0].merchant).toBe(
      undefined
    )
  })

  it('matches a merchant echoed with a space where the key folds a "*"', () => {
    const input: InsightInput = {
      ...baseInput,
      topMerchants: [{ merchant: 'MERPAGO*FOO', amount: 15, count: 1 }],
    }
    const text = JSON.stringify({
      insights: [
        {
          type: 'bleeding_money',
          title: 'Foo',
          narrative: 'x',
          merchant: 'MERPAGO FOO',
          severity: 'low',
        },
      ],
    })
    expect(parseInsightsResponse(text, input).insights[0].merchant).toBe(
      'MERPAGO*FOO'
    )
  })

  it('drops insights missing a title, narrative, or valid type', () => {
    const text = JSON.stringify({
      insights: [
        { type: 'bleeding_money', title: '', narrative: 'x', severity: 'low' },
        { type: 'not_a_type', title: 'x', narrative: 'x', severity: 'low' },
        { title: 'x', narrative: 'x', severity: 'low' },
      ],
    })

    expect(parseInsightsResponse(text, baseInput).insights).toHaveLength(0)
  })

  it('defaults severity to medium when missing or invalid', () => {
    const text = JSON.stringify({
      insights: [{ type: 'trend', title: 'x', narrative: 'y' }],
    })

    expect(parseInsightsResponse(text, baseInput).insights[0].severity).toBe(
      'medium'
    )
  })

  it('throws a bad response when the answer is not valid JSON', () => {
    let error: unknown
    try {
      parseInsightsResponse('not json at all', baseInput)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('bad_response')
    expect((error as AiError).message).toMatch(/No se pudo parsear/)
  })

  it('throws a bad response, not a crash, when the JSON is not an object', () => {
    let error: unknown
    try {
      parseInsightsResponse('null', baseInput)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('bad_response')
  })
})

describe('generateInsights', () => {
  const noInsights = () => JSON.stringify({ insights: [] })

  it('asks the insights model, with medium effort and room to think', async () => {
    const client = fakeClaudeClient(noInsights)

    await generateInsights(baseInput, 'sk-test-key', client)

    expect(client.requests).toHaveLength(1)
    const [request] = client.requests
    expect(request.model).toBe('claude-opus-5-5')
    expect(request.system).toBe(buildInsightSystemPrompt())
    expect(request.cacheSystem).toBeFalsy()
    expect(request.user).toContain('"historyStart"')
    expect(request.maxTokens).toBeGreaterThanOrEqual(16000)
    expect(request.effort).toBe('medium')
  })

  it("returns the sanitized insights from the model's answer", async () => {
    const client = fakeClaudeClient(() =>
      JSON.stringify({
        insights: [
          {
            type: 'trend',
            title: 'Restaurantes',
            narrative: 'Subió',
            amount: 120,
            severity: 'high',
          },
        ],
      })
    )

    const result = await generateInsights(baseInput, 'sk-test-key', client)

    expect(result.insights).toHaveLength(1)
    expect(result.insights[0]).toMatchObject({
      title: 'Restaurantes',
      amount: 120,
    })
  })

  it('passes a failure on as the client named it (truncated, refused, …)', async () => {
    const truncated = new AiError('truncated')
    const client = fakeClaudeClient(() => {
      throw truncated
    })

    await expect(
      generateInsights(baseInput, 'sk-test-key', client)
    ).rejects.toBe(truncated)
  })
})

describe('insight amounts survive the round trip from a real InsightInput', () => {
  it('keeps an amount the model echoed back from FX-converted spend', () => {
    // The real failure path: UYU spend converted to USD yields
    // 1234.5679012345679 unrounded. The prompt tells the model to copy the
    // number exactly, but reproducing float residue verbatim is not
    // something to rely on — so the input is rounded at source and both
    // sides agree on one value.
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2026-06-10T00:00:00.000Z'),
        description: 'RESTAURANTE X',
        amount: 50000,
        currency: 'UYU',
        type: 'debit',
        source: 'bank_account',
        category: Category.Restaurants,
        rawData: {},
      },
    ]

    const input = buildInsightInput(transactions, 'USD', 40.5)
    const amount = input.categoryTotals[0].amount
    expect(amount).toBe(1234.57)

    const result = parseInsightsResponse(
      JSON.stringify({
        insights: [
          {
            type: 'bleeding_money',
            title: 'Restaurantes domina tu gasto',
            narrative: 'Es tu categoría más grande.',
            amount,
            currency: 'USD',
            category: Category.Restaurants,
            severity: 'high',
          },
        ],
      }),
      input
    )

    expect(result.insights).toHaveLength(1)
    expect(result.insights[0].amount).toBe(1234.57)
  })

  it('still drops an amount that is not present in the input', () => {
    // ADR-0001's anti-hallucination guarantee must not regress: rounding at
    // source rather than loosening the validator is what keeps === exact.
    const result = parseInsightsResponse(
      JSON.stringify({
        insights: [
          {
            type: 'bleeding_money',
            title: 'Inventado',
            narrative: 'Número que el modelo se inventó.',
            amount: 99999.99,
            currency: 'USD',
            severity: 'high',
          },
        ],
      }),
      baseInput
    )

    expect(result.insights).toHaveLength(1)
    expect(result.insights[0].amount).toBeUndefined()
  })
})
