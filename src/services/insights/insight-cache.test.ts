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

import { hashInsightInput, getCachedInsights, saveCachedInsights } from './insight-cache'

const session = {
  user: { id: 'user-1' },
} as unknown as SupabaseSession

const input: InsightInput = {
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  homeCurrency: 'USD',
  categoryTotals: [
    { category: 'groceries', amount: 100, pctOfTotal: 100, deltaVsPriorPeriod: 0 },
  ],
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
      categoryTotals: [
        { category: 'groceries', amount: 999, pctOfTotal: 100, deltaVsPriorPeriod: 0 },
      ],
    }
    expect(hashInsightInput(input)).not.toBe(hashInsightInput(changed))
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
  })

  it('marks the result fresh when the stored hash matches the current input', async () => {
    loadCachedInsightsMock.mockResolvedValue({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      inputHash: hashInsightInput(input),
      model: 'claude-opus-4-8',
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    })

    const cached = await getCachedInsights(session, input)
    expect(cached).toEqual({
      result,
      model: 'claude-opus-4-8',
      generatedAt: '2026-06-30T12:00:00.000Z',
      isStale: false,
    })
  })

  it('marks the result stale when the stored hash no longer matches the input', async () => {
    loadCachedInsightsMock.mockResolvedValue({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      inputHash: 'stale-hash',
      model: 'claude-opus-4-8',
      insights: result,
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

  it('saves the result keyed by period with the computed input hash', async () => {
    saveInsightsMock.mockResolvedValue(undefined)

    await saveCachedInsights(session, input, result, 'claude-opus-4-8')

    expect(saveInsightsMock).toHaveBeenCalledWith(session, {
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      inputHash: hashInsightInput(input),
      model: 'claude-opus-4-8',
      insights: result,
    })
  })
})
