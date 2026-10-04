import { describe, expect, it } from 'vitest'
import type { ErrorEvent } from '@sentry/react'
import { NeedsConfirmationError, UserFacingError } from '../../utils/user-error'
import {
  redactMessage,
  scrubBreadcrumb,
  scrubEvent,
  stripUrl,
} from './error-reporting'

function errorEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...overrides }
}

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
