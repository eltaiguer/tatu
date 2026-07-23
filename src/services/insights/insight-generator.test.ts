import { describe, expect, it, vi } from 'vitest'
import type { InsightInput } from './insight-data'

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

import { parseInsightsResponse, generateInsights } from './insight-generator'

const baseInput: InsightInput = {
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  homeCurrency: 'USD',
  categoryTotals: [
    { category: 'restaurants', amount: 120, pctOfTotal: 40, deltaVsPriorPeriod: 34 },
    { category: 'groceries', amount: 80, pctOfTotal: 26.7, deltaVsPriorPeriod: -10 },
  ],
  topMerchants: [{ merchant: 'Netflix', amount: 15, count: 1 }],
  recurringCharges: [
    { merchant: 'Spotify', approxAmount: 12, cadence: 'monthly', monthsSeen: 4 },
  ],
  monthlyTrend: [{ month: '2026-06', income: 1000, expense: 300 }],
}

describe('parseInsightsResponse', () => {
  it('parses a well-formed JSON response', () => {
    const text = JSON.stringify({
      insights: [
        {
          type: 'bleeding_money',
          title: 'Restaurantes creció fuerte',
          narrative: 'El gasto en restaurantes subió $34 este mes.',
          amount: 34,
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
      title: 'Restaurantes creció fuerte',
      narrative: 'El gasto en restaurantes subió $34 este mes.',
      amount: 34,
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

  it('accepts an amount that matches a deltaVsPriorPeriod value', () => {
    const text = JSON.stringify({
      insights: [
        {
          type: 'bleeding_money',
          title: 'Creció fuerte',
          narrative: 'Subió respecto al mes anterior.',
          amount: -10,
          severity: 'medium',
        },
      ],
    })

    const result = parseInsightsResponse(text, baseInput)
    expect(result.insights[0].amount).toBe(-10)
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

    expect(parseInsightsResponse(text, baseInput).insights[0].severity).toBe('medium')
  })

  it('throws a descriptive error when the response is not valid JSON', () => {
    expect(() => parseInsightsResponse('not json at all', baseInput)).toThrow(
      /No se pudo parsear/
    )
  })
})

describe('generateInsights', () => {
  it('calls Claude with the insights model and the user\'s API key', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ insights: [] }) }],
    })

    await generateInsights(baseInput, 'sk-test-key')

    expect(messagesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-8',
        messages: [{ role: 'user', content: expect.stringContaining('"periodStart"') }],
      })
    )
  })

  it('throws if the model returns a non-text content block', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'image' }],
    })

    await expect(generateInsights(baseInput, 'sk-test-key')).rejects.toThrow(
      /Respuesta inesperada/
    )
  })
})
