import type { KeyboardEvent } from 'react'

// Keyboard support for the picker lists inside popovers (bulk edit, split):
// a plain list of option buttons that ArrowDown / ArrowUp move through.

const OPTION_SELECTOR = 'button:not(:disabled)'

function optionsIn(list: HTMLElement): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>(OPTION_SELECTOR))
}

/** Focuses the first option of a list, e.g. on ArrowDown from its search. */
export function focusFirstOption(list: HTMLElement | null) {
  if (list) optionsIn(list)[0]?.focus()
}

/** onKeyDown for the list container: ArrowDown / ArrowUp move focus. */
export function handleOptionListKeyDown(event: KeyboardEvent<HTMLElement>) {
  const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (delta === 0) return
  const options = optionsIn(event.currentTarget)
  const current = options.indexOf(document.activeElement as HTMLElement)
  if (current === -1) return
  event.preventDefault()
  const next = Math.min(Math.max(current + delta, 0), options.length - 1)
  options[next].focus()
}
