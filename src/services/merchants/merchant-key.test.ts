import { afterEach, describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import {
  clearAllDescriptionOverrides,
  setDescriptionOverride,
} from '../descriptions/description-overrides'
import {
  groupByMerchant,
  merchantKeyOf,
  merchantLabelFor,
  rawMerchantKey,
} from './merchant-key'

const tx = (overrides: Partial<Transaction>): Transaction => ({
  id: 'a',
  date: new Date('2026-03-01T00:00:00.000Z'),
  description: 'X',
  amount: 1,
  currency: 'UYU',
  type: 'debit',
  source: 'credit_card',
  category: 'groceries',
  rawData: {},
  ...overrides,
})

afterEach(() => clearAllDescriptionOverrides())

describe('rawMerchantKey', () => {
  it('drops tokens that contain digits (auth and reference codes)', () => {
    expect(rawMerchantKey('NETFLIX.COM 1234TT56')).toBe('netflix.com')
    expect(rawMerchantKey('NETFLIX.COM 7890TT12')).toBe('netflix.com')
    expect(rawMerchantKey('Spotify P3d110f721')).toBe('spotify')
    expect(rawMerchantKey('Upwork  866561258Membersh')).toBe('upwork')
  })

  it('drops installment counters, so every cuota of a purchase is one merchant', () => {
    expect(rawMerchantKey('Merpago Seguros Cuota 09 10')).toBe(
      'merpago seguros cuota'
    )
    expect(rawMerchantKey('Merpago Seguros Cuota 10 10')).toBe(
      'merpago seguros cuota'
    )
  })

  it('drops NRR references', () => {
    expect(
      rawMerchantKey(
        'TRANSF INSTANTANEA ENVIADA 380104LE NRR:182499946 JOSE PREX'
      )
    ).toBe('transf instantanea enviada jose prex')
    expect(rawMerchantKey('PAGO FOO NRR:ABC')).toBe('pago foo')
  })

  it('drops the card mask and the trailing ", CITY" of debit-card purchases', () => {
    const key = 'compra con tarjeta debito tintoreria martinizi'
    expect(
      rawMerchantKey(
        'COMPRA CON TARJETA DEBITO TINTORERIA MARTINIZI, MONTEVIDEO TARJ: ############9172'
      )
    ).toBe(key)
    expect(
      rawMerchantKey(
        'COMPRA CON TARJETA DEBITO TINTORERIA MARTINIZI, MALDONADO'
      )
    ).toBe(key)
    expect(rawMerchantKey('NETFLIX.COM, MONTEVIDEO')).toBe('netflix.com')
    expect(
      rawMerchantKey(
        'COMPRA CON TARJETA DEBITO PUESTO EZEQUI.HANDY., XQ9MONTEVIDEO TARJ: ############9172'
      )
    ).toBe('compra con tarjeta debito puesto ezequi.handy')
    expect(
      rawMerchantKey(
        'RETIRO CORRESPONSALES , MONTEVIDEO TARJ: ############9172'
      )
    ).toBe('retiro corresponsales')
  })

  it('keeps a "tarjeta" word: only the TARJ: card mask is noise', () => {
    expect(rawMerchantKey('PAGO ELECTRONICO TARJETA CREDITO')).toBe(
      'pago electronico tarjeta credito'
    )
  })

  it('treats * as a separator, so "MERPAGO*FOO" is "Merpago Foo"', () => {
    expect(rawMerchantKey('MERPAGO*FOO')).toBe('merpago foo')
    expect(rawMerchantKey('Merpago Foo')).toBe('merpago foo')
  })

  it('folds case, accents and whitespace', () => {
    expect(rawMerchantKey('  Café   Ñandú  ')).toBe('cafe nandu')
    expect(rawMerchantKey('CAFE NANDU')).toBe('cafe nandu')
  })

  it('keeps the digits when stripping them leaves nothing', () => {
    expect(rawMerchantKey('7-ELEVEN 2045')).toBe('7-eleven 2045')
    expect(rawMerchantKey('  123  456 ')).toBe('123 456')
  })

  it('keeps the digits when only a payment processor or bank prefix is left, instead of merging every merchant behind it', () => {
    expect(rawMerchantKey('MERPAGO*TIENDA24')).toBe('merpago tienda24')
    expect(rawMerchantKey('Paypal  Store99')).toBe('paypal store99')
    expect(rawMerchantKey('Mp*4Life')).toBe('mp 4life')
    expect(rawMerchantKey('Mp*7Days')).toBe('mp 7days')
    expect(
      rawMerchantKey('TRANSFERENCIA ENVIADA 754934TT55557465 TRF. PLAZA-')
    ).toBe('transferencia enviada 754934tt55557465 trf. plaza')
    // Still drops the card mask and the city: one 7SEVEN on every card.
    expect(
      rawMerchantKey(
        'COMPRA CON TARJETA DEBITO 7SEVEN, MONTEVIDEO TARJ: ############9172'
      )
    ).toBe('compra con tarjeta debito 7seven')
    expect(
      rawMerchantKey(
        'COMPRA CON TARJETA DEBITO 7SEVEN, PUNTA DEL ESTE TARJ: ############1111'
      )
    ).toBe('compra con tarjeta debito 7seven')
  })

  it('keeps the digits when a one short word is all that is left', () => {
    expect(rawMerchantKey('AB 1234')).toBe('ab 1234')
    expect(rawMerchantKey('AB 5678')).toBe('ab 5678')
    // Short merchant names without codes are fine as they are.
    expect(rawMerchantKey('Stm')).toBe('stm')
  })

  it('keeps an "NRO <number>": the number tells payees apart', () => {
    expect(
      rawMerchantKey('DEBITO OPERACION EN SUPERNET O SMS NRO FAMILIA      5506')
    ).not.toBe(
      rawMerchantKey('DEBITO OPERACION EN SUPERNET O SMS NRO FAMILIA      7777')
    )
    expect(rawMerchantKey('PAGO NRO 5506')).toBe('pago nro 5506')
  })

  it('strips a trailing ", PLACE" only for a known city or a debit-card purchase', () => {
    // Transfer counterparties: the part after the comma is a first name.
    expect(
      rawMerchantKey(
        'TRANSFERENCIA RECIBIDA 569729TT RECIBIDA /GAZZANO DE MARCO, FEDERICO J'
      )
    ).toBe('transferencia recibida recibida /gazzano de marco, federico j')
    expect(rawMerchantKey('RESTAURANTE, LA PASIVA')).toBe(
      'restaurante, la pasiva'
    )
    expect(rawMerchantKey('FOO, BAR, BAZ QUX QUUX CORGE')).toBe(
      'foo, bar, baz qux quux corge'
    )
    // Known city, no card mask.
    expect(rawMerchantKey('NETFLIX.COM, PUNTA DEL ESTE')).toBe('netflix.com')
  })
})

describe('merchantKeyOf', () => {
  it('uses the noise-stripped raw description when the user has not renamed', () => {
    expect(merchantKeyOf(tx({ description: 'NETFLIX.COM 1234TT56' }))).toBe(
      'netflix.com'
    )
  })

  it("uses the user's rename (displayDescription), folded but not stripped", () => {
    expect(
      merchantKeyOf(
        tx({
          description: 'NETFLIX.COM 1234TT56',
          displayDescription: ' Netflix 4K ',
        })
      )
    ).toBe('netflix 4k')
  })

  it('keys a split part on its user-typed description, never stripped', () => {
    expect(
      merchantKeyOf(tx({ description: 'Pago 1', splitParentId: 'p' }))
    ).not.toBe(merchantKeyOf(tx({ description: 'Pago 2', splitParentId: 'p' })))
  })

  it('ignores a whitespace-only displayDescription', () => {
    expect(
      merchantKeyOf(
        tx({ description: 'NETFLIX.COM 1234TT56', displayDescription: '   ' })
      )
    ).toBe('netflix.com')
  })

  it('uses a live description override (a "future matching" rename)', () => {
    setDescriptionOverride({
      description: 'UBER TRIP 4455',
      friendlyDescription: 'Uber',
    })
    expect(merchantKeyOf(tx({ description: 'UBER TRIP 4455' }))).toBe('uber')
  })
})

describe('merchantLabelFor', () => {
  it('shows the most common raw variant when nobody renamed', () => {
    const rows = [
      tx({ id: '1', description: 'NETFLIX.COM 1234TT56' }),
      tx({ id: '2', description: 'NETFLIX.COM, MONTEVIDEO' }),
      tx({ id: '3', description: 'NETFLIX.COM, MONTEVIDEO' }),
    ]
    expect(merchantLabelFor(rows)).toBe('NETFLIX.COM, MONTEVIDEO')
  })

  it('breaks ties by the most recent row, whatever the input order', () => {
    const older = tx({
      id: '1',
      description: 'NETFLIX.COM 1111',
      date: new Date('2026-01-01T00:00:00.000Z'),
    })
    const newer = tx({
      id: '2',
      description: 'NETFLIX.COM 2222',
      date: new Date('2026-02-01T00:00:00.000Z'),
    })
    expect(merchantLabelFor([older, newer])).toBe('NETFLIX.COM 2222')
    expect(merchantLabelFor([newer, older])).toBe('NETFLIX.COM 2222')
  })

  it('prefers the most recent rename over any raw variant', () => {
    const rows = [
      tx({ id: '1', description: 'netflix', date: new Date('2026-03-01') }),
      tx({ id: '2', description: 'netflix', date: new Date('2026-03-02') }),
      tx({
        id: '3',
        description: 'NETFLIX',
        displayDescription: 'Netflix',
        date: new Date('2026-01-01'),
      }),
    ]
    expect(merchantLabelFor(rows)).toBe('Netflix')
  })
})

describe('groupByMerchant', () => {
  it('merges the variants of one merchant under one key and label', () => {
    const groups = groupByMerchant([
      tx({ id: '1', description: 'NETFLIX.COM 1234TT56' }),
      tx({ id: '2', description: 'NETFLIX.COM 7890TT12' }),
      tx({ id: '3', description: 'NETFLIX.COM, MONTEVIDEO' }),
      tx({ id: '4', description: 'SPOTIFY P3D110F721' }),
    ])
    expect(groups.map((g) => [g.key, g.transactions.length])).toEqual([
      ['netflix.com', 3],
      ['spotify', 1],
    ])
    expect(groups[1].label).toBe('SPOTIFY P3D110F721')
  })
})
