import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from '../supabase/client'
import type { InsightInput } from './insight-data'
import type { InsightsResult } from './insight-generator'

const { loadCachedInsightsMock, saveInsightsMock } = vi.hoisted(() => ({
  loadCachedInsightsMock: vi.fn(),
  saveInsightsMock: vi.fn(),
}))

vi.mock('../supabase/ai-insights', () => ({
  loadCachedInsights: loadCachedInsightsMock,
  saveInsights: saveInsightsMock,
}))

import {
  hashInsightInput,
  getCachedInsights,
  saveCachedInsights,
} from './insight-cache'
import { INSIGHT_PROMPT_VERSION } from './insight-prompt'
import { INSIGHTS_MODEL } from '../ai/models'

const session = {
  user: { id: 'user-1' },
} as unknown as SupabaseSession

const input: InsightInput = {
  historyStart: '2026-01-01',
  historyEnd: '2026-06-30',
  homeCurrency: 'USD',
  categoryTotals: [{ category: 'groceries', amount: 100, pctOfTotal: 100 }],
  topMerchants: [],
  recurringCharges: [],
  monthlyTrend: [],
}

const result: InsightsResult = { insights: [] }

describe('hashInsightInput', () => {
  it('is deterministic for the same input', () => {
    expect(hashInsightInput(input)).toBe(hashInsightInput({ ...input }))
  })

  it('changes when the input changes', () => {
    const changed: InsightInput = {
      ...input,
      categoryTotals: [{ category: 'groceries', amount: 999, pctOfTotal: 100 }],
    }
    expect(hashInsightInput(input)).not.toBe(hashInsightInput(changed))
  })

  it('changes when the prompt version changes', () => {
    expect(
      hashInsightInput(input, { promptVersion: INSIGHT_PROMPT_VERSION + 1 })
    ).not.toBe(hashInsightInput(input))
  })

  it('changes when the insights model changes', () => {
    expect(hashInsightInput(input, { model: 'claude-other-model' })).not.toBe(
      hashInsightInput(input)
    )
  })

  it('defaults to the current prompt version and insights model', () => {
    expect(hashInsightInput(input)).toBe(
      hashInsightInput(input, {
        promptVersion: INSIGHT_PROMPT_VERSION,
        model: INSIGHTS_MODEL,
      })
    )
  })
})

describe('getCachedInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when there is no cached row', async () => {
    loadCachedInsightsMock.mockResolvedValue(null)
    const cached = await getCachedInsights(session, input)
    expect(cached).toBeNull()
    expect(loadCachedInsightsMock).toHaveBeenCalledWith(session)
  })

  it('marks the result fresh when the stored hash matches the current input', async () => {
    loadCachedInsightsMock.mockResolvedValue({
      inputHash: hashInsightInput(input),
      model: INSIGHTS_MODEL,
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    })

    const cached = await getCachedInsights(session, input)
    expect(cached).toEqual({
      result,
      model: INSIGHTS_MODEL,
      generatedAt: '2026-06-30T12:00:00.000Z',
      isStale: false,
    })
  })

  it('marks the result stale when the stored hash no longer matches the input', async () => {
    loadCachedInsightsMock.mockResolvedValue({
      inputHash: 'stale-hash',
      model: 'claude-opus-4-8',
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    })

    const cached = await getCachedInsights(session, input)
    expect(cached?.isStale).toBe(true)
  })

  it('marks the result stale when it was generated with an older prompt version', async () => {
    loadCachedInsightsMock.mockResolvedValue({
      inputHash: hashInsightInput(input, {
        promptVersion: INSIGHT_PROMPT_VERSION - 1,
      }),
      model: INSIGHTS_MODEL,
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    })

    const cached = await getCachedInsights(session, input)
    expect(cached?.isStale).toBe(true)
  })

  it('marks the result stale when it was generated with a different model', async () => {
    loadCachedInsightsMock.mockResolvedValue({
      inputHash: hashInsightInput(input, { model: 'claude-old-model' }),
      model: 'claude-old-model',
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    })

    const cached = await getCachedInsights(session, input)
    expect(cached?.isStale).toBe(true)
  })

  it('marks a result saved with the current prompt and model as fresh', async () => {
    saveInsightsMock.mockResolvedValue(undefined)
    await saveCachedInsights(session, input, result, INSIGHTS_MODEL)
    const saved = saveInsightsMock.mock.calls[0][1]
    loadCachedInsightsMock.mockResolvedValue({
      ...saved,
      generatedAt: '2026-06-30T12:00:00.000Z',
    })

    const cached = await getCachedInsights(session, input)
    expect(cached?.isStale).toBe(false)
  })

  it('marks a result saved by a different model as stale', async () => {
    saveInsightsMock.mockResolvedValue(undefined)
    await saveCachedInsights(session, input, result, 'claude-old-model')
    const saved = saveInsightsMock.mock.calls[0][1]
    loadCachedInsightsMock.mockResolvedValue({
      ...saved,
      generatedAt: '2026-06-30T12:00:00.000Z',
    })

    const cached = await getCachedInsights(session, input)
    expect(cached?.isStale).toBe(true)
  })
})

describe('saveCachedInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves the result with the computed input hash', async () => {
    saveInsightsMock.mockResolvedValue(undefined)

    await saveCachedInsights(session, input, result, INSIGHTS_MODEL)

    expect(saveInsightsMock).toHaveBeenCalledWith(session, {
      inputHash: hashInsightInput(input),
      model: INSIGHTS_MODEL,
      insights: result,
    })
  })
})
