/**
 * The one place Tatu talks to Claude. Every call runs in the browser with
 * the user's own key (BYO, `dangerouslyAllowBrowser`) and the SDK is loaded
 * on demand, so it stays out of the startup bundle (#62).
 *
 * `complete` sends one system + user message and returns the answer's text.
 * Every failure it understands comes out as an `AiError` with a kind (see
 * ai-error.ts); anything else is rethrown untouched, so a code bug keeps its
 * type and stack and is reported. Callers depend on `ClaudeClient`, not the
 * SDK: tests hand them a fake (`src/test/fake-claude-client.ts`).
 */
import { errorMessage } from '../monitoring/error-reporting'
import { AiError, browserFailureAsAiError } from './ai-error'

export type SdkModule = typeof import('@anthropic-ai/sdk')

export interface ClaudeRequest {
  /** A model ID from `models.ts`, never a literal. */
  model: string
  system: string
  /**
   * Marks the system prompt as a cache breakpoint. Worth it only for a
   * prompt sent identically several times (the categorization batches).
   */
  cacheSystem?: boolean
  user: string
  /** Covers the model's thinking as well as its answer on the 5.5 models. */
  maxTokens: number
  effort: 'low' | 'medium' | 'high'
}

export interface ClaudeClient {
  /** The text of Claude's answer; throws an `AiError` when it has none. */
  complete(request: ClaudeRequest): Promise<string>
}

const loadAnthropicSdk = () => import('@anthropic-ai/sdk')

export function createClaudeClient(
  apiKey: string,
  loadSdk: () => Promise<SdkModule> = loadAnthropicSdk
): ClaudeClient {
  let loaded: Promise<SdkModule> | null = null

  // Loaded once per client. A failed load stays failed for this client (one
  // run): every batch would otherwise load it again, and fail again. The
  // next run builds a new client and tries afresh.
  async function sdk(): Promise<SdkModule> {
    loaded ??= loadSdk().catch((error: unknown) => {
      throw browserFailureAsAiError(error) ?? error
    })
    return loaded
  }

  let anthropic: InstanceType<SdkModule['default']> | null = null

  return {
    async complete(request) {
      const module = await sdk()
      anthropic ??= new module.default({
        apiKey,
        dangerouslyAllowBrowser: true,
      })
      const client = anthropic
      let response: ClaudeResponse
      try {
        response = (await client.messages.create({
          model: request.model,
          max_tokens: request.maxTokens,
          output_config: { effort: request.effort },
          system: request.cacheSystem
            ? [
                {
                  type: 'text',
                  text: request.system,
                  cache_control: { type: 'ephemeral' },
                },
              ]
            : request.system,
          messages: [{ role: 'user', content: request.user }],
        })) as ClaudeResponse
      } catch (error) {
        throw classify(error, module) ?? error
      }
      return answerText(response)
    },
  }
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>
  stop_reason?: string | null
  stop_details?: { category?: string | null } | null
}

/**
 * The SDK error as an `AiError`, or null when it is not one the user can act
 * on (a 400 for a malformed request, a 404 for an unknown model: our bug).
 * By class and `status`/`type`; the message only tells Anthropic's own
 * "credit balance is too low" and "prompt is too long" 400s from other
 * invalid requests.
 */
function classify(error: unknown, sdk: SdkModule): AiError | null {
  // Before APIError: these are APIErrors without a status.
  if (
    error instanceof sdk.APIConnectionError ||
    error instanceof sdk.APIUserAbortError
  ) {
    return new AiError('network', undefined, error)
  }
  if (!(error instanceof sdk.APIError)) return null
  const { status, type } = error
  if (
    type === 'billing_error' ||
    (status === 400 && /credit balance is too low/i.test(error.message))
  ) {
    return new AiError('billing', undefined, error)
  }
  if (
    status === 401 ||
    status === 403 ||
    type === 'authentication_error' ||
    type === 'permission_error'
  ) {
    return new AiError('auth', undefined, error)
  }
  if (
    status === 413 ||
    (type as string | null) === 'request_too_large' ||
    (status === 400 && /prompt is too long/i.test(error.message))
  ) {
    return new AiError('too_large', undefined, error)
  }
  if (status === 429 || type === 'rate_limit_error') {
    return new AiError('rate_limit', undefined, error)
  }
  if (
    (status !== undefined && status >= 500) ||
    type === 'overloaded_error' ||
    type === 'api_error' ||
    type === 'timeout_error'
  ) {
    return new AiError('unavailable', undefined, error)
  }
  return null
}

/**
 * The first *text* block: the 5.5 models think by default, so the first
 * block can be a `thinking` one. A refusal (HTTP 200, no text) and a turn
 * cut off at `max_tokens` get their own kind, since "no text block" would
 * point at the wrong cause, and a truncated text is invalid JSON anyway.
 */
function answerText(response: ClaudeResponse): string {
  if (response.stop_reason === 'refusal') {
    throw AiError.refused(response.stop_details?.category)
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiError('truncated')
  }
  const block = response.content.find((b) => b.type === 'text')
  if (!block || typeof block.text !== 'string') {
    throw new AiError(
      'bad_response',
      'respuesta inesperada del modelo (sin bloque de texto)'
    )
  }
  return block.text
}

/**
 * The JSON array or object in a model's answer. Claude sometimes wraps it in
 * markdown fences or a sentence despite being told not to, so the outermost
 * brackets are taken when the text does not start with one.
 */
export function parseModelJson(
  text: string,
  shape: 'array' | 'object'
): unknown {
  const raw = text.trim()
  const [open, outermost] =
    shape === 'array' ? ['[', /\[[\s\S]*\]/] : ['{', /\{[\s\S]*\}/]
  const json = raw.startsWith(open) ? raw : (raw.match(outermost)?.[0] ?? raw)
  try {
    return JSON.parse(json) as unknown
  } catch (e) {
    throw new AiError(
      'bad_response',
      `no se pudo parsear la respuesta del modelo: ${errorMessage(e)}`
    )
  }
}
