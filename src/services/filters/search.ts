import type { Transaction } from '../../models'
import { normalizeMerchantName } from '../categorizer/merchant-patterns'

export function buildSearchSuggestions(
  transactions: Transaction[],
  limit = 6
): string[] {
  const counts = new Map<string, { count: number; label: string }>()

  transactions.forEach((tx) => {
    const normalized = normalizeMerchantName(tx.description)
    if (!normalized) {
      return
    }

    const current = counts.get(normalized)
    if (current) {
      current.count += 1
    } else {
      counts.set(normalized, { count: 1, label: tx.description.trim() })
    }
  })

  return Array.from(counts.values())
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count
      }
      return a.label.localeCompare(b.label)
    })
    .slice(0, limit)
    .map((entry) => entry.label)
}

export function splitHighlight(
  text: string,
  query: string
): Array<{ text: string; isMatch: boolean }> {
  if (!query) {
    return [{ text, isMatch: false }]
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'gi')
  const segments: Array<{ text: string; isMatch: boolean }> = []
  let lastIndex = 0
  let match = regex.exec(text)

  while (match) {
    const start = match.index
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), isMatch: false })
    }
    segments.push({ text: match[0], isMatch: true })
    lastIndex = start + match[0].length
    match = regex.exec(text)
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isMatch: false })
  }

  if (segments.length === 0) {
    return [{ text, isMatch: false }]
  }

  return segments
}
