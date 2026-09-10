import { describe, it, expect } from 'vitest'
import type { Transaction } from '../../models'
import { inferInternalTransfers } from './internal-transfers'

/**
 * Transfer inference decides which rows are excluded from every spending
 * total, so a performance change here must be provably output-preserving,
 * not just "the existing tests still pass".
 *
 * This builds a large deterministic corpus, runs inference over it, and
 * fingerprints the full result. The fingerprint was captured from the
 * implementation as it stood before the O(n^2) rework; any change to which
 * rows get categorised — or to their confidence — changes the digest and
 * fails this test.
 */

// Mulberry32 — small, deterministic, no dependency.
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DESCRIPTIONS = [
  'TRANSFERENCIA ENVIADA NRR:182500517',
  'TRANSF INSTANTANEA RECIBIDA',
  'DEBITO OPERACION EN SUPERNET',
  'PAGO ELECTRONICO TARJETA CREDITO',
  'COMPRA DOLARES',
  'VENTA DOLARES',
  'TRF. PLAZA- MARIA PEREZ',
  'NRR:998877 JOSE PREX',
  'SUPERMERCADO DISCO',
  'FARMACIA SAN ROQUE',
  'CARGO POR TRASPASO CTA.COMBINADA',
  'CAMBIO MONEDA',
  'NETFLIX.COM',
  'PAGO SUPERNET',
]

function buildCorpus(count: number, seed = 42): Transaction[] {
  const rng = makeRng(seed)
  const txs: Transaction[] = []

  for (let i = 0; i < count; i++) {
    const pick = Math.floor(rng() * DESCRIPTIONS.length)
    // Amounts are drawn from a small pool on purpose: transfer pairing keys
    // off equal amounts, so a wide spread would produce almost no pairs and
    // the fingerprint would not exercise the pairing path.
    const amount = Math.round(rng() * 8) * 500 + 100
    const day = 1 + Math.floor(rng() * 27)

    txs.push({
      id: `tx-${i}`,
      date: new Date(Date.UTC(2026, 2, day)),
      description: DESCRIPTIONS[pick],
      amount,
      currency: rng() > 0.5 ? 'USD' : 'UYU',
      type: rng() > 0.5 ? 'debit' : 'credit',
      source: rng() > 0.2 ? 'bank_account' : 'credit_card',
      rawData:
        rng() > 0.6 ? { referencia: `${100000 + Math.floor(rng() * 50)}` } : {},
    } as Transaction)
  }

  return txs
}

function fingerprint(transactions: Transaction[]): string {
  const serialized = transactions
    .map((tx) => `${tx.id}|${tx.category ?? ''}|${tx.categoryConfidence ?? ''}`)
    .sort()
    .join('\n')

  // FNV-1a, matching the style already used in insight-cache.ts.
  let hash = 0x811c9dc5
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

describe('inferInternalTransfers — output is preserved', () => {
  it('produces the same categorisation over a 600-transaction corpus', () => {
    const result = inferInternalTransfers(buildCorpus(600))
    expect(fingerprint(result)).toBe('141ed1cc')
  })

  it('produces the same categorisation over a differently seeded corpus', () => {
    const result = inferInternalTransfers(buildCorpus(400, 7))
    expect(fingerprint(result)).toBe('6b4cb7f5')
  })

  it('is idempotent — running it twice changes nothing', () => {
    const once = inferInternalTransfers(buildCorpus(300))
    const twice = inferInternalTransfers(once)
    expect(fingerprint(twice)).toBe(fingerprint(once))
  })

  it('never assigns a category to a credit-card row', () => {
    // canAutoAssignTransfer only touches bank_account rows; the pairing pass
    // must not widen that.
    const result = inferInternalTransfers(buildCorpus(600))
    const cardWithTransfer = result.filter(
      (tx) =>
        tx.source === 'credit_card' &&
        (tx.category === 'internal_transfer' ||
          tx.category === 'external_transfer')
    )
    expect(cardWithTransfer).toHaveLength(0)
  })

  it('preserves input order and length', () => {
    const input = buildCorpus(200)
    const result = inferInternalTransfers(input)
    expect(result).toHaveLength(input.length)
    expect(result.map((t) => t.id)).toEqual(input.map((t) => t.id))
  })
})
