import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyWithJev, type JevConfig } from './jev-classifier'
import type { AiEnrichmentInput } from './transaction-ai'

const config: JevConfig = { apiKey: 'or-test', model: 'typesafe/jev-test' }

function input(id: string, description: string): AiEnrichmentInput {
  return {
    id,
    description,
    type: 'debit',
    amount: 500,
    currency: 'UYU',
    source: 'bank_account',
  }
}

function okResponse(answers: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ model: 'typesafe/jev-test', answers, usage: {} }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('classifyWithJev', () => {
  it('asks one Choice question per row over the category ids and reads the answers', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        tx1: {
          type: 'choice',
          choice: 'groceries',
          confidence: 0.91,
          probabilities: { groceries: 0.93, restaurants: 0.07 },
        },
      })
    )

    const { results } = await classifyWithJev(
      [input('tx1', 'COMPRA CON TARJETA DEBITO DISCO 12 TARJ: 1234XXXX5678')],
      config,
      [{ id: 'coffee', label: 'Café', color: '#000', icon: '☕' }]
    )

    expect(results.get('tx1')).toEqual({
      id: 'tx1',
      category: 'groceries',
      confidence: 0.91,
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/systemone')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer or-test')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('typesafe/jev-test')
    expect(body.questions.tx1.type).toBe('choice')
    expect(Object.keys(body.questions.tx1.criteria)).toEqual(
      expect.arrayContaining(['groceries', 'internal_transfer', 'coffee'])
    )
    expect(Object.keys(body.questions.tx1.criteria)).not.toContain(
      'uncategorized'
    )
    // The row is in the state by id, cleaned in code (Jev does not decode)
    expect(body.state.transactions[0]).toMatchObject({
      id: 'tx1',
      merchant: 'compra con tarjeta debito disco',
      type: 'debit',
      currency: 'UYU',
    })
  })

  it('rejects a category that is not an offered option', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        tx1: { type: 'choice', choice: 'snacks', confidence: 0.5 },
      })
    )

    const { results } = await classifyWithJev([input('tx1', 'X')], config, [])

    expect(results.get('tx1')?.category).toBe('uncategorized')
  })

  it('sends rows in batches and keeps the batches that succeeded', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      input(`tx${i}`, `MERCHANT ${i}`)
    )
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      const ids = Object.keys(body.questions)
      if (ids.includes('tx12')) {
        return new Response('overloaded', { status: 529 })
      }
      return okResponse(
        Object.fromEntries(
          ids.map((id) => [
            id,
            { type: 'choice', choice: 'shopping', confidence: 0.8 },
          ])
        )
      )
    })

    const { results, partialFailure } = await classifyWithJev(rows, config, [])

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(results.size).toBe(15)
    expect(partialFailure).toMatch(/1 de 3/)
  })

  it('throws when every batch fails, and stops at an auth error', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }))

    await expect(
      classifyWithJev(
        Array.from({ length: 25 }, (_, i) => input(`tx${i}`, `M ${i}`)),
        config,
        []
      )
    ).rejects.toThrow(/401/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
