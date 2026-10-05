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
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
