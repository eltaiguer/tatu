import { captureError } from '../services/monitoring/error-reporting'

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
  captureError(error)
  if (isNetworkError(error)) {
    return 'Sin conexión con el servidor. Revisá tu conexión e intentá de nuevo.'
  }
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
  return AI_UNEXPECTED
}

// Whether an AI failure is worth reporting as a bug: an unexpected error, or
// one the app raised itself (e.g. a malformed model response). A bad key, a
// rate limit, no credit or an outage is the user's setup or Anthropic's, and
// the toast already explains it.
export function isUnexpectedAiError(raw: string): boolean {
  const message = aiErrorMessage(raw)
  return message === raw || message === AI_UNEXPECTED
}
