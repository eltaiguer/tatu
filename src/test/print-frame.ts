import { vi } from 'vitest'

// Captures what a test prints. The PDF export prints from a hidden iframe it
// creates itself; jsdom implements none of window.print/focus/open (each logs
// "not implemented"), so this replaces print + focus on every frame window and
// records the frame's body at the moment it was printed. window.open is
// stubbed to return null, as a real browser does for `noopener` (#179).
// `failing: true` makes frames have no window, i.e. the report can't open.
// Call restore() when done.
export function capturePrintFrame({ failing = false } = {}) {
  const printed: string[] = []
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    'contentWindow'
  )
  const originalGet = descriptor?.get
  if (!originalGet) throw new Error('jsdom has no iframe contentWindow getter')

  const getSpy = vi
    .spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get')
    .mockImplementation(function (this: HTMLIFrameElement) {
      if (failing) return null
      const win = originalGet.call(this) as Window | null
      if (win && !vi.isMockFunction(win.print)) {
        win.focus = vi.fn()
        win.print = vi.fn(() => {
          printed.push(win.document.body.innerHTML)
        })
      }
      return win
    })
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

  return {
    // Body HTML of each printed document, in order.
    printed: () => printed,
    openSpy,
    restore() {
      getSpy.mockRestore()
      openSpy.mockRestore()
    },
  }
}
