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
})
