import { describe, expect, it } from 'vitest'
import { firstTextBlock, type ClaudeResponseLike } from './text-block'

// The SDK's Message carries more fields than the helper reads; the tests
// build responses the same loose way.
const response = (value: unknown) => value as ClaudeResponseLike

describe('firstTextBlock', () => {
  it('returns the first text block, skipping a thinking block', () => {
    expect(
      firstTextBlock(
        response({
          content: [
            { type: 'thinking', thinking: '', signature: 'sig' },
            { type: 'text', text: '[]' },
          ],
          stop_reason: 'end_turn',
        })
      )
    ).toBe('[]')
  })

  it('names a refusal instead of a missing block', () => {
    expect(() =>
      firstTextBlock(
        response({
          content: [],
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: 'general_harms' },
        })
      )
    ).toThrow(/rechazó.*general_harms/)
  })

  it('names a truncated response', () => {
    expect(() =>
      firstTextBlock(
        response({
          content: [{ type: 'thinking', thinking: '', signature: 'sig' }],
          stop_reason: 'max_tokens',
        })
      )
    ).toThrow(/truncada/)
  })

  it('says there was no text block, not which block came first', () => {
    expect(() =>
      firstTextBlock(
        response({ content: [{ type: 'image' }], stop_reason: 'end_turn' })
      )
    ).toThrow(/sin bloque de texto/)
  })
})
