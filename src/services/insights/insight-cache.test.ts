import { beforeEach, describe, expect, it } from 'vitest'
import type { InsightInput } from './insight-data'
import type { InsightsResult } from './insight-generator'

import {
  hashInsightInput,
  getCachedInsights,
  saveCachedInsights,
} from './insight-cache'
import {
  HOUSEHOLD_INSIGHT_PROMPT_VERSION,
  INSIGHT_PROMPT_VERSION,
} from './insight-prompt'
import { INSIGHTS_MODEL } from '../ai/models'
import {
  createInMemoryRepository,
  type InMemoryRepository,
} from '../repository/in-memory-repository'

let repo: InMemoryRepository
beforeEach(() => {
  repo = createInMemoryRepository()
})

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
  it('returns null when there is no cached row', async () => {
    const cached = await getCachedInsights(repo, input)
    expect(cached).toBeNull()
  })

  it('marks the result fresh when the stored hash matches the current input', async () => {
    repo.insights = {
      inputHash: hashInsightInput(input),
      model: INSIGHTS_MODEL,
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    }

    const cached = await getCachedInsights(repo, input)
    expect(cached).toEqual({
      result,
      model: INSIGHTS_MODEL,
      generatedAt: '2026-06-30T12:00:00.000Z',
      isStale: false,
    })
  })

  it('marks the result stale when the stored hash no longer matches the input', async () => {
    repo.insights = {
      inputHash: 'stale-hash',
      model: 'claude-opus-4-8',
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    }

    const cached = await getCachedInsights(repo, input)
    expect(cached?.isStale).toBe(true)
  })

  it('marks the result stale when it was generated with an older prompt version', async () => {
    repo.insights = {
      inputHash: hashInsightInput(input, {
        promptVersion: INSIGHT_PROMPT_VERSION - 1,
      }),
      model: INSIGHTS_MODEL,
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    }

    const cached = await getCachedInsights(repo, input)
    expect(cached?.isStale).toBe(true)
  })

  it('marks the result stale when it was generated with a different model', async () => {
    repo.insights = {
      inputHash: hashInsightInput(input, { model: 'claude-old-model' }),
      model: 'claude-old-model',
      insights: result,
      generatedAt: '2026-06-30T12:00:00.000Z',
    }

    const cached = await getCachedInsights(repo, input)
    expect(cached?.isStale).toBe(true)
  })

  it('marks a result saved with the current prompt and model as fresh', async () => {
    await saveCachedInsights(repo, input, result, INSIGHTS_MODEL)

    const cached = await getCachedInsights(repo, input)
    expect(cached?.isStale).toBe(false)
  })

  it('marks a result saved by a different model as stale', async () => {
    await saveCachedInsights(repo, input, result, 'claude-old-model')

    const cached = await getCachedInsights(repo, input)
    expect(cached?.isStale).toBe(true)
  })
})

describe('saveCachedInsights', () => {
  it('saves the result with the computed input hash', async () => {
    await saveCachedInsights(repo, input, result, INSIGHTS_MODEL)

    expect(repo.insights).toMatchObject({
      inputHash: hashInsightInput(input),
      model: INSIGHTS_MODEL,
      insights: result,
    })
  })
})

describe('hashInsightInput — Todo and Hogar (#251)', () => {
  const todoInput: InsightInput = {
    historyStart: '2026-01-05',
    historyEnd: '2026-06-30',
    homeCurrency: 'USD',
    categoryTotals: [
      { category: 'groceries', amount: 100.5, pctOfTotal: 66.67 },
    ],
    topMerchants: [{ merchant: 'Tienda Inglesa', amount: 100.5, count: 3 }],
    recurringCharges: [
      {
        merchant: 'Netflix',
        approxAmount: 12.99,
        cadence: 'monthly',
        monthsSeen: 4,
        lastSeenMonth: '2026-06',
        monthsSinceLastSeen: 0,
      },
    ],
    monthlyTrend: [{ month: '2026-06', income: 2000, expense: 150.75 }],
  }

  it('keeps every cached Todo row fresh: the hash of a fixed input is the one main computed', () => {
    // Computed on main (3bc0667) before household Insights. If this fails,
    // every user's cached Todo insights just went stale.
    expect(hashInsightInput(todoInput)).toBe('f8836ae3')
  })

  it('hashes the same rows differently in Hogar', () => {
    const hogar: InsightInput = { ...todoInput, scope: 'hogar' }
    expect(hashInsightInput(hogar)).not.toBe(hashInsightInput(todoInput))
  })

  it('folds the base and the Hogar prompt versions into a Hogar hash', () => {
    const hogar: InsightInput = { ...todoInput, scope: 'hogar' }
    expect(HOUSEHOLD_INSIGHT_PROMPT_VERSION).toBe(1)
    expect(
      hashInsightInput(hogar, {
        promptVersion: `${INSIGHT_PROMPT_VERSION}.${HOUSEHOLD_INSIGHT_PROMPT_VERSION + 1}`,
      })
    ).not.toBe(hashInsightInput(hogar))
    expect(hashInsightInput(hogar)).toBe(
      hashInsightInput(hogar, {
        promptVersion: `${INSIGHT_PROMPT_VERSION}.${HOUSEHOLD_INSIGHT_PROMPT_VERSION}`,
      })
    )
  })
})

describe('Hogar cache (#251)', () => {
  const hogarInput: InsightInput = { ...input, scope: 'hogar' }
  const hogarResult: InsightsResult = {
    insights: [
      {
        type: 'trend',
        title: 'Hogar',
        narrative: 'n',
        currency: 'USD',
        severity: 'low',
      },
    ],
  }

  it('saves a Hogar result in its own row and leaves Todo untouched', async () => {
    await saveCachedInsights(repo, input, result, INSIGHTS_MODEL)
    await saveCachedInsights(repo, hogarInput, hogarResult, INSIGHTS_MODEL)

    expect(repo.insights?.insights).toEqual(result)
    expect(repo.householdInsights).toMatchObject({
      inputHash: hashInsightInput(hogarInput),
      insights: hogarResult,
    })
  })

  it('looks a Hogar input up in the Hogar row only', async () => {
    await saveCachedInsights(repo, input, result, INSIGHTS_MODEL)
    expect(await getCachedInsights(repo, hogarInput)).toBeNull()

    await saveCachedInsights(repo, hogarInput, hogarResult, INSIGHTS_MODEL)

    expect((await getCachedInsights(repo, hogarInput))?.result).toEqual(
      hogarResult
    )
    expect((await getCachedInsights(repo, hogarInput))?.isStale).toBe(false)
    expect((await getCachedInsights(repo, input))?.result).toEqual(result)
  })

  it('marks Hogar stale when its household figures change', async () => {
    await saveCachedInsights(repo, hogarInput, hogarResult, INSIGHTS_MODEL)
    const changed: InsightInput = {
      ...hogarInput,
      categoryTotals: [{ category: 'groceries', amount: 5, pctOfTotal: 100 }],
    }

    expect((await getCachedInsights(repo, changed))?.isStale).toBe(true)
  })
})
