// The cache lookup, the running generation and the error of Insights, one set
// per mode (Todo / Hogar, ADR-0005). Two analyses share the screen but not
// their state: a generation always lands in the mode it started in, whichever
// mode is on screen when it finishes; a lookup only fills a mode that no
// generation has written meanwhile; an error belongs to its mode. Staleness is
// derived on render from the hash of the input a result came from, so a result
// that finishes after the data changed shows the banner too.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  InsightInput,
  InsightsMode,
} from '../../services/insights/insight-data'
import type { Repository } from '../../services/repository/repository'
import type { ClaudeClient } from '../../services/ai/claude-client'
import {
  generateInsights,
  type InsightsResult,
} from '../../services/insights/insight-generator'
import {
  hashInsightInput,
  loadCachedLookup,
  saveCachedInsights,
} from '../../services/insights/insight-cache'
import { INSIGHTS_MODEL } from '../../services/ai/models'
import {
  aiErrorMessage,
  reportAiError,
  userErrorMessage,
} from '../../utils/user-error'

interface Shown {
  result: InsightsResult
  generatedAt: string
  inputHash: string
}

interface ModeState {
  /** Looked up, or written by a generation (then `shown` may be null: no cache). */
  known: boolean
  shown: Shown | null
  error: string
  generating: boolean
}

const BLANK: ModeState = {
  known: false,
  shown: null,
  error: '',
  generating: false,
}

type ByMode = Record<InsightsMode, ModeState>

const INITIAL: ByMode = { todo: BLANK, hogar: BLANK }

export interface InsightsView {
  /** What to show for the mode on screen, with its staleness. */
  cached: (Shown & { isStale: boolean }) | null
  /** The mode's cache was looked up (a failed lookup counts: no cache). */
  lookedUp: boolean
  generating: boolean
  error: string
  generate: () => Promise<void>
}

export function useInsightsByMode({
  repository,
  mode,
  input,
  isConfigured,
  claudeApiKey,
  claudeClient,
}: {
  repository: Repository
  mode: InsightsMode
  /** The input of `mode`; null when there is nothing to analyze in it. */
  input: InsightInput | null
  isConfigured: boolean
  claudeApiKey: string
  claudeClient?: ClaudeClient
}): InsightsView {
  const [state, setState] = useState<{
    repository: Repository
    byMode: ByMode
  }>({ repository, byMode: INITIAL })
  // Another user's repository starts from nothing.
  const byMode = state.repository === repository ? state.byMode : INITIAL

  // Bumped when a generation writes a mode: a lookup that began before it is
  // out of date and must not overwrite it.
  const writes = useRef<Record<InsightsMode, number>>({ todo: 0, hogar: 0 })
  const update = useCallback(
    (
      forRepository: Repository,
      forMode: InsightsMode,
      patch: Partial<ModeState>
    ) =>
      setState((current) => {
        const base =
          current.repository === forRepository ? current.byMode : INITIAL
        return {
          repository: forRepository,
          byMode: { ...base, [forMode]: { ...base[forMode], ...patch } },
        }
      }),
    []
  )

  const active = isConfigured && input !== null
  const known = byMode[mode].known

  // Looks a mode up once, when it is on screen and nothing is known of it.
  // It does not depend on the input: staleness is derived below, so a rule or
  // an import never refetches.
  useEffect(() => {
    if (!active || known) return
    let cancelled = false
    const startedWrites = writes.current[mode]
    loadCachedLookup(repository, mode)
      .then((row) => {
        if (cancelled || writes.current[mode] !== startedWrites) return
        update(repository, mode, {
          known: true,
          shown: row && {
            result: row.result,
            generatedAt: row.generatedAt,
            inputHash: row.inputHash,
          },
        })
      })
      .catch((e) => {
        if (cancelled || writes.current[mode] !== startedWrites) return
        // Not being able to read the cache is not being unable to generate.
        update(repository, mode, {
          known: true,
          error: userErrorMessage(
            e,
            'No se pudieron cargar los insights',
            'insights'
          ),
        })
      })
    return () => {
      cancelled = true
    }
  }, [repository, mode, active, known, update])

  const generate = useCallback(async () => {
    if (!input) return
    // This run belongs to the repository, mode and input it started with.
    const startedRepository = repository
    const startedMode = mode
    update(startedRepository, startedMode, { generating: true, error: '' })
    let step: 'generate' | 'save' = 'generate'
    try {
      const result = await generateInsights(
        input,
        claudeApiKey,
        ...(claudeClient ? [claudeClient] : [])
      )
      // Shown even if saving fails: it was generated (and paid for).
      writes.current[startedMode] += 1
      update(startedRepository, startedMode, {
        known: true,
        shown: {
          result,
          generatedAt: new Date().toISOString(),
          inputHash: hashInsightInput(input),
        },
      })
      step = 'save'
      await saveCachedInsights(startedRepository, input, result, INSIGHTS_MODEL)
    } catch (e) {
      if (step === 'generate') {
        reportAiError(e, 'insights')
        update(startedRepository, startedMode, {
          error: `No se pudieron generar los insights: ${aiErrorMessage(e)}`,
        })
      } else {
        update(startedRepository, startedMode, {
          error: userErrorMessage(
            e,
            'No se pudieron guardar los insights',
            'insights'
          ),
        })
      }
    } finally {
      update(startedRepository, startedMode, { generating: false })
    }
  }, [input, repository, mode, claudeApiKey, claudeClient, update])

  const inputHash = useMemo(() => input && hashInsightInput(input), [input])
  const { shown } = byMode[mode]
  const cached = useMemo(
    () => shown && { ...shown, isStale: shown.inputHash !== inputHash },
    [shown, inputHash]
  )

  return {
    cached,
    lookedUp: known,
    generating: byMode[mode].generating,
    error: byMode[mode].error,
    generate,
  }
}
