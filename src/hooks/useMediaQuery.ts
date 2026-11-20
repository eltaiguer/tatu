import { useSyncExternalStore } from 'react'

// Whether a media query matches, following changes (a rotated phone, a
// resized window). False where matchMedia does not exist.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query)
      list?.addEventListener?.('change', onChange)
      return () => list?.removeEventListener?.('change', onChange)
    },
    () => !!window.matchMedia?.(query).matches,
    () => false
  )
}
