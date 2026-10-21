import {
  aiDiagnosticMessage,
  isUnexpectedAiError,
} from '../../utils/user-error'

/**
 * What a [Dev] panel shows for a failed run: an AI failure as the user would
 * read it, anything else (a bug) as its own text — these panels are
 * diagnostics. An unexpected failure is also logged, as `<what> failed:`.
 */
export function devFailureMessage(error: unknown, what: string): string {
  if (isUnexpectedAiError(error)) console.error(`${what} failed:`, error)
  return aiDiagnosticMessage(error)
}
