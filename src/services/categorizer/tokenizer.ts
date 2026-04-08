/**
 * Shared tokenization and similarity utilities for smart categorization.
 * Used by fuzzy matching, learned patterns, and similar-merchant suggestions.
 */

/** Stopwords to strip — common Uruguayan merchant noise tokens */
const STOPWORDS = new Set([
  'sa',
  'srl',
  'aut',
  'deb',
  'nro',
  'cuota',
  'visa',
  'mastercard',
  'master',
  'debito',
  'credito',
  'automatico',
  'de',
  'del',
  'la',
  'el',
  'en',
  'por',
  'los',
  'las',
  'un',
  'una',
  'con',
  'para',
  'inc',
  'llc',
  'ltd',
  'com',
  'www',
])

/**
 * Strip diacritics (accents) from a string.
 * "café" → "cafe", "débito" → "debito"
 */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Tokenize a merchant name into meaningful lowercase tokens.
 * Strips diacritics, removes stopwords, drops short tokens (< 2 chars),
 * and removes purely numeric tokens.
 */
export function tokenize(name: string): string[] {
  if (!name) return []

  const cleaned = stripDiacritics(name.toLowerCase().trim())
  const raw = cleaned.split(/[\s.,;:\-_/\\()+*#@!&]+/).filter(Boolean)

  const tokens: string[] = []
  const seen = new Set<string>()

  for (const token of raw) {
    if (
      token.length >= 2 &&
      !STOPWORDS.has(token) &&
      !/^\d+$/.test(token) &&
      !seen.has(token)
    ) {
      seen.add(token)
      tokens.push(token)
    }
  }

  return tokens
}

/**
 * Dice coefficient between two token sets.
 * Returns 0–1 where 1 means identical sets.
 */
export function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0 || b.length === 0) return 0

  const setB = new Set(b)
  let intersection = 0
  for (const token of a) {
    if (setB.has(token)) intersection++
  }

  return (2 * intersection) / (a.length + b.length)
}

/**
 * Character bigram set for a string.
 * "hello" → {"he", "el", "ll", "lo"}
 */
function bigrams(s: string): Set<string> {
  const result = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) {
    result.add(s.slice(i, i + 2))
  }
  return result
}

/**
 * Bigram similarity between two strings (Sørensen–Dice on character bigrams).
 * Returns 0–1. Handles single-char and empty strings.
 */
export function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigramsA = bigrams(a)
  const bigramsB = bigrams(b)

  let intersection = 0
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size)
}

/**
 * Fuzzy token similarity — combines exact token matching (Dice)
 * with character-level bigram similarity for partial token matches.
 *
 * This allows "sup" to partially match "supermercado" and
 * "devoto sup" to match "devoto supermercado".
 */
export function fuzzyTokenSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0

  // For each token in a, find the best matching token in b
  let totalScore = 0
  for (const tokenA of a) {
    let bestScore = 0
    for (const tokenB of b) {
      if (tokenA === tokenB) {
        bestScore = 1
        break
      }
      // Prefix match bonus: "sup" is a prefix of "supermercado"
      if (tokenB.startsWith(tokenA) || tokenA.startsWith(tokenB)) {
        const shorter = Math.min(tokenA.length, tokenB.length)
        const longer = Math.max(tokenA.length, tokenB.length)
        const prefixScore = shorter / longer
        bestScore = Math.max(bestScore, prefixScore * 0.95)
      } else {
        const sim = bigramSimilarity(tokenA, tokenB)
        bestScore = Math.max(bestScore, sim * 0.85)
      }
    }
    totalScore += bestScore
  }

  // Normalize by the average of both lengths to penalize mismatched sizes
  return (2 * totalScore) / (a.length + b.length)
}
