import { describe, expect, it } from 'vitest'
import { isCategorizeShortcut, isPlainShortcut } from './category-shortcut'

function press(
  target: Element,
  init: KeyboardEventInit = {},
  key = 's'
): KeyboardEvent {
  document.body.append(target)
  let seen!: KeyboardEvent
  target.addEventListener('keydown', (e) => (seen = e as KeyboardEvent), {
    once: true,
  })
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    })
  )
  target.remove()
  return seen
}

describe('isPlainShortcut', () => {
  it('accepts a plain key from a DOM event', () => {
    expect(isPlainShortcut(press(document.createElement('div')), 's')).toBe(
      true
    )
  })

  it('rejects another key, a modifier, a repeat and a prevented event', () => {
    const div = () => document.createElement('div')
    expect(isPlainShortcut(press(div(), {}, 'x'), 's')).toBe(false)
    expect(isPlainShortcut(press(div(), { ctrlKey: true }), 's')).toBe(false)
    expect(isPlainShortcut(press(div(), { metaKey: true }), 's')).toBe(false)
    expect(isPlainShortcut(press(div(), { altKey: true }), 's')).toBe(false)
    expect(isPlainShortcut(press(div(), { repeat: true }), 's')).toBe(false)
  })

  it('rejects a key typed into an editable target', () => {
    expect(isPlainShortcut(press(document.createElement('input')), 's')).toBe(
      false
    )
    expect(
      isPlainShortcut(press(document.createElement('textarea')), 's')
    ).toBe(false)
  })

  it('accepts a non-element target such as the document', () => {
    expect(
      isPlainShortcut(
        {
          key: 's',
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          repeat: false,
          defaultPrevented: false,
          target: document,
        },
        's'
      )
    ).toBe(true)
  })
})

describe('isCategorizeShortcut', () => {
  it('is still the plain c outside editable targets', () => {
    const reactLike = (target: Element, key = 'c') =>
      ({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        repeat: false,
        defaultPrevented: false,
        target,
      }) as unknown as Parameters<typeof isCategorizeShortcut>[0]
    expect(isCategorizeShortcut(reactLike(document.createElement('tr')))).toBe(
      true
    )
    expect(
      isCategorizeShortcut(reactLike(document.createElement('input')))
    ).toBe(false)
    expect(
      isCategorizeShortcut(reactLike(document.createElement('tr'), 's'))
    ).toBe(false)
  })
})
