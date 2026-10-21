// SHA-256 of a string as hex: an import run's file checksum.
export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const bytes = new Uint8Array(digest)
    return Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }

  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return `fallback-${Math.abs(hash)}`
}
