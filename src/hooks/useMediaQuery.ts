import { useCallback, useSyncExternalStore } from 'react'

// Whether a media query matches, following changes (a rotated phone, a
// resized window). False where matchMedia does not exist.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query)
      if (!list) return () => {}
      if (list.addEventListener) {
        list.addEventListener('change', onChange)
        return () => list.removeEventListener('change', onChange)
      }
      // Older Safari only knows the deprecated pair.
      list.addListener?.(onChange)
      return () => list.removeListener?.(onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => !!window.matchMedia?.(query).matches,
    () => false
  )
}
