import { describe, expect, it } from 'vitest'
import type { ErrorEvent } from '@sentry/react'
import {
  NeedsConfirmationError,
  PartialWriteError,
  UserFacingError,
  WorkspaceChangedError,
} from '../../utils/user-error'
import {
  isNetworkError,
  redactMessage,
  scrubBreadcrumb,
  scrubEvent,
  stripUrl,
} from './error-reporting'

function errorEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...overrides }
}

describe('isNetworkError', () => {
  it('reads the message of a Supabase error object too', () => {
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true)
    expect(isNetworkError({ message: 'duplicate key' })).toBe(false)
  })
})

describe('stripUrl', () => {
  it('drops the password-recovery hash with its access token', () => {
    expect(
      stripUrl(
        'https://tatu.web.app/#access_token=secret&type=recovery&refresh_token=x'
      )
    ).toBe('https://tatu.web.app/')
  })

  it('drops Transacciones filters from the query string', () => {
    expect(
      stripUrl('https://tatu.web.app/transacciones?q=farmacia&categoria=health')
    ).toBe('https://tatu.web.app/transacciones')
  })

  it('handles relative paths', () => {
    expect(stripUrl('/transacciones?q=farmacia#x')).toBe('/transacciones')
  })
})

describe('redactMessage', () => {
  it('hides the quoted value of a parse error', () => {
    expect(redactMessage('Fila 12: Importe ilegible: "1.234,56"')).toBe(
      'Fila 12: Importe ilegible: "[redacted]"'
    )
  })

  it('hides the key values of a Postgres constraint error', () => {
    expect(
      redactMessage('Key (id)=(abc-123) already exists in "transactions"')
    ).toBe('Key (id)=([redacted]) already exists in "[redacted]"')
  })

  it('hides a quoted snippet that contains quotes itself', () => {
    const message = redactMessage(
      `No se pudo parsear la respuesta del modelo: Unexpected token 'x', "[{"id":"tx-1","displayDescription":"FARMACIA PIGALLE"}]" is not valid JSON`
    )
    expect(message).not.toContain('FARMACIA')
    expect(message).not.toContain('tx-1')
    expect(message).toContain('is not valid JSON')
  })

  it('hides everything after an unclosed quote', () => {
    expect(redactMessage('Importe ilegible: "1.234,56 USD')).not.toContain(
      '1.234'
    )
  })

  it('hides a Postgres key value that contains parentheses', () => {
    const message = redactMessage(
      'Key (merchant_normalized, user_id)=((UY) DISCO POCITOS, 3f2a) already exists'
    )
    expect(message).not.toMatch(/DISCO|3f2a/)
    expect(message).toContain('already exists')
  })

  it('hides single-quoted values too', () => {
    expect(
      redactMessage('Unexpected token \'D\', "DISCO" is not valid JSON')
    ).not.toMatch(/'D'/)
  })

  it('leaves messages without values alone', () => {
    expect(redactMessage('No se pudo iniciar la importación')).toBe(
      'No se pudo iniciar la importación'
    )
  })
})

describe('scrubEvent', () => {
  it('drops errors the app already explains to the user', () => {
    expect(
      scrubEvent(errorEvent(), {
        originalException: new UserFacingError('Ya existe'),
      })
    ).toBeNull()
    expect(
      scrubEvent(errorEvent(), {
        originalException: new NeedsConfirmationError(),
      })
    ).toBeNull()
  })

  it('drops the subclasses of the errors written for the user', () => {
    expect(
      scrubEvent(errorEvent(), {
        originalException: new WorkspaceChangedError(),
      })
    ).toBeNull()
    expect(
      scrubEvent(errorEvent(), {
        originalException: new PartialWriteError(
          'Se actualizaron 1 de 2',
          1,
          2
        ),
      })
    ).toBeNull()
  })

  it('removes tokens, filters and values before sending', () => {
    const event = scrubEvent(
      errorEvent({
        request: {
          url: 'https://tatu.web.app/#access_token=secret',
          query_string: 'q=farmacia',
        },
        exception: {
          values: [{ type: 'Error', value: 'Moneda no reconocida: "EUR"' }],
        },
        extra: { details: 'description=eq.FARMACIA PIGALLE' },
        breadcrumbs: [
          { category: 'console', message: 'import failed: 1.234,56' },
          { category: 'fetch', data: { url: '/rest/v1/tx?description=eq.X' } },
          {
            category: 'navigation',
            data: { from: '/', to: '/transacciones?q=farmacia' },
          },
          {
            category: 'ui.click',
            message: 'button[aria-label="Editar FARMACIA PIGALLE"]',
          },
        ],
      })
    )

    expect(event?.request).toEqual({ url: 'https://tatu.web.app/' })
    expect(event?.exception?.values?.[0].value).toBe(
      'Moneda no reconocida: "[redacted]"'
    )
    expect(event?.extra).toBeUndefined()
    expect(event?.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: '/', to: '/transacciones' } },
    ])
  })

  it('drops request headers (the referrer carries a full URL)', () => {
    const event = scrubEvent(
      errorEvent({
        request: {
          url: 'https://tatu.app/',
          headers: { Referer: 'https://mail.example/?q=tatu' },
        },
      })
    )
    expect(event?.request?.headers).toBeUndefined()
  })

  it('keeps unexpected errors', () => {
    const event = scrubEvent(
      errorEvent({ exception: { values: [{ value: 'boom' }] } }),
      { originalException: new Error('boom') }
    )
    expect(event?.exception?.values?.[0].value).toBe('boom')
  })
})

describe('scrubBreadcrumb', () => {
  it('drops console, HTTP and click breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'x' })).toBeNull()
    expect(scrubBreadcrumb({ category: 'xhr' })).toBeNull()
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'x' })).toBeNull()
  })
})
