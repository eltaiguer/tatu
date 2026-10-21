import {
  captureError,
  isNetworkError,
} from '../services/monitoring/error-reporting'

// Errors whose message is already written for the user (Spanish, no jargon).
// Anything else — Supabase/PostgREST text, fetch failures — is translated by
// `userErrorMessage` so raw English never reaches a toast.
export class UserFacingError extends Error {
  /** Not a bug: error reporting drops it (services/monitoring). */
  readonly explained = true
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
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
    readonly result?: R
  ) {
    super(message)
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
    return error.message
  }
  console.error(error)
  // A lost connection is the user's network, and the text says so.
  if (isNetworkError(error)) {
    return 'Sin conexión con el servidor. Revisá tu conexión e intentá de nuevo.'
  }
  captureError(error, area)
  return fallback
}

const AI_UNEXPECTED = 'error inesperado del servicio de IA'

// The Anthropic SDK reports failures in English with status codes; turn the
// ones users can act on into Spanish. Messages the app itself wrote (already
// Spanish) pass through, and a partial-failure prefix ("2 de 12 lotes
// fallaron: …") is kept so a partial failure never reads like an outage.
export function aiErrorMessage(raw: string): string {
  const partial = raw.match(/^(\d+ de \d+ lotes fallaron): ([\s\S]*)$/)
  if (partial) {
    return `${partial[1]} (${aiErrorMessage(partial[2])})`
  }
  if (
    /^(La respuesta|Respuesta inesperada|No se pudo|El modelo rechazó)/.test(
      raw
    )
  ) {
    return raw
  }
  const text = raw.toLowerCase()
  if (/\b40[13]\b|invalid x-api-key|authentication|api key/.test(text)) {
    return 'la clave API de Anthropic no es válida'
  }
  if (/\b429\b|rate limit|rate_limit/.test(text)) {
    return 'se alcanzó el límite de uso de la API'
  }
  if (/credit|billing|insufficient/.test(text)) {
    return 'la cuenta de Anthropic no tiene saldo'
  }
  if (/\b(?:529|50[0-9])\b|overloaded|unavailable/.test(text)) {
    return 'el servicio de IA no está disponible en este momento'
  }
  // The SDK loads on demand; after a deploy its old chunk is gone (#62).
  if (
    /dynamically imported module|importing a module script failed/.test(text)
  ) {
    return 'la app se actualizó; recargá la página'
  }
  if (/failed to fetch|network|connection|timed out|aborted/.test(text)) {
    return 'sin conexión con Anthropic'
  }
  return AI_UNEXPECTED
}

// A JavaScript engine error is a bug in our code whatever its message says
// ("reading 'connection'" is not a lost connection).
const CHUNK_LOAD_FAILED =
  /dynamically imported module|importing a module script failed/i

const CODE_BUG_TYPES = [TypeError, ReferenceError, RangeError, SyntaxError]

// Whether an AI failure is worth reporting as a bug: a code bug, an unknown
// failure, or one the app raised itself (e.g. a malformed model response). A
// bad key, a rate limit, no credit or an outage is the user's setup or
// Anthropic's, and the toast already explains it.
export function isUnexpectedAiError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error)
  // A lost connection or a chunk gone after a deploy (both TypeErrors), and
  // a refusal that depends on the user's data, are not code bugs.
  if (isNetworkError(error) || CHUNK_LOAD_FAILED.test(raw)) return false
  if (/^(El modelo rechazó|La respuesta del modelo quedó truncada)/.test(raw)) {
    return false
  }
  if (CODE_BUG_TYPES.some((type) => error instanceof type)) return true
  const message = aiErrorMessage(raw)
  return message === raw || message === AI_UNEXPECTED
}

/** Reports an AI failure only when it is a bug (see isUnexpectedAiError). */
export function reportAiError(error: unknown, area: string): void {
  if (isUnexpectedAiError(error)) captureError(error, area)
}
