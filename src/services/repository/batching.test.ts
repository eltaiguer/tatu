import { describe, expect, it } from 'vitest'
import {
  groupByPatch,
  insertSequentially,
  settleChunks,
  UPDATE_CHUNK_SIZE,
} from './batching'

const ids = (n: number, prefix = 'tx') =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i}`)

describe('settleChunks', () => {
  it('sends at most 100 ids per request', async () => {
    const sizes: number[] = []
    await settleChunks([
      {
        ids: ids(250),
        write: async (chunk) => {
          sizes.push(chunk.length)
          return chunk
        },
      },
    ])
    expect(sizes).toEqual([100, 100, 50])
    expect(Math.max(...sizes)).toBeLessThanOrEqual(UPDATE_CHUNK_SIZE)
  })

  it('keeps the chunks that succeeded when another fails', async () => {
    const outcome = await settleChunks([
      {
        ids: ids(300),
        write: async (chunk) => {
          if (chunk.includes('tx-150')) throw new Error('429')
          return chunk
        },
      },
    ])
    expect(outcome.saved).toHaveLength(200)
    expect(outcome.failed).toEqual(ids(300).slice(100, 200))
    expect(outcome.missing).toEqual([])
    expect((outcome.error as Error).message).toBe('429')
  })

  it('reports ids a successful chunk did not return as missing, not failed', async () => {
    const outcome = await settleChunks([
      { ids: ['a', 'b'], write: async () => ['a'] },
    ])
    expect(outcome).toEqual({ saved: ['a'], failed: [], missing: ['b'] })
  })

  it('never has more than 4 requests in flight', async () => {
    let inFlight = 0
    let peak = 0
    await settleChunks([
      {
        ids: ids(1000),
        write: async (chunk) => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 1))
          inFlight -= 1
          return chunk
        },
      },
    ])
    expect(peak).toBe(4)
  })
})

describe('groupByPatch', () => {
  it('groups rows whose patches are equal, whatever the key order', () => {
    const groups = groupByPatch(
      new Map([
        ['a', { category: 'food', categoryConfidence: 0.9 }],
        ['b', { categoryConfidence: 0.9, category: 'food' }],
        ['c', { category: 'food', categoryConfidence: 0.5 }],
        ['d', { category: 'food', categoryConfidence: 0.9, tags: undefined }],
      ])
    )
    expect(groups.map((g) => g.ids)).toEqual([['a', 'b', 'd'], ['c']])
  })

  it('keeps a clear (null) apart from leaving the field alone', () => {
    const groups = groupByPatch(
      new Map<string, { displayDescription?: string | null }>([
        ['a', { displayDescription: null }],
        ['b', {}],
      ])
    )
    expect(groups).toHaveLength(2)
  })
})

describe('insertSequentially', () => {
  it('inserts 500 rows per request, in order', async () => {
    const sizes: number[] = []
    const { saved, error } = await insertSequentially(
      ids(1200),
      async (rows) => {
        sizes.push(rows.length)
      }
    )
    expect(sizes).toEqual([500, 500, 200])
    expect(saved).toHaveLength(1200)
    expect(error).toBeUndefined()
  })

  it('stops at the first failed chunk and reports exactly the saved rows', async () => {
    let requests = 0
    const { saved, error } = await insertSequentially(ids(1200), async () => {
      requests += 1
      if (requests === 2) throw new Error('timeout')
    })
    expect(requests).toBe(2)
    expect(saved).toEqual(ids(1200).slice(0, 500))
    expect((error as Error).message).toBe('timeout')
  })

  it('stops before the next chunk when told to', async () => {
    let requests = 0
    const { saved, error } = await insertSequentially(
      ids(1200),
      async () => {
        requests += 1
      },
      () => requests < 1
    )
    expect(requests).toBe(1)
    expect(saved).toHaveLength(500)
    expect(error).toBeInstanceOf(Error)
  })
})
