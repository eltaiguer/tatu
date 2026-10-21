import { describe, expect, it } from 'vitest'
import * as sdk from '@anthropic-ai/sdk'
import { AiError, type AiErrorKind } from './ai-error'
import {
  createClaudeClient,
  parseModelJson,
  type ClaudeRequest,
} from './claude-client'

// The SDK adapter is tested against the real SDK module with only its client
// class swapped, so the error classes are the ones a real call throws.
type Create = (body: Record<string, unknown>) => Promise<unknown>

function fakeSdk(create: Create) {
  const constructed: Array<Record<string, unknown>> = []
  const sent: Array<Record<string, unknown>> = []
  class FakeAnthropic {
    messages = {
      create: (body: Record<string, unknown>) => {
        sent.push(body)
        return create(body)
      },
    }
    constructor(options: Record<string, unknown>) {
      constructed.push(options)
    }
  }
  const load = async () =>
    ({ ...sdk, default: FakeAnthropic }) as unknown as typeof sdk
  return { load, constructed, sent }
}

const request: ClaudeRequest = {
  model: 'claude-haiku-5-5',
  system: 'SYSTEM',
  user: 'USER',
  maxTokens: 16000,
  effort: 'low',
}

function answer(content: unknown[], stop_reason = 'end_turn', extra = {}) {
  return async () => ({ content, stop_reason, ...extra })
}

function apiError(status: number, type: string, message: string) {
  return sdk.APIError.generate(
    status,
    { type: 'error', error: { type, message } },
    undefined,
    new Headers()
  )
}

async function failureOf(thrown: unknown): Promise<unknown> {
  const { load } = fakeSdk(async () => {
    throw thrown
  })
  return createClaudeClient('sk-test', load)
    .complete(request)
    .then(
      () => {
        throw new Error('expected a failure')
      },
      (error: unknown) => error
    )
}

async function kindOf(thrown: unknown): Promise<AiErrorKind | undefined> {
  const error = await failureOf(thrown)
  return error instanceof AiError ? error.kind : undefined
}

describe('createClaudeClient — the request', () => {
  it("sends the user's key from the browser, and the request as given", async () => {
    const { load, constructed, sent } = fakeSdk(
      answer([{ type: 'text', text: 'ok' }])
    )

    await createClaudeClient('sk-user', load).complete(request)

    expect(constructed).toEqual([
      { apiKey: 'sk-user', dangerouslyAllowBrowser: true },
    ])
    expect(sent).toEqual([
      {
        model: 'claude-haiku-5-5',
        max_tokens: 16000,
        output_config: { effort: 'low' },
        system: 'SYSTEM',
        messages: [{ role: 'user', content: 'USER' }],
      },
    ])
  })

  it('marks a cacheable system prompt as a cache breakpoint', async () => {
    const { load, sent } = fakeSdk(answer([{ type: 'text', text: 'ok' }]))

    await createClaudeClient('sk-test', load).complete({
      ...request,
      cacheSystem: true,
    })

    expect(sent[0].system).toEqual([
      {
        type: 'text',
        text: 'SYSTEM',
        cache_control: { type: 'ephemeral' },
      },
    ])
  })

  it('loads the SDK once per client', async () => {
    let loads = 0
    const { load } = fakeSdk(answer([{ type: 'text', text: 'ok' }]))
    const client = createClaudeClient('sk-test', () => {
      loads += 1
      return load()
    })

    await client.complete(request)
    await client.complete(request)

    expect(loads).toBe(1)
  })
})

describe('createClaudeClient — the response', () => {
  it('returns the first text block, skipping a thinking block', async () => {
    const { load } = fakeSdk(
      answer([
        { type: 'thinking', thinking: '' },
        { type: 'text', text: 'the answer' },
      ])
    )

    await expect(
      createClaudeClient('sk-test', load).complete(request)
    ).resolves.toBe('the answer')
  })

  it('names a refusal and its category', async () => {
    const { load } = fakeSdk(
      answer([], 'refusal', { stop_details: { category: 'general_harms' } })
    )

    const error = await createClaudeClient('sk-test', load)
      .complete(request)
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('refused')
    expect((error as AiError).message).toBe(
      'El modelo rechazó la solicitud (general_harms).'
    )
  })

  it('names a response cut off at max_tokens, even with text in it', async () => {
    const { load } = fakeSdk(
      answer([{ type: 'text', text: '[{"id":' }], 'max_tokens')
    )

    const error = await createClaudeClient('sk-test', load)
      .complete(request)
      .catch((e: unknown) => e)

    expect((error as AiError).kind).toBe('truncated')
    expect((error as AiError).message).toBe(
      'La respuesta del modelo quedó truncada (límite de tokens alcanzado).'
    )
  })

  it('says there was no text block when there is none', async () => {
    const { load } = fakeSdk(answer([{ type: 'tool_use', id: 'x' }]))

    const error = await createClaudeClient('sk-test', load)
      .complete(request)
      .catch((e: unknown) => e)

    expect((error as AiError).kind).toBe('bad_response')
    expect((error as AiError).message).toBe(
      'Respuesta inesperada del modelo (sin bloque de texto).'
    )
  })
})

describe('createClaudeClient — failures', () => {
  it('classifies API errors by their status and type', async () => {
    expect(await kindOf(apiError(401, 'authentication_error', 'bad'))).toBe(
      'auth'
    )
    expect(await kindOf(apiError(403, 'permission_error', 'no'))).toBe('auth')
    expect(await kindOf(apiError(429, 'rate_limit_error', 'slow'))).toBe(
      'rate_limit'
    )
    expect(await kindOf(apiError(529, 'overloaded_error', 'busy'))).toBe(
      'unavailable'
    )
    expect(await kindOf(apiError(500, 'api_error', 'oops'))).toBe('unavailable')
    expect(await kindOf(apiError(402, 'billing_error', 'pay'))).toBe('billing')
  })

  it('reads no credit from a 400 that says so', async () => {
    expect(
      await kindOf(
        apiError(
          400,
          'invalid_request_error',
          'Your credit balance is too low to access the Anthropic API.'
        )
      )
    ).toBe('billing')
  })

  it('does not read no credit from a 400 that merely mentions the words', async () => {
    const tooBig = apiError(
      400,
      'invalid_request_error',
      'prompt is too long: insufficient max_tokens for the requested credit'
    )

    expect(await failureOf(tooBig)).toBe(tooBig)
  })

  it('treats a lost, timed-out or aborted connection as the network', async () => {
    expect(await kindOf(new sdk.APIConnectionError({}))).toBe('network')
    expect(await kindOf(new sdk.APIConnectionTimeoutError())).toBe('network')
    expect(await kindOf(new sdk.APIUserAbortError())).toBe('network')
  })

  it('gives each kind the Spanish text the user acts on', async () => {
    const messageOf = async (thrown: unknown) =>
      ((await failureOf(thrown)) as AiError).message

    expect(await messageOf(apiError(401, 'authentication_error', 'x'))).toBe(
      'la clave API de Anthropic no es válida'
    )
    expect(await messageOf(apiError(429, 'rate_limit_error', 'x'))).toBe(
      'se alcanzó el límite de uso de la API'
    )
    expect(await messageOf(apiError(402, 'billing_error', 'x'))).toBe(
      'la cuenta de Anthropic no tiene saldo'
    )
    expect(await messageOf(apiError(529, 'overloaded_error', 'x'))).toBe(
      'el servicio de IA no está disponible en este momento'
    )
    expect(await messageOf(new sdk.APIConnectionError({}))).toBe(
      'sin conexión con Anthropic'
    )
  })

  it('keeps the SDK error as the cause', async () => {
    const thrown = apiError(429, 'rate_limit_error', 'slow')

    const error = (await failureOf(thrown)) as AiError

    expect(error.cause).toBe(thrown)
  })

  it('rethrows what it cannot explain as thrown, so it is reported as a bug', async () => {
    const badRequest = apiError(400, 'invalid_request_error', 'bad field')
    const notFound = apiError(404, 'not_found_error', 'model: claude-x')
    const bug = new TypeError('x is undefined')

    expect(await failureOf(badRequest)).toBe(badRequest)
    expect(await failureOf(notFound)).toBe(notFound)
    expect(await failureOf(bug)).toBe(bug)
  })

  it('asks for a reload when the on-demand SDK chunk is gone after a deploy', async () => {
    const client = createClaudeClient('sk-test', async () => {
      throw new TypeError(
        'Failed to fetch dynamically imported module: https://x/assets/sdk.js'
      )
    })

    const error = await client.complete(request).catch((e: unknown) => e)

    expect((error as AiError).kind).toBe('stale_chunk')
    expect((error as AiError).message).toBe(
      'la app se actualizó; recargá la página'
    )
  })

  it('does not load the SDK again after a failed load (one per batch would follow)', async () => {
    const failure = new Error('module evaluation failed')
    let attempts = 0
    const client = createClaudeClient('sk-test', () => {
      attempts += 1
      return Promise.reject(failure)
    })

    await expect(client.complete(request)).rejects.toBe(failure)
    await expect(client.complete(request)).rejects.toBe(failure)

    expect(attempts).toBe(1)
  })
})

describe('AiError', () => {
  it('has a generic message for a bad response, and one refusal text', () => {
    expect(new AiError('bad_response').message).toBe(
      'Respuesta inesperada del modelo.'
    )
    expect(new AiError('refused').message).toBe(
      'El modelo rechazó la solicitud.'
    )
    expect(AiError.refused('cyber').message).toBe(
      'El modelo rechazó la solicitud (cyber).'
    )
    expect(AiError.refused('cyber').kind).toBe('refused')
  })

  it('says which failures a later request cannot get past', () => {
    const retryable = (kind: AiErrorKind) => new AiError(kind).retryable

    expect(retryable('auth')).toBe(false)
    expect(retryable('billing')).toBe(false)
    expect(retryable('stale_chunk')).toBe(false)
    expect(retryable('rate_limit')).toBe(true)
    expect(retryable('unavailable')).toBe(true)
    expect(retryable('network')).toBe(true)
    expect(retryable('truncated')).toBe(true)
    expect(retryable('refused')).toBe(true)
    expect(retryable('bad_response')).toBe(true)
  })
})

describe('parseModelJson', () => {
  it('parses a bare JSON value', () => {
    expect(parseModelJson('[{"a":1}]', 'array')).toEqual([{ a: 1 }])
    expect(parseModelJson('{"a":1}', 'object')).toEqual({ a: 1 })
  })

  it('finds the JSON inside markdown fences or prose', () => {
    expect(parseModelJson('```json\n[1, 2]\n```', 'array')).toEqual([1, 2])
    expect(parseModelJson('Here:\n{"a":1}\nDone.', 'object')).toEqual({
      a: 1,
    })
  })

  it('says the response could not be parsed, as a bad response', () => {
    let error: unknown
    try {
      parseModelJson('not json', 'array')
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe('bad_response')
    expect((error as AiError).message).toMatch(
      /^No se pudo parsear la respuesta del modelo: /
    )
  })
})
