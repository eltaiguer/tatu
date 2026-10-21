/**
 * Turns an uploaded CSV's bytes into text (#192).
 *
 * Santander exports are Latin-1 (windows-1252), but a file re-saved by a
 * spreadsheet may be UTF-8. Strict UTF-8 is tried first: Latin-1 text with any
 * accented letter is never valid UTF-8, so it fails and is decoded as
 * windows-1252 instead (a superset of ISO-8859-1 that every byte maps to).
 * Reading a Latin-1 file as UTF-8 — what `File.text()` does — turns each
 * accented letter into U+FFFD, which is how pre-#192 rows were stored; see
 * `services/dedup/import-dedup.ts` for how a re-import repairs them.
 *
 * A UTF-8 byte order mark is dropped (TextDecoder's default).
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return decodeWindows1252(
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    )
  }
}

// windows-1252 bytes 0x80-0x9F (WHATWG encoding table). The five bytes it
// leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) keep their C1 code point,
// as browsers do. Decoded by hand: Node 20's TextDecoder('windows-1252')
// treats the whole block as C1 controls (ISO-8859-1).
const CP1252_HIGH = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161,
  0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
]

function decodeWindows1252(bytes: Uint8Array): string {
  let text = ''
  const CHUNK = 8192
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const codes = Array.from(bytes.subarray(start, start + CHUNK), (byte) =>
      byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : byte
    )
    text += String.fromCharCode(...codes)
  }
  return text
}
