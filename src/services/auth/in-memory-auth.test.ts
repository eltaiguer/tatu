import { describe, expect, it, vi } from 'vitest'
import { createInMemoryAuth, makeSession } from './in-memory-auth'

// The in-memory adapter stands in for Supabase Auth in the App suites, so it
// must behave the way the app relies on Supabase behaving.
describe('in-memory auth', () => {
  it('starts with the stored session it was given', () => {
    const session = makeSession('user-1')

    expect(createInMemoryAuth({ session }).getSession()).toBe(session)
    expect(createInMemoryAuth().getSession()).toBeNull()
  })

  it('signs in a known account, reporting the change before resolving', async () => {
    const auth = createInMemoryAuth()
    const session = auth.addAccount('ana@example.uy', 'secret123')
    const onSession = vi.fn()
    auth.onAuthChange(onSession)

    await expect(auth.signIn('ana@example.uy', 'secret123')).resolves.toBe(
      session
    )

    expect(onSession).toHaveBeenCalledWith(session)
    expect(auth.getSession()).toBe(session)
  })

  it("rejects wrong credentials with Supabase's message", async () => {
    const auth = createInMemoryAuth()
    auth.addAccount('ana@example.uy', 'secret123')

    await expect(auth.signIn('ana@example.uy', 'nope')).rejects.toThrow(
      'Invalid login credentials'
    )
    expect(auth.getSession()).toBeNull()
  })

  it('signs up a new account and signs it in', async () => {
    const auth = createInMemoryAuth()

    const session = await auth.signUp('new@example.uy', 'secret123')

    expect(session.user.email).toBe('new@example.uy')
    expect(auth.getSession()).toBe(session)
    await expect(auth.signUp('new@example.uy', 'x')).rejects.toThrow(
      'User already registered'
    )
  })

  it('signs out, reporting a null session to every listener', async () => {
    const auth = createInMemoryAuth({ session: makeSession('user-1') })
    const onSession = vi.fn()
    const unsubscribe = auth.onAuthChange(onSession)

    await auth.signOut()

    expect(onSession).toHaveBeenCalledWith(null)
    expect(auth.getSession()).toBeNull()
    expect(auth.signOuts).toBe(1)

    unsubscribe()
    auth.emit(makeSession('user-2'))
    expect(onSession).toHaveBeenCalledTimes(1)
  })

  it('reports a recovery link as its session, then as recovery', () => {
    const auth = createInMemoryAuth()
    const calls: string[] = []
    auth.onAuthChange(
      (session) => calls.push(`session:${session?.user.id}`),
      () => calls.push('recovery')
    )

    auth.recover(makeSession('user-1'))

    expect(calls).toEqual(['session:user-1', 'recovery'])
  })

  it('records reset requests and password updates', async () => {
    const auth = createInMemoryAuth()

    await auth.requestPasswordReset('ana@example.uy')
    await auth.updatePassword('new-secret')

    expect(auth.resetRequests).toEqual(['ana@example.uy'])
    expect(auth.passwordUpdates).toEqual(['new-secret'])
  })

  it('when the global sign-out fails, still removes the session here (local scope), reports it, and rejects', async () => {
    const auth = createInMemoryAuth({ session: makeSession('user-1') })
    const onSession = vi.fn()
    auth.onAuthChange(onSession)
    auth.failOn('signOut', new Error('Internal Server Error'))

    await expect(auth.signOut()).rejects.toThrow('Internal Server Error')

    expect(auth.getSession()).toBeNull()
    expect(onSession).toHaveBeenCalledWith(null)
  })

  it('when even the local sign-out fails, keeps the session and reports no change', async () => {
    const session = makeSession('user-1')
    const auth = createInMemoryAuth({ session })
    const onSession = vi.fn()
    auth.onAuthChange(onSession)
    auth.failOn('signOut', new Error('Failed to fetch'))
    auth.failOn('signOutLocal', new Error('Failed to fetch'))

    await expect(auth.signOut()).rejects.toThrow('Failed to fetch')

    expect(auth.getSession()).toBe(session)
    expect(onSession).not.toHaveBeenCalled()
  })

  it('lets a failure be healed, so a retry can succeed', async () => {
    const auth = createInMemoryAuth({ session: makeSession('user-1') })
    auth.failOn('signOut')
    auth.failOn('signOutLocal')
    await expect(auth.signOut()).rejects.toThrow()

    auth.heal()
    await auth.signOut()

    expect(auth.getSession()).toBeNull()
  })
})
