import { format } from 'node:util'

type GuardedLevel = 'error' | 'warn'

const GUARDED_LEVELS: GuardedLevel[] = ['error', 'warn']

export interface ConsoleGuard {
  /** Puts the guards back (undoing any per-test spy) and returns, then
   * forgets, the output logged since the last call. */
  takeUnexpected: () => string[]
  uninstall: () => void
}

/**
 * Replaces console.error/console.warn with plain functions that still print
 * but also record the call, so a test can be failed for unexpected output.
 *
 * Plain functions (not vi.spyOn) on purpose: test files that call
 * vi.restoreAllMocks() would otherwise silently remove the guard. A test that
 * expects output spies on top of the guard —
 * `vi.spyOn(console, 'error').mockImplementation(() => {})` — so the guard
 * never sees those calls; `takeUnexpected` then reinstalls the guard so the
 * spy doesn't leak into the next test.
 */
export function installConsoleGuard(target: Console = console): ConsoleGuard {
  const originals = {
    error: target.error,
    warn: target.warn,
  }
  let unexpected: string[] = []

  const guards = Object.fromEntries(
    GUARDED_LEVELS.map((level) => [
      level,
      (...args: unknown[]) => {
        unexpected.push(`console.${level}: ${format(...args)}`)
        originals[level].apply(target, args)
      },
    ])
  ) as Record<GuardedLevel, (...args: unknown[]) => void>

  const install = () => {
    for (const level of GUARDED_LEVELS) target[level] = guards[level]
  }
  install()

  return {
    takeUnexpected() {
      install()
      const taken = unexpected
      unexpected = []
      return taken
    },
    uninstall() {
      for (const level of GUARDED_LEVELS) target[level] = originals[level]
    },
  }
}
