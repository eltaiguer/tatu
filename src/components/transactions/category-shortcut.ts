import type { KeyboardEvent } from 'react'

/**
 * Whether a key press is the "categorize this row" shortcut: a plain `c`
 * (lowercase, matching aria-keyshortcuts="c") that no one is typing. React
 * bubbles events from portaled content (the picker's own search) to the row,
 * so an editable target must never trigger it.
 */
export function isCategorizeShortcut(e: KeyboardEvent): boolean {
  if (
    e.key !== 'c' ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.repeat ||
    e.defaultPrevented
  ) {
    return false
  }
  const target = e.target as HTMLElement
  return !target.closest('input, textarea, select, [contenteditable="true"]')
}
