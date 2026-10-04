import { afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { installConsoleGuard } from './console-guard'

// findBy* / waitFor give up after `asyncUtilTimeout`, which is separate from
// Vitest's testTimeout (20s, #78) and defaults to 1s. Under full-suite CPU
// load an App-level view can take longer than that to render after
// hydration, so the App suites failed with "Unable to find ..." (#191). A
// broken wait still fails well inside testTimeout. Don't add retries instead.
// In App-level tests, also poll with cheap queries (ByLabelText, ByText):
// waitFor reruns its query on every DOM mutation, and a ByRole query over the
// whole App takes ~1s under load, starving the very render it waits for. Use
// a synchronous getByRole after the wait to keep the accessibility check.
configure({ asyncUtilTimeout: 5_000 })

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// A passing run prints nothing: any console.error / console.warn during a test
// fails that test (React act() and prop warnings, Radix a11y warnings, stray
// logs). When a test exercises code that is *expected* to log, spy on the
// console in that test and assert the call, which also keeps it quiet:
//
//   const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
//   ...
//   expect(errorSpy).toHaveBeenCalledWith('import failed:', expect.any(Error))
//
// The spy only lasts for that test; the guard is reinstalled after each one.
const consoleGuard = installConsoleGuard()
afterEach(() => {
  const unexpected = consoleGuard.takeUnexpected()
  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected console output during this test (spy on console and ` +
        `assert it if it is expected):\n\n${unexpected.join('\n\n')}`
    )
  }
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverMock
}

if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 800,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  })
}

// Mock matchMedia for theme detection
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  })
}

// jsdom doesn't implement scrolling; views reset scroll on navigation.
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
}
