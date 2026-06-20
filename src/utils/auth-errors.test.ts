import { describe, it, expect } from 'vitest'
import { mapAuthError } from './auth-errors'

describe('mapAuthError', () => {
  it('maps invalid login credentials', () => {
    expect(mapAuthError(new Error('Invalid login credentials'))).toBe(
      'Email o contraseña incorrectos.'
    )
  })

  it('maps user already registered', () => {
    expect(mapAuthError(new Error('User already registered'))).toBe(
      'Ya existe una cuenta con ese email.'
    )
  })

  it('maps already exists variant', () => {
    expect(mapAuthError(new Error('Email already exists in the system'))).toBe(
      'Ya existe una cuenta con ese email.'
    )
  })

  it('maps anonymous sign-ins disabled', () => {
    expect(mapAuthError(new Error('Anonymous sign-ins are disabled'))).toBe(
      'El registro no está disponible por el momento.'
    )
  })

  it('maps email not confirmed', () => {
    expect(mapAuthError(new Error('Email not confirmed'))).toBe(
      'Revisá tu casilla y confirmá tu email.'
    )
  })

  it('maps password too short', () => {
    expect(mapAuthError(new Error('Password should be at least 6 characters'))).toBe(
      'La contraseña debe tener al menos 6 caracteres.'
    )
  })

  it('maps too many requests', () => {
    expect(mapAuthError(new Error('Too many requests'))).toBe(
      'Demasiados intentos. Esperá unos minutos.'
    )
  })

  it('maps rate limit variant', () => {
    expect(mapAuthError(new Error('rate limit exceeded'))).toBe(
      'Demasiados intentos. Esperá unos minutos.'
    )
  })

  it('matches case-insensitively', () => {
    expect(mapAuthError(new Error('INVALID LOGIN CREDENTIALS'))).toBe(
      'Email o contraseña incorrectos.'
    )
  })

  it('returns fallback for unknown error', () => {
    expect(mapAuthError(new Error('Some unknown supabase error'))).toBe(
      'No pudimos completar la acción. Intentá de nuevo.'
    )
  })

  it('returns fallback for non-Error unknown value', () => {
    expect(mapAuthError({ code: 500 })).toBe(
      'No pudimos completar la acción. Intentá de nuevo.'
    )
  })

  it('handles string errors', () => {
    expect(mapAuthError('invalid login credentials')).toBe(
      'Email o contraseña incorrectos.'
    )
  })
})
