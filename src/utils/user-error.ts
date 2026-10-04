// Errors whose message is already written for the user (Spanish, no jargon).
// Anything else — Supabase/PostgREST text, fetch failures — is translated by
// `userErrorMessage` so raw English never reaches a toast.
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

// Thrown by delete handlers before writing anything when the delete can't be
// undone (split parents hard-delete their parts); the UI must confirm first.
export class NeedsConfirmationError extends Error {
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

function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|networkerror|load failed|network request failed/i.test(
    message
  )
}

export function userErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) {
    return error.message
  }
  console.error(error)
  if (isNetworkError(error)) {
    return 'Sin conexión con el servidor. Revisá tu conexión e intentá de nuevo.'
  }
  return fallback
}

// The Anthropic SDK reports failures in English with status codes; turn the
// ones users can act on into Spanish. Messages the app itself wrote (already
// Spanish) pass through, and a partial-failure prefix ("2 de 12 lotes
// fallaron: …") is kept so a partial failure never reads like an outage.
export function aiErrorMessage(raw: string): string {
  const partial = raw.match(/^(\d+ de \d+ lotes fallaron): ([\s\S]*)$/)
  if (partial) {
    return `${partial[1]} (${aiErrorMessage(partial[2])})`
  }
  if (/^(La respuesta|Respuesta inesperada|No se pudo)/.test(raw)) {
    return raw
  }
  const text = raw.toLowerCase()
  if (/401|403|invalid x-api-key|authentication|api key/.test(text)) {
    return 'la clave API de Anthropic no es válida'
  }
  if (/429|rate limit|rate_limit/.test(text)) {
    return 'se alcanzó el límite de uso de la API'
  }
  if (/credit|billing|insufficient/.test(text)) {
    return 'la cuenta de Anthropic no tiene saldo'
  }
  if (/529|overloaded|50[0-9]|unavailable/.test(text)) {
    return 'el servicio de IA no está disponible en este momento'
  }
  // The SDK loads on demand; after a deploy its old chunk is gone (#62).
  if (
    /dynamically imported module|importing a module script failed/.test(text)
  ) {
    return 'la app se actualizó; recargá la página'
  }
  if (/failed to fetch|network|connection/.test(text)) {
    return 'sin conexión con Anthropic'
  }
  return 'error inesperado del servicio de IA'
}
