import { describe, expect, it, vi } from 'vitest'
import { installConsoleGuard } from './console-guard'

function fakeConsole() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  } as unknown as Console
}

describe('installConsoleGuard', () => {
  it('reports console.error and console.warn output, still printing it', () => {
    const target = fakeConsole()
    const printError = target.error
    const guard = installConsoleGuard(target)

    target.error('boom', 42)
    target.warn('careful')

    expect(printError).toHaveBeenCalledWith('boom', 42)
    expect(guard.takeUnexpected()).toEqual([
      'console.error: boom 42',
      'console.warn: careful',
    ])
    expect(guard.takeUnexpected()).toEqual([])
  })

  it('ignores output a test silenced with its own spy', () => {
    const target = fakeConsole()
    const guard = installConsoleGuard(target)

    const spy = vi.spyOn(target, 'error').mockImplementation(() => {})
    target.error('expected failure')

    expect(spy).toHaveBeenCalledWith('expected failure')
    expect(guard.takeUnexpected()).toEqual([])
  })

  it('reinstalls itself so a spy does not hide output in the next test', () => {
    const target = fakeConsole()
    const guard = installConsoleGuard(target)
    vi.spyOn(target, 'error').mockImplementation(() => {})

    guard.takeUnexpected()
    target.error('next test')

    expect(guard.takeUnexpected()).toEqual(['console.error: next test'])
  })

  it('survives vi.restoreAllMocks()', () => {
    const target = fakeConsole()
    const guard = installConsoleGuard(target)

    vi.restoreAllMocks()
    target.warn('still caught')

    expect(guard.takeUnexpected()).toEqual(['console.warn: still caught'])
  })

  it('does not guard console.log', () => {
    const target = fakeConsole()
    const guard = installConsoleGuard(target)

    target.log('fine')

    expect(guard.takeUnexpected()).toEqual([])
  })
})
