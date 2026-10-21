import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureError } from '../services/monitoring/error-reporting'
import { AiError } from '../services/ai/ai-error'
import {
  UserFacingError,
  aiDiagnosticMessage,
  aiErrorMessage,
  aiPartialFailureMessage,
  isUnexpectedAiError,
  userErrorMessage,
} from './user-error'

vi.mock('../services/monitoring/error-reporting', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../services/monitoring/error-reporting')
  >()),
  captureError: vi.fn(),
}))

describe('userErrorMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports unexpected errors and hands explained ones over (dropped there)', () => {
    vi.mocked(captureError).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const unexpected = new Error('relation "x" does not exist')

    userErrorMessage(unexpected, 'x')
    const explained = new UserFacingError('Ya existe')
    userErrorMessage(explained, 'x')

    // captureError drops an explained error with no cause (sentry test).
    expect(vi.mocked(captureError).mock.calls).toEqual([
      [unexpected, undefined],
      [explained, undefined],
    ])
  })

  it('tells an offline user about the connection, whatever the error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(userErrorMessage(new Error('boom'), 'x')).toMatch(/Sin conexión/)
  })

  it('does not report a network failure it tells the user about', () => {
    vi.mocked(captureError).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    userErrorMessage(new Error('network request failed'), 'x')

    expect(captureError).not.toHaveBeenCalled()
  })

  it('hands an explained error to reporting, which sends its cause', () => {
    vi.mocked(captureError).mockClear()
    const shown = new UserFacingError(
      'No se pudieron borrar todos los datos.',
      {
        cause: new Error('timeout'),
      }
    )

    expect(userErrorMessage(shown, 'x', 'reset')).toBe(shown.message)
    expect(captureError).toHaveBeenCalledWith(shown, 'reset')
  })

  it('tags the report with the area the caller names', () => {
    vi.mocked(captureError).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const unexpected = new TypeError('x is undefined')

    userErrorMessage(unexpected, 'x', 'import-parse')

    expect(captureError).toHaveBeenCalledTimes(1)
    expect(captureError).toHaveBeenCalledWith(unexpected, 'import-parse')
  })

  it('passes user-facing messages through', () => {
    expect(
      userErrorMessage(new UserFacingError('La transacción ya no existe'), 'x')
    ).toBe('La transacción ya no existe')
  })

  it('never shows raw backend text', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      userErrorMessage(
        new Error('duplicate key value violates unique constraint'),
        'No se pudieron guardar los cambios'
      )
    ).toBe('No se pudieron guardar los cambios')
  })

  it('explains network failures in Spanish', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(userErrorMessage(new TypeError('Failed to fetch'), 'x')).toMatch(
      /Sin conexión/
    )
  })
})

describe('aiErrorMessage', () => {
  it('shows what the Claude client says about a failure it understands', () => {
    expect(aiErrorMessage(new AiError('auth'))).toBe(
      'la clave API de Anthropic no es válida'
    )
    expect(aiErrorMessage(new AiError('rate_limit'))).toBe(
      'se alcanzó el límite de uso de la API'
    )
    expect(aiErrorMessage(new AiError('billing'))).toBe(
      'la cuenta de Anthropic no tiene saldo'
    )
    expect(aiErrorMessage(new AiError('unavailable'))).toBe(
      'el servicio de IA no está disponible en este momento'
    )
    expect(aiErrorMessage(new AiError('network'))).toBe(
      'sin conexión con Anthropic'
    )
    expect(aiErrorMessage(new AiError('stale_chunk'))).toBe(
      'la app se actualizó; recargá la página'
    )
    expect(aiErrorMessage(new AiError('truncated'))).toBe(
      'la respuesta del modelo quedó truncada (límite de tokens alcanzado)'
    )
    const refusal = 'el modelo rechazó la solicitud (cyber)'
    expect(aiErrorMessage(new AiError('refused', refusal))).toBe(refusal)
  })

  it('never shows the text of a failure it does not understand', () => {
    // A code bug, or an SDK error the client could not classify.
    expect(aiErrorMessage(new TypeError('x is undefined'))).toBe(
      'error inesperado del servicio de IA'
    )
    expect(aiErrorMessage(new Error('404 {"type":"not_found_error"}'))).toBe(
      'error inesperado del servicio de IA'
    )
    expect(aiErrorMessage('something odd')).toBe(
      'error inesperado del servicio de IA'
    )
  })
})

describe('AI messages compose into a sentence', () => {
  const kinds = [
    'auth',
    'rate_limit',
    'billing',
    'unavailable',
    'network',
    'truncated',
    'stale_chunk',
    'refused',
    'bad_response',
  ] as const

  it('is a fragment for every kind: no leading capital, no closing period', () => {
    for (const kind of kinds) {
      const message = aiErrorMessage(new AiError(kind))
      expect(message, kind).toMatch(/^[a-záéíóúñ]/)
      expect(message, kind).not.toMatch(/\.$/)
      expect(
        `Categorización con IA no disponible: ${message}. Se usaron las reglas.`,
        kind
      ).not.toContain('..')
    }
  })
})

describe('aiErrorMessage — failures that reached it without the client', () => {
  it('says what a lost connection or a stale chunk is, as reporting does', () => {
    const offline = new TypeError('Failed to fetch')
    const stale = new TypeError(
      'Failed to fetch dynamically imported module: https://tatu.app/assets/sdk.js'
    )

    expect(aiErrorMessage(offline)).toBe('sin conexión con Anthropic')
    expect(isUnexpectedAiError(offline)).toBe(false)
    expect(aiErrorMessage(stale)).toBe('la app se actualizó; recargá la página')
    expect(isUnexpectedAiError(stale)).toBe(false)
  })
})

describe('aiDiagnosticMessage', () => {
  it('shows an AI error as the user would see it, and anything else as it is', () => {
    expect(aiDiagnosticMessage(new AiError('auth'))).toBe(
      'la clave API de Anthropic no es válida'
    )
    expect(aiDiagnosticMessage(new TypeError('x is undefined'))).toBe(
      'x is undefined'
    )
  })
})

describe('aiPartialFailureMessage', () => {
  it('keeps how many batches failed, so partial never reads as total', () => {
    expect(aiPartialFailureMessage(1, 12, new AiError('unavailable'))).toBe(
      '1 de 12 lotes fallaron (el servicio de IA no está disponible en este momento)'
    )
  })

  it('does not show the text of a bug behind a partial failure', () => {
    expect(aiPartialFailureMessage(2, 3, new TypeError('x is undefined'))).toBe(
      '2 de 3 lotes fallaron (error inesperado del servicio de IA)'
    )
  })
})

describe('isUnexpectedAiError', () => {
  it('is false for the key, quota, credit, service, connection or a deploy', () => {
    for (const kind of [
      'auth',
      'rate_limit',
      'billing',
      'unavailable',
      'network',
      'stale_chunk',
    ] as const) {
      expect(isUnexpectedAiError(new AiError(kind))).toBe(false)
    }
  })

  it('is false for a truncated or refused answer, which depends on the data', () => {
    expect(isUnexpectedAiError(new AiError('truncated'))).toBe(false)
    expect(isUnexpectedAiError(new AiError('refused'))).toBe(false)
  })

  it('is true for an answer that is not in the shape asked for', () => {
    expect(isUnexpectedAiError(new AiError('bad_response'))).toBe(true)
  })

  it('is true for anything the Claude client did not explain', () => {
    expect(isUnexpectedAiError(new Error('boom'))).toBe(true)
    expect(
      isUnexpectedAiError(
        new Error('400 invalid_request_error {"request_id":"req_011C501abc"}')
      )
    ).toBe(true)
  })

  it('is true for a code bug even when its message looks like an outage', () => {
    expect(
      isUnexpectedAiError(
        new TypeError(
          "Cannot read properties of undefined (reading 'connection')"
        )
      )
    ).toBe(true)
    expect(
      isUnexpectedAiError(new SyntaxError('Unexpected token at position 503'))
    ).toBe(true)
  })

  it('does not report a lost connection or a chunk gone after a deploy', () => {
    expect(isUnexpectedAiError(new TypeError('Failed to fetch'))).toBe(false)
    expect(
      isUnexpectedAiError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://tatu.app/assets/sdk.js'
        )
      )
    ).toBe(false)
  })
})
