import {
  captureError,
  errorMessage,
  isNetworkError,
} from '../services/monitoring/error-reporting'
import { AiError } from '../services/ai/ai-error'

// Errors whose message is already written for the user (Spanish, no jargon).
// Anything else — Supabase/PostgREST text, fetch failures — is translated by
// `userErrorMessage` so raw English never reaches a toast.
export class UserFacingError extends Error {
  /** Not a bug: error reporting sends its `cause` instead, if any. */
  readonly explained = true
  /** The failure this message explains (a server error), for reporting. */
  readonly cause?: unknown
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'UserFacingError'
    if (options?.cause !== undefined) this.cause = options.cause
  }
}

// Thrown by delete handlers before writing anything when the delete can't be
// undone (split parents hard-delete their parts); the UI must confirm first.
export class NeedsConfirmationError extends Error {
  /** Not a bug: error reporting drops it (services/monitoring). */
  readonly explained = true
  constructor() {
    super('Esta eliminación no se puede deshacer')
    this.name = 'NeedsConfirmationError'
  }
}

/**
 * A write that reached the server for some rows only (#60): the screen
 * already shows exactly the rows that saved. `retry` re-sends only the rows
 * whose request failed (absent when only rows gone from the server are
 * left). `result` carries what a delete did remove, so it can still be
 * undone.
 */
export class PartialWriteError<R = unknown> extends UserFacingError {
  constructor(
    message: string,
    readonly done: number,
    readonly total: number,
    readonly retry?: () => Promise<unknown>,
    readonly result?: R,
    cause?: unknown
  ) {
    super(message, { cause })
    this.name = 'PartialWriteError'
  }
}

/**
 * The account changed while a write was in flight. What the server answered
 * belongs to the previous user and is not shown to the new one.
 */
export class WorkspaceChangedError extends UserFacingError {
  constructor() {
    super(
      'La sesión cambió mientras se guardaba el cambio; no se muestra en esta cuenta.'
    )
    this.name = 'WorkspaceChangedError'
  }
}

/**
 * The text to show for a failure. Errors the app wrote are shown as they are;
 * anything else is logged, reported (tagged with `area` when given) and
 * replaced by `fallback`.
 */
export function userErrorMessage(
  error: unknown,
  fallback: string,
  area?: string
): string {
  if (error instanceof UserFacingError) {
    captureError(error, area) // sends its cause, if it has one
    return error.message
  }
  console.error(error)
  // A lost connection is the user's network, and the text says so.
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  if (offline || isNetworkError(error)) {
    return 'Sin conexión con el servidor. Revisá tu conexión e intentá de nuevo.'
  }
  captureError(error, area)
  return fallback
}

const AI_UNEXPECTED = 'error inesperado del servicio de IA'

/**
 * The text to show for an AI failure. The Claude client
 * (services/ai/claude-client.ts) has already turned every failure the user
 * can act on into an `AiError` with a Spanish message; anything else is a
 * bug or a failure nobody explained, and its text never reaches the user.
 */
export function aiErrorMessage(error: unknown): string {
  return error instanceof AiError ? error.message : AI_UNEXPECTED
}

/**
 * Some batches of an AI run failed and the rest were applied. Keeps how many,
 * so a partial failure never reads like an outage.
 */
export function aiPartialFailureMessage(
  failed: number,
  total: number,
  firstError: unknown
): string {
  return `${failed} de ${total} lotes fallaron (${aiErrorMessage(firstError)})`
}

// The browser's words for a lazy chunk that is gone after a deploy.
const CHUNK_LOAD_FAILED =
  /dynamically imported module|importing a module script failed/i

/**
 * Whether an AI failure is worth reporting as a bug: an answer not in the
 * shape asked for, or anything the Claude client did not explain (a code
 * bug, a request the API rejected). A bad key, a rate limit, no credit, an
 * outage, a lost connection, a truncated or refused answer and a chunk gone
 * after a deploy are the user's setup, Anthropic's or the data's, and the
 * message already says so.
 */
export function isUnexpectedAiError(error: unknown): boolean {
  if (error instanceof AiError) return error.kind === 'bad_response'
  // Belt and braces for a failure that reached here without the client.
  return !(isNetworkError(error) || CHUNK_LOAD_FAILED.test(errorMessage(error)))
}

/** Reports an AI failure only when it is a bug (see isUnexpectedAiError). */
export function reportAiError(error: unknown, area: string): void {
  if (isUnexpectedAiError(error)) captureError(error, area)
}
