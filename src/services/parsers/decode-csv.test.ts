import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeCsvBytes } from './decode-csv'

// "Descripción,PEÑAROL" as Santander writes it: Latin-1, one byte per letter.
const LATIN1 = new Uint8Array([
  0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0x70, 0x63, 0x69, 0xf3, 0x6e, 0x2c, 0x50,
  0x45, 0xd1, 0x41, 0x52, 0x4f, 0x4c,
])

describe('decodeCsvBytes', () => {
  it('decodes a Latin-1 (windows-1252) export with its accents', () => {
    expect(decodeCsvBytes(LATIN1)).toBe('Descripción,PEÑAROL')
  })

  it('decodes windows-1252-only characters too', () => {
    // 0x80 is € in windows-1252 (a C1 control in ISO-8859-1).
    expect(decodeCsvBytes(new Uint8Array([0x80, 0x31, 0x30]))).toBe('€10')
  })

  it('decodes the whole 0x80-0x9F block as windows-1252, on any runtime', () => {
    // Node 20's TextDecoder('windows-1252') yields C1 controls here.
    const bytes = new Uint8Array([0x80, 0x85, 0x91, 0x92, 0x93, 0x96, 0x9f])
    expect(decodeCsvBytes(bytes)).toBe('€…‘’“–Ÿ')
  })

  it('keeps the five undefined windows-1252 bytes as their C1 code points', () => {
    const bytes = new Uint8Array([0xe9, 0x81, 0x8d, 0x8f, 0x90, 0x9d])
    expect(decodeCsvBytes(bytes)).toBe('é\u0081\u008d\u008f\u0090\u009d')
  })

  it('leaves a UTF-8 file unchanged', () => {
    const text = 'Descripción,PEÑAROL,€'
    expect(decodeCsvBytes(new TextEncoder().encode(text))).toBe(text)
  })

  it('strips a UTF-8 byte order mark', () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode('Fecha,Débito'),
    ])
    expect(decodeCsvBytes(bytes)).toBe('Fecha,Débito')
  })

  it('accepts an ArrayBuffer', () => {
    expect(decodeCsvBytes(LATIN1.buffer)).toBe('Descripción,PEÑAROL')
  })

  it('decodes the Santander samples without replacement characters', () => {
    for (const name of [
      'CreditCardsMovementsDetail.csv',
      'USDmovements.csv',
      'UYUmovements.csv',
    ]) {
      const text = decodeCsvBytes(
        readFileSync(join(process.cwd(), 'samples', name))
      )
      expect(text).not.toContain('�')
    }
  })
})
