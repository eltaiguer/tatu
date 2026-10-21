import { describe, expect, it } from 'vitest'
import {
  CATEGORIZATION_MODELS,
  DEFAULT_CATEGORIZATION_MODEL,
  INSIGHTS_MODEL,
  resolveCategorizationModel,
} from './models'

describe('model ids', () => {
  it('offers the current Haiku and Sonnet for categorization, Opus for insights', () => {
    expect(CATEGORIZATION_MODELS.map((m) => m.id)).toEqual([
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
    ])
    expect(DEFAULT_CATEGORIZATION_MODEL).toBe('claude-haiku-5-5')
    expect(INSIGHTS_MODEL).toBe('claude-opus-5-5')
  })
})

describe('resolveCategorizationModel', () => {
  it('maps the ids stored before the 5.5 generation to their successors', () => {
    expect(resolveCategorizationModel('claude-haiku-4-5')).toBe(
      'claude-haiku-5-5'
    )
    expect(resolveCategorizationModel('claude-sonnet-4-6')).toBe(
      'claude-sonnet-5-5'
    )
  })

  it('keeps a current id and falls back to the default for an unknown one', () => {
    expect(resolveCategorizationModel('claude-sonnet-5-5')).toBe(
      'claude-sonnet-5-5'
    )
    expect(resolveCategorizationModel('gpt-9')).toBe(
      DEFAULT_CATEGORIZATION_MODEL
    )
    expect(resolveCategorizationModel('')).toBe(DEFAULT_CATEGORIZATION_MODEL)
  })
})
