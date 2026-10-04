import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError, aiErrorMessage, userErrorMessage } from './user-error'

describe('userErrorMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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
  it('turns SDK errors into Spanish the user can act on', () => {
    expect(aiErrorMessage('401 invalid x-api-key')).toBe(
      'la clave API de Anthropic no es válida'
    )
    expect(aiErrorMessage('429 rate_limit_error')).toMatch(/límite/)
    expect(aiErrorMessage('529 Overloaded')).toMatch(/no está disponible/)
    expect(aiErrorMessage('something odd')).toBe(
      'error inesperado del servicio de IA'
    )
  })

  it('asks for a reload when the on-demand SDK chunk is gone after a deploy', () => {
    // Chrome / Firefox and Safari wordings
    expect(
      aiErrorMessage(
        'Failed to fetch dynamically imported module: https://x/assets/index-abc.js'
      )
    ).toBe('la app se actualizó; recargá la página')
    expect(aiErrorMessage('Importing a module script failed.')).toBe(
      'la app se actualizó; recargá la página'
    )
    expect(aiErrorMessage('TypeError: Failed to fetch')).toBe(
      'sin conexión con Anthropic'
    )
  })

  it('keeps how many batches failed, so partial never reads as total', () => {
    expect(aiErrorMessage('1 de 12 lotes fallaron: 529 Overloaded')).toBe(
      '1 de 12 lotes fallaron (el servicio de IA no está disponible en este momento)'
    )
  })

  it("passes the app's own Spanish messages through", () => {
    const msg =
      'La respuesta del modelo quedó truncada (límite de tokens alcanzado).'
    expect(aiErrorMessage(msg)).toBe(msg)
  })
})
