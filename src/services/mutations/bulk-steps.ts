import { PartialWriteError } from '../../utils/user-error'

export interface BulkStep {
  label: string
  run: () => Promise<unknown>
}

/**
 * Runs a bulk edit's steps (category, then each tag) in order and returns
 * the most rows any step updated. When a step saves only some rows, the
 * PartialWriteError it throws gets a retry that resumes the chain: that
 * step's failed rows, then every step that never ran.
 */
export async function runBulkSteps(
  steps: BulkStep[],
  onApplied: (label: string) => void = () => {}
): Promise<number> {
  let updated = 0
  for (let i = 0; i < steps.length; i++) {
    let result: unknown
    try {
      result = await steps[i].run()
    } catch (error) {
      if (error instanceof PartialWriteError && error.retry) {
        const rest = steps.slice(i + 1)
        const retryStep = error.retry
        throw new PartialWriteError(
          error.message,
          error.done,
          error.total,
          () =>
            runBulkSteps([{ label: steps[i].label, run: retryStep }, ...rest]),
          error.result
        )
      }
      throw error
    }
    onApplied(steps[i].label)
    const stepUpdated = (result as { updated?: number } | undefined)?.updated
    updated = Math.max(updated, stepUpdated ?? 0)
  }
  return updated
}
