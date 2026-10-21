/**
 * How a Claude call failed, in terms the user can act on. The Claude client
 * (claude-client.ts) turns every failure it recognises into one of these;
 * anything else (a code bug, a request the API rejected as malformed) is
 * rethrown as it was, and is reported as a bug.
 */
export type AiErrorKind =
  /** The key is wrong or lacks permission (401/403). */
  | 'auth'
  /** Too many requests for the key's limits (429). */
  | 'rate_limit'
  /** The Anthropic account has no credit. */
  | 'billing'
  /** Anthropic is down or overloaded (5xx, 529). */
  | 'unavailable'
  /** No connection, a timeout or an aborted request. */
  | 'network'
  /** The answer hit `max_tokens` before it was complete. */
  | 'truncated'
  /** The SDK's on-demand chunk is gone after a deploy (#62). */
  | 'stale_chunk'
  /** The model's safety classifiers declined the request. */
  | 'refused'
  /** The model answered, but not in the shape asked for. */
  | 'bad_response'

// What the user reads. The first six finish a sentence the screen starts
// ("Categorización con IA no disponible: …"); the last three are whole
// sentences, as they were before the client existed.
const MESSAGES: Record<AiErrorKind, string> = {
  auth: 'la clave API de Anthropic no es válida',
  rate_limit: 'se alcanzó el límite de uso de la API',
  billing: 'la cuenta de Anthropic no tiene saldo',
  unavailable: 'el servicio de IA no está disponible en este momento',
  network: 'sin conexión con Anthropic',
  stale_chunk: 'la app se actualizó; recargá la página',
  truncated:
    'La respuesta del modelo quedó truncada (límite de tokens alcanzado).',
  refused: 'El modelo rechazó la solicitud.',
  bad_response: 'Respuesta inesperada del modelo (sin bloque de texto).',
}

// Failures every later request would repeat: a batch loop stops on these
// instead of firing one doomed request per remaining batch.
const FINAL: ReadonlySet<AiErrorKind> = new Set<AiErrorKind>([
  'auth',
  'billing',
  'stale_chunk',
])

/**
 * A Claude failure the app understands. Its message is Spanish, written for
 * the user. Not a `UserFacingError`: error reporting would drop every one,
 * and a `bad_response` is worth reporting (`isUnexpectedAiError`).
 */
export class AiError extends Error {
  /** Whether another request (a later batch) can still succeed. */
  readonly retryable: boolean
  /** The SDK error this explains, for the console. */
  readonly cause?: unknown

  constructor(
    readonly kind: AiErrorKind,
    message: string = MESSAGES[kind],
    cause?: unknown
  ) {
    super(message)
    this.name = 'AiError'
    this.retryable = !FINAL.has(kind)
    // ES2020 has no `cause` option on Error.
    if (cause !== undefined) this.cause = cause
  }
}
