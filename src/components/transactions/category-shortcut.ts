import type { KeyboardEvent } from 'react'

type ShortcutEvent = Pick<
  globalThis.KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat' | 'defaultPrevented'
> & { target: EventTarget | null }

/**
 * Whether a key press is the plain `key` (no modifier, not a repeat, not
 * already handled) that no one is typing: an editable target never triggers
 * it. Takes a DOM or a React keyboard event.
 */
export function isPlainShortcut(e: ShortcutEvent, key: string): boolean {
  if (
    e.key !== key ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.repeat ||
    e.defaultPrevented
  ) {
    return false
  }
  return !(
    e.target instanceof Element &&
    e.target.closest('input, textarea, select, [contenteditable="true"]')
  )
}

/** The row's "categorize this row" shortcut: a plain `c` (aria-keyshortcuts). */
export function isCategorizeShortcut(e: KeyboardEvent): boolean {
  return isPlainShortcut(e, 'c')
}
