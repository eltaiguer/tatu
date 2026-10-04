import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react'
import type { ErrorEvent } from '@sentry/react'
import { UserFacingError } from '../../utils/user-error'
import {
  captureError,
  sentryOptions,
  setErrorReportingUser,
} from './error-reporting'

// Runs the real SDK with the app's options and a fake transport, so the test
// sees exactly what would be sent to Sentry.
function initWithFakeTransport(): ErrorEvent[] {
  const sent: ErrorEvent[] = []
  Sentry.init({
    ...sentryOptions('https://public@o0.ingest.sentry.io/1'),
    transport: () => ({
      send: async (envelope) => {
        for (const [header, payload] of envelope[1]) {
          if (header.type === 'event') sent.push(payload as ErrorEvent)
        }
        return {}
      },
      flush: async () => true,
    }),
  })
  return sent
}

afterEach(async () => {
  await Sentry.close()
  window.history.replaceState(null, '', '/')
})

describe('error reporting through the Sentry SDK', () => {
  it('sends unexpected errors without tokens, filters or values', async () => {
    const sent = initWithFakeTransport()
    window.history.pushState(null, '', '/transacciones?q=farmacia')
    window.history.replaceState(
      null,
      '',
      '/transacciones?q=farmacia#access_token=secret'
    )
    setErrorReportingUser('user-123')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    console.error('import failed:', 'FARMACIA 1.234,56')
    expect(errorSpy).toHaveBeenCalled()

    captureError(new Error('Fila 3: Importe ilegible: "1.234,56"'), 'import')
    await Sentry.flush()

    expect(sent).toHaveLength(1)
    const [event] = sent
    expect(event.exception?.values?.[0].value).toBe(
      'Fila 3: Importe ilegible: "[redacted]"'
    )
    expect(event.tags).toMatchObject({ area: 'import' })
    expect(event.user).toEqual({ id: 'user-123' })
    expect(event.request?.url).toBe('http://localhost:3000/transacciones')
    expect(event.breadcrumbs).toContainEqual(
      expect.objectContaining({
        category: 'navigation',
        data: expect.objectContaining({ to: '/transacciones' }),
      })
    )
    expect(JSON.stringify(event)).not.toMatch(/secret|farmacia|1\.234/i)
  })

  it('wraps Supabase error objects so their details are not sent', async () => {
    const sent = initWithFakeTransport()

    captureError({
      message: 'duplicate key value violates unique constraint',
      details: 'Key (id)=(tx-1) already exists. FARMACIA PIGALLE',
    })
    await Sentry.flush()

    expect(sent[0].exception?.values?.[0].value).toBe(
      'duplicate key value violates unique constraint'
    )
    expect(JSON.stringify(sent[0])).not.toMatch(/FARMACIA/)
  })

  it('does not send errors the app already explains to the user', async () => {
    const sent = initWithFakeTransport()

    captureError(new UserFacingError('Ese nombre ya existe'))
    await Sentry.flush()

    expect(sent).toHaveLength(0)
  })
})
