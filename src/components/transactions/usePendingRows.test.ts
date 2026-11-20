import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePendingRows } from './usePendingRows'

describe('usePendingRows', () => {
  it('keeps a row pending until every write on it is done', () => {
    const { result } = renderHook(() => usePendingRows())

    act(() => {
      result.current.setPending('a', true)
      result.current.setPending('a', true)
    })
    act(() => result.current.setPending('a', false))
    expect(result.current.pendingTransactionIds.has('a')).toBe(true)

    act(() => result.current.setPending('a', false))
    expect(result.current.pendingTransactionIds.has('a')).toBe(false)
  })

  it('tracks rows separately and never goes below zero', () => {
    const { result } = renderHook(() => usePendingRows())

    act(() => result.current.setPending('a', false))
    act(() => result.current.setPending('b', true))

    expect(result.current.pendingTransactionIds.has('a')).toBe(false)
    expect(result.current.pendingTransactionIds.has('b')).toBe(true)
  })
})
