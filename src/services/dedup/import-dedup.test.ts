import { describe, expect, it } from 'vitest'
import type { Transaction } from '../../models'
import { parseBankAccountCSV } from '../parsers/bank-account-parser'
import { parseCreditCardCSV } from '../parsers/credit-card-parser'
import {
  classifyImport,
  transactionFingerprint,
  type ExistingTransaction,
} from './import-dedup'

const HEADER = `Cliente,Gazzano      A Jose,
Cuenta,Ca De Ahorro Atm,
Número,007003529520,
Moneda,UYU,
Sucursal,02 - 18 De Julio,

Movimientos,
Desde:,01/11/2025,Hasta:,30/11/2025

Fecha,Referencia,Concepto,Descripción,Débito,Crédito,Saldos,
`

const ROW_NEW =
  '28/11/2025,1,COMPRA CON TARJETA DEBITO FARMACIA,,-300.00,,500.00,'
const ROW_A = '27/11/2025,2,COMPRA CON TARJETA DEBITO DISCO,,-1200.00,,800.00,'
const ROW_B =
  '26/11/2025,3,CR. PAGO SUELDOS SETA WORKSHOP SRL,,,6104.26,2000.00,'
const ROW_C = '25/11/2025,4,RETIRO CORRESPONSALES,,-1500.00,,-4104.26,'

function bankFile(...rows: string[]): Transaction[] {
  return parseBankAccountCSV(HEADER + rows.join('\n') + '\n', 'UYU.csv')
    .transactions
}

// What a row looks like after a Supabase round trip: the date comes back from
// its ISO string, the amount from numeric(14,2), raw_data as stored.
function stored(tx: Transaction, deleted = false): ExistingTransaction {
  return {
    tx: {
      ...tx,
      date: new Date(tx.date.toISOString()),
      amount: Number(tx.amount.toFixed(2)),
    },
    deleted,
  }
}

const ids = (txs: Transaction[]) => txs.map((tx) => tx.id)

describe('transactionFingerprint', () => {
  const base = bankFile(ROW_A)[0]

  it('ignores the row position in the file (the id does not)', () => {
    const first = bankFile(ROW_A)[0]
    const shifted = bankFile(ROW_NEW, ROW_A)[1]
    expect(shifted.id).not.toBe(first.id)
    expect(transactionFingerprint(shifted)).toBe(transactionFingerprint(first))
  })

  it('treats 1200 and 1200.00 (and float noise) as the same amount', () => {
    expect(transactionFingerprint({ ...base, amount: 1200.0000001 })).toBe(
      transactionFingerprint({ ...base, amount: 1200 })
    )
  })

  it('tells a debit from a credit of the same amount', () => {
    expect(transactionFingerprint({ ...base, type: 'credit' })).not.toBe(
      transactionFingerprint(base)
    )
  })

  it('tells currencies and sources apart', () => {
    expect(transactionFingerprint({ ...base, currency: 'USD' })).not.toBe(
      transactionFingerprint(base)
    )
    expect(transactionFingerprint({ ...base, source: 'credit_card' })).not.toBe(
      transactionFingerprint(base)
    )
  })

  it('uses the raw description, not the friendly name', () => {
    expect(
      transactionFingerprint({ ...base, displayDescription: 'Disco' })
    ).toBe(transactionFingerprint(base))
    expect(
      transactionFingerprint({ ...base, description: 'OTRO COMERCIO' })
    ).not.toBe(transactionFingerprint(base))
  })

  it('uses the raw date string, not the parsed Date', () => {
    // A shifted parsed date (e.g. a timezone convention change) must not
    // turn the same bank row into a different one.
    expect(
      transactionFingerprint({
        ...base,
        date: new Date('2025-11-26T12:00:00Z'),
      })
    ).toBe(transactionFingerprint(base))
  })

  it('falls back to the stored calendar day when raw_data has no fecha', () => {
    // Legacy rows: local midnight at UTC-3 is 03:00Z the same day.
    const legacy = {
      ...base,
      date: new Date('2025-11-27T03:00:00.000Z'),
      rawData: {},
    }
    expect(transactionFingerprint(legacy)).toBe(transactionFingerprint(base))
  })

  it('ignores padding and runs of spaces in the description', () => {
    // Credit card descripcion is the raw cell, untrimmed and space-padded.
    expect(
      transactionFingerprint({
        ...base,
        description: `  ${base.description.replace(/ /g, '   ')} `,
      })
    ).toBe(transactionFingerprint(base))
  })

  it('reads a legacy date as the calendar day it was stored for, in any zone', () => {
    // Local midnight at UTC+2 is 22:00Z the day before.
    const legacy = {
      ...base,
      date: new Date('2025-11-26T22:00:00.000Z'),
      rawData: {},
    }
    expect(transactionFingerprint(legacy)).toBe(transactionFingerprint(base))
  })

  it('gives split parts no fingerprint: they are not bank rows', () => {
    expect(
      transactionFingerprint({ ...base, id: 'x_split_0', splitParentId: 'x' })
    ).toBeNull()
  })

  it('fingerprints credit card rows too', () => {
    const cc = parseCreditCardCSV(
      `Cliente,Número de tarjeta de crédito,Alias,Tipo de producto,Fecha de corte,Fecha de vencimiento,Límite de crédito (US$),Límite de crédito ($),
Gazzano Arismendi Jose,XXXXX-4362,Visa Soy Santander,Tarjeta de crédito,04/12/2025,22/12/2025,"0,00","270.000,00",

Movimientos,
Fecha,Número de tarjeta,Número de autorización,Descripción,Importe original,Pesos,Dólares,
03/12/2025,XXXXX-4362,123,NETFLIX,"10,99","0,00","10,99",
`,
      'cc.csv'
    ).transactions[0]
    expect(transactionFingerprint(cc)).toEqual(expect.any(String))
    expect(transactionFingerprint({ ...cc, currency: 'UYU' })).not.toBe(
      transactionFingerprint(cc)
    )
  })
})

describe('classifyImport', () => {
  it('imports nothing from an overlapping export whose rows shifted', () => {
    const before = bankFile(ROW_A, ROW_B, ROW_C)
    const after = bankFile(ROW_NEW, ROW_A, ROW_B, ROW_C)

    const result = classifyImport(
      after,
      before.map((tx) => stored(tx))
    )

    expect(ids(result.added)).toEqual([after[0].id])
    expect(result.duplicates).toHaveLength(3)
    expect(result.previouslyDeleted).toEqual([])
  })

  it('imports nothing when the exact same file is imported again', () => {
    const file = bankFile(ROW_A, ROW_B, ROW_C)

    const result = classifyImport(
      bankFile(ROW_A, ROW_B, ROW_C),
      file.map((tx) => stored(tx))
    )

    expect(result.added).toEqual([])
    expect(ids(result.duplicates)).toEqual(ids(file))
  })

  it('imports both rows of a genuine identical same-day pair', () => {
    const result = classifyImport(bankFile(ROW_A, ROW_A, ROW_B), [])

    expect(result.added).toHaveLength(3)
    expect(new Set(ids(result.added)).size).toBe(3)
  })

  it('imports only the copies a re-export has beyond what is stored', () => {
    // One copy stored; the bank later shows the pair (second one posted late).
    const stored1 = bankFile(ROW_A).map((tx) => stored(tx))
    const result = classifyImport(bankFile(ROW_NEW, ROW_A, ROW_A), stored1)

    expect(result.added).toHaveLength(2)
    expect(result.duplicates).toHaveLength(1)
  })

  it('keeps an identical pair at two when the shifted file is imported again', () => {
    const first = bankFile(ROW_A, ROW_A)
    const result = classifyImport(
      bankFile(ROW_NEW, ROW_A, ROW_A),
      first.map((tx) => stored(tx))
    )

    expect(result.added).toHaveLength(1)
    expect(result.duplicates).toHaveLength(2)
  })

  it('keeps a deleted row deleted after a shifted re-import', () => {
    const [a, b] = bankFile(ROW_A, ROW_B)
    const after = bankFile(ROW_NEW, ROW_A, ROW_B)

    const result = classifyImport(after, [stored(a, true), stored(b)])

    expect(ids(result.added)).toEqual([after[0].id])
    expect(result.previouslyDeleted.map((tx) => tx.description)).toEqual([
      a.description,
    ])
    expect(result.duplicates.map((tx) => tx.description)).toEqual([
      b.description,
    ])
  })

  it('reports the deleted copy as such on an exact re-import, live copy as duplicate', () => {
    // Pair stored; the user deleted the first copy (by id).
    const [a1, a2] = bankFile(ROW_A, ROW_A)
    const result = classifyImport(bankFile(ROW_A, ROW_A), [
      stored(a1, true),
      stored(a2),
    ])

    expect(result.added).toEqual([])
    expect(ids(result.previouslyDeleted)).toEqual([a1.id])
    expect(ids(result.duplicates)).toEqual([a2.id])
  })

  it('keeps a deleted split parent deleted; its parts do not count', () => {
    const [a] = bankFile(ROW_A)
    const parent = { ...a, isSplitParent: true }
    const part = (i: number): Transaction => ({
      ...a,
      id: `${a.id}_split_${i}`,
      description: `Parte ${i}`,
      amount: 600,
      splitParentId: a.id,
      rawData: {},
    })

    const result = classifyImport(bankFile(ROW_NEW, ROW_A), [
      stored(parent, true),
      stored(part(0)),
      stored(part(1)),
    ])

    expect(result.added.map((tx) => tx.description)).toEqual([
      bankFile(ROW_NEW)[0].description,
    ])
    expect(result.previouslyDeleted).toHaveLength(1)
  })

  it('does not let split parts absorb a genuine new row', () => {
    const [a] = bankFile(ROW_A)
    // A part that happens to look like a bank row of the file.
    const part: Transaction = {
      ...a,
      id: 'other_split_0',
      splitParentId: 'other',
    }

    const result = classifyImport(bankFile(ROW_A), [stored(part)])

    expect(result.added).toHaveLength(1)
  })

  it('keeps each monthly installment of the same purchase', () => {
    // Santander stamps installments with the purchase date; only the
    // "Cuota N M" counter tells consecutive statements' rows apart.
    const cc = (cuota: string) =>
      parseCreditCardCSV(
        `Cliente,Número de tarjeta de crédito,Alias,Tipo de producto,Fecha de corte,Fecha de vencimiento,Límite de crédito (US$),Límite de crédito ($),
Gazzano Arismendi Jose,XXXXX-4362,Visa Soy Santander,Tarjeta de crédito,04/12/2025,22/12/2025,"0,00","270.000,00",

Movimientos,
Fecha,Número de tarjeta,Número de autorización,Descripción,Importe original,Pesos,Dólares,
17/03/2025,XXXXX-4362,770025140510,Merpago Seguros Cuota ${cuota},"0,00","2.510,56","0,00",
`,
        'cc.csv'
      ).transactions
    const november = cc('09 10')

    const result = classifyImport(
      cc('10 10'),
      november.map((tx) => stored(tx))
    )

    expect(result.added).toHaveLength(1)
  })

  it('does not salt an exact re-import whose stored copy reads another day', () => {
    // A legacy row without raw_data.fecha whose stored date lands on another
    // calendar day: same id, same content otherwise — still the same row.
    const [incoming] = bankFile(ROW_A)
    const legacy = {
      ...incoming,
      date: new Date('2025-11-20T03:00:00.000Z'),
      rawData: {},
    }

    const result = classifyImport(bankFile(ROW_A), [stored(legacy)])

    expect(result.added).toEqual([])
    expect(ids(result.duplicates)).toEqual([incoming.id])
  })

  it('salts the id of a new row that collides with a different stored row', () => {
    const [incoming] = bankFile(ROW_A)
    const other: Transaction = {
      ...bankFile(ROW_B)[0],
      id: incoming.id,
    }

    const result = classifyImport([incoming], [stored(other)])

    expect(ids(result.added)).toEqual([`${incoming.id}_c1`])
    expect(result.added[0].description).toBe(incoming.description)
  })

  it('salts past ids that are already taken', () => {
    const [incoming] = bankFile(ROW_A)
    const b = bankFile(ROW_B)[0]
    const c = bankFile(ROW_C)[0]

    const result = classifyImport(
      [incoming],
      [
        stored({ ...b, id: incoming.id }),
        stored({ ...c, id: `${incoming.id}_c1` }),
      ]
    )

    expect(ids(result.added)).toEqual([`${incoming.id}_c2`])
  })

  it('treats a re-import of a salted row as a duplicate', () => {
    const [incoming] = bankFile(ROW_A)
    const other = { ...bankFile(ROW_B)[0], id: incoming.id }
    const salted = { ...incoming, id: `${incoming.id}_c1` }

    const result = classifyImport(bankFile(ROW_A), [
      stored(other),
      stored(salted),
    ])

    expect(result.added).toEqual([])
    expect(ids(result.duplicates)).toEqual([incoming.id])
  })

  it('also salts against ids it is told are taken elsewhere', () => {
    const [incoming] = bankFile(ROW_A)

    const result = classifyImport([incoming], [], new Set([incoming.id]))

    expect(ids(result.added)).toEqual([`${incoming.id}_c1`])
  })
})

describe('classifyImport — repairing rows stored garbled (#192)', () => {
  // Before #192 a Latin-1 export was read as UTF-8, so each accented letter
  // was stored as one U+FFFD. This reproduces that from the real bytes.
  function readAsUtf8(text: string): string {
    const latin1 = Uint8Array.from(text, (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8').decode(latin1)
  }

  function garbledBankFile(...rows: string[]): Transaction[] {
    return parseBankAccountCSV(
      readAsUtf8(HEADER + rows.join('\n') + '\n'),
      'UYU.csv'
    ).transactions
  }

  const ROW_PENAROL =
    '24/11/2025,5,COMPRA CON TARJETA DEBITO PEÑAROL,ADMINISTRACIÓN,-900.00,,100.00,'

  it('repairs a garbled stored row in place instead of importing it again', () => {
    const [garbled] = garbledBankFile(ROW_PENAROL)
    expect(garbled.description).toContain('�')
    const [correct] = bankFile(ROW_PENAROL)

    const result = classifyImport([correct], [stored(garbled)])

    expect(result.added).toEqual([])
    expect(result.duplicates).toEqual([])
    expect(result.repaired).toHaveLength(1)
    const [repaired] = result.repaired
    expect(repaired.id).toBe(garbled.id)
    expect(repaired.description).toBe(
      'COMPRA CON TARJETA DEBITO PEÑAROL ADMINISTRACIÓN'
    )
    expect(repaired.rawData).toEqual(correct.rawData)
  })

  it('keeps everything but the text of the repaired row', () => {
    const [garbled] = garbledBankFile(ROW_PENAROL)
    const edited = {
      ...garbled,
      category: 'entertainment',
      displayDescription: 'Peñarol',
      tags: ['club'],
    }

    const [repaired] = classifyImport(bankFile(ROW_PENAROL), [
      stored(edited),
    ]).repaired

    expect(repaired).toMatchObject({
      id: garbled.id,
      category: 'entertainment',
      displayDescription: 'Peñarol',
      tags: ['club'],
    })
  })

  it('does not repair a stored row whose description really differs', () => {
    const [garbled] = garbledBankFile(ROW_PENAROL)
    // Same day, amount and length; differs outside the garbled letters.
    const other = ROW_PENAROL.replace('PEÑAROL', 'PEÑAROX')

    const result = classifyImport(bankFile(other), [stored(garbled)])

    expect(result.repaired).toEqual([])
    expect(result.added).toHaveLength(1)
  })

  it('does not let a garbled letter stand for a plain ASCII one', () => {
    const [garbled] = garbledBankFile(ROW_PENAROL)
    const ascii = ROW_PENAROL.replace('PEÑAROL', 'PENAROL').replace(
      'ADMINISTRACIÓN',
      'ADMINISTRACION'
    )

    const result = classifyImport(bankFile(ascii), [stored(garbled)])

    expect(result.repaired).toEqual([])
    expect(result.added).toHaveLength(1)
  })

  it('does not repair across a different amount or day', () => {
    const [garbled] = garbledBankFile(ROW_PENAROL)
    const otherAmount = ROW_PENAROL.replace('-900.00', '-901.00')
    const otherDay = ROW_PENAROL.replace('24/11/2025', '23/11/2025')

    const result = classifyImport(bankFile(otherAmount, otherDay), [
      stored(garbled),
    ])

    expect(result.repaired).toEqual([])
    expect(result.added).toHaveLength(2)
  })

  it('repairs both rows of a garbled identical pair, with no duplicates', () => {
    const garbled = garbledBankFile(ROW_PENAROL, ROW_PENAROL)

    const result = classifyImport(
      bankFile(ROW_PENAROL, ROW_PENAROL),
      garbled.map((tx) => stored(tx))
    )

    expect(result.added).toEqual([])
    expect(result.duplicates).toEqual([])
    expect(ids(result.repaired).sort()).toEqual(ids(garbled).sort())
  })

  it('imports the copies beyond the garbled ones stored (multiset)', () => {
    const garbled = garbledBankFile(ROW_PENAROL, ROW_PENAROL)

    const result = classifyImport(
      bankFile(ROW_PENAROL, ROW_PENAROL, ROW_PENAROL),
      garbled.map((tx) => stored(tx))
    )

    expect(result.repaired).toHaveLength(2)
    expect(result.added).toHaveLength(1)
  })

  it('prefers an exact match: a stored correct row is a duplicate', () => {
    const [correct] = bankFile(ROW_PENAROL)
    const [garbled] = garbledBankFile(ROW_PENAROL)

    const result = classifyImport(
      [correct],
      [stored({ ...garbled, id: 'other-id' }), stored(correct)]
    )

    expect(ids(result.duplicates)).toEqual([correct.id])
    expect(result.repaired).toEqual([])
  })

  it('keeps a deleted garbled row deleted (not repaired, not resurrected)', () => {
    const [garbled] = garbledBankFile(ROW_PENAROL)
    const [correct] = bankFile(ROW_PENAROL)

    const result = classifyImport([correct], [stored(garbled, true)])

    expect(result.repaired).toEqual([])
    expect(result.added).toEqual([])
    expect(ids(result.previouslyDeleted)).toEqual([correct.id])
  })

  it('reads regex characters in a garbled description literally', () => {
    const row = ROW_PENAROL.replace('PEÑAROL', 'MERPAGO*CAFÉ (2.0)')
    const [garbled] = garbledBankFile(row)
    const lookalike = row.replace('MERPAGO*CAFÉ (2.0)', 'MERPAGOOCAFÉ 2X0)')

    expect(
      classifyImport(bankFile(row), [stored(garbled)]).repaired
    ).toHaveLength(1)
    expect(
      classifyImport(bankFile(lookalike), [stored(garbled)]).repaired
    ).toEqual([])
  })

  it('leaves rows without garbled text to the exact matcher', () => {
    const file = bankFile(ROW_A, ROW_PENAROL)

    const result = classifyImport(
      bankFile(ROW_A, ROW_PENAROL),
      file.map((tx) => stored(tx))
    )

    expect(result.repaired).toEqual([])
    expect(result.duplicates).toHaveLength(2)
  })
})
