import { describe, it, expect, vi } from 'vitest'
import { memoizeByReference } from './memo'

describe('memoizeByReference', () => {
  it('returns cached result on second call with same reference', () => {
    const fn = vi.fn((arr: number[]) => arr.reduce((a, b) => a + b, 0))
    const memoized = memoizeByReference(fn)
    const input = [1, 2, 3]

    expect(memoized(input)).toBe(6)
    expect(memoized(input)).toBe(6)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('recomputes for a different reference', () => {
    const fn = vi.fn((arr: number[]) => arr.length)
    const memoized = memoizeByReference(fn)

    expect(memoized([1, 2])).toBe(2)
    expect(memoized([1, 2, 3])).toBe(3)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('caches a result of 0 (falsy value)', () => {
    const fn = vi.fn(() => 0)
    const memoized = memoizeByReference(fn as (input: number[]) => number)
    const input = [1]

    expect(memoized(input)).toBe(0)
    expect(memoized(input)).toBe(0)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('caches a result of null', () => {
    const fn = vi.fn(() => null)
    const memoized = memoizeByReference(fn as (input: object) => null)
    const input = {}

    expect(memoized(input)).toBeNull()
    expect(memoized(input)).toBeNull()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('caches an empty array result (falsy)', () => {
    const fn = vi.fn(() => [] as number[])
    const memoized = memoizeByReference(fn as (input: object) => number[])
    const input = {}

    expect(memoized(input)).toEqual([])
    expect(memoized(input)).toEqual([])
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
