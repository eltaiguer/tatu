import { useRef } from 'react'

type AutoFocusHandler = (event: Event) => void

/**
 * Radix returns focus on close to its `<Trigger>`; the app's dialogs are
 * controlled and have none, so focus would fall to `<body>`. This remembers
 * what had focus when the dialog opened and returns focus there on close.
 * If that element is gone (e.g. its row was deleted), focus is left to
 * Radix's default, which lands on `<body>`. A caller's own handlers run
 * first; a caller that prevents the close event keeps full control.
 */
export function useReturnFocus(
  onOpenAutoFocus?: AutoFocusHandler,
  onCloseAutoFocus?: AutoFocusHandler
) {
  const openerRef = useRef<HTMLElement | null>(null)

  return {
    onOpenAutoFocus: (event: Event) => {
      const active = document.activeElement
      openerRef.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      const opener = openerRef.current
      openerRef.current = null
      if (event.defaultPrevented || !opener?.isConnected) return
      event.preventDefault()
      opener.focus()
    },
  }
}
