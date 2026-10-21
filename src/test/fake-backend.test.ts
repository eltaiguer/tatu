import { describe, expect, it } from 'vitest'
import { makeSession } from '../services/auth/in-memory-auth'
import { createFakeBackend } from './fake-backend'

describe('fake backend', () => {
  it('hands App a new view per call onto the repository a test seeded', () => {
    const backend = createFakeBackend()
    const seeded = backend.seed({ preferences: null })

    const forApp = backend.createRepository(makeSession('user-1'))

    expect(forApp).not.toBe(seeded)
    expect(backend.repo()).toBe(seeded)
    expect(Object.getPrototypeOf(forApp)).toBe(seeded)
  })

  it('refuses to seed a user whose repository is already in use, instead of silently replacing it', () => {
    const backend = createFakeBackend()
    backend.createRepository(makeSession('user-1'))

    expect(() => backend.seed({ transactions: [] })).toThrow(/already in use/)
  })

  it('seeds a user several times before anyone uses it', () => {
    const backend = createFakeBackend()
    backend.seed({ preferences: null })
    const repo = backend.seed({ transactions: [] })

    expect(backend.repo()).toBe(repo)
  })
})
