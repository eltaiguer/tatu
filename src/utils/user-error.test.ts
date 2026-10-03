import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError, userErrorMessage } from './user-error'

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
