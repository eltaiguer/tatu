import { vi } from 'vitest'

// Captures the CSV a test triggers: the Blob handed to URL.createObjectURL
// (jsdom has none) and the anchor click, which would otherwise make jsdom
// log "not implemented: navigation". Call restore() when done.
export function captureCsvDownload() {
  const blobs: Blob[] = []
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob)
    return 'blob:tatu-test'
  })
  URL.revokeObjectURL = vi.fn()
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})

  return {
    downloads: () => blobs.length,
    // Rows of the last CSV written, header first, quotes stripped.
    async rows(): Promise<string[][]> {
      const blob = blobs[blobs.length - 1]
      if (!blob) throw new Error('no CSV was downloaded')
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsText(blob)
      })
      return text
        .split('\n')
        .map((line) =>
          line.split('","').map((cell) => cell.replace(/^"|"$/g, ''))
        )
    },
    restore() {
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      clickSpy.mockRestore()
    },
  }
}
