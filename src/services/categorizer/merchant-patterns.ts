import { Category } from '../../models'

/**
 * Pattern matching result
 */
export interface PatternMatch {
  category: Category
  confidence: number
  matchedPattern?: string
}

/**
 * Merchant pattern definition
 */
interface MerchantPattern {
  patterns: string[]
  category: Category
  confidence: number
}

/**
 * Database of merchant patterns for Uruguayan merchants
 * Patterns are matched case-insensitively and support partial matches
 */
const MERCHANT_PATTERNS: MerchantPattern[] = [
  // Groceries
  {
    patterns: ['devoto supermercado', 'super sol', 'provicentro'],
    category: Category.Groceries,
    confidence: 0.9,
  },
  {
    patterns: ['devoto', 'supermercado'],
    category: Category.Groceries,
    confidence: 0.85,
  },
  {
    patterns: ['carniceria', 'panaderia', 'verduleria'],
    category: Category.Groceries,
    confidence: 0.85,
  },

  // Restaurants & Dining
  {
    patterns: ['sopranos', 'ondero', 'cafe', 'cultocafe', 'restaurant'],
    category: Category.Restaurants,
    confidence: 0.85,
  },
  {
    patterns: ['pedidosya', 'rappi', 'uber eats'],
    category: Category.Restaurants,
    confidence: 0.9,
  },

  // Utilities
  {
    patterns: ['antel', 'ute', 'ose'],
    category: Category.Utilities,
    confidence: 0.95,
  },

  // Healthcare
  {
    patterns: ['farmashop', 'farmacia'],
    category: Category.Healthcare,
    confidence: 0.9,
  },
  {
    patterns: ['summum', 'medicina', 'hospital', 'clinica'],
    category: Category.Healthcare,
    confidence: 0.85,
  },

  // Software & Subscriptions
  {
    patterns: [
      'jetbrains',
      'atlassian',
      'amazon web services',
      'aws',
      'claude ai',
      'openai',
    ],
    category: Category.Software,
    confidence: 0.95,
  },
  {
    patterns: ['upwork', 'fiverr', 'github', 'gitlab'],
    category: Category.Software,
    confidence: 0.9,
  },
  {
    patterns: ['bamboohr', 'slack', 'zoom', 'microsoft'],
    category: Category.Software,
    confidence: 0.9,
  },
  {
    patterns: ['paypal  cloudflare', 'cloudflare'],
    category: Category.Software,
    confidence: 0.85,
  },
  {
    patterns: ['linkedin'],
    category: Category.Software,
    confidence: 0.8,
  },

  // Entertainment
  {
    patterns: ['spotify', 'netflix', 'disney', 'hbo', 'amazon prime'],
    category: Category.Entertainment,
    confidence: 0.95,
  },
  {
    patterns: ['cine', 'teatro', 'concierto'],
    category: Category.Entertainment,
    confidence: 0.85,
  },

  // Shopping
  {
    patterns: ['sodimac', 'shopping'],
    category: Category.Shopping,
    confidence: 0.9,
  },
  {
    patterns: ['adidas', 'nike', 'vans', 'puma', 'rip curl'],
    category: Category.Shopping,
    confidence: 0.9,
  },
  {
    patterns: ['harrington', 'toto calzado', 'calzado'],
    category: Category.Shopping,
    confidence: 0.85,
  },
  {
    patterns: ['merpago prohygiene', 'prohygiene'],
    category: Category.Shopping,
    confidence: 0.8,
  },
  {
    patterns: ['tienda', 'boutique'],
    category: Category.Shopping,
    confidence: 0.75,
  },

  // Transport & Fuel
  {
    patterns: ['ancap', 'puesto', 'combustible', 'nafta'],
    category: Category.Transport,
    confidence: 0.9,
  },
  {
    patterns: ['taxi', 'uber', 'cabify', 'stm'],
    category: Category.Transport,
    confidence: 0.85,
  },
  {
    patterns: ['colonia express'],
    category: Category.Transport,
    confidence: 0.95,
  },
  {
    patterns: ['tintoreria'],
    category: Category.Personal,
    confidence: 0.85,
  },

  // Insurance
  {
    patterns: ['zurich', 'automovil club', 'seguro'],
    category: Category.Insurance,
    confidence: 0.9,
  },

  // Personal Care
  {
    patterns: ['peluqueria', 'salon', 'spa', 'gym', 'gimnasio'],
    category: Category.Personal,
    confidence: 0.85,
  },

  // Fees
  {
    patterns: ['comision', 'cargo', 'fee'],
    category: Category.Fees,
    confidence: 0.9,
  },
]

/**
 * Normalize merchant name for matching
 * - Converts to lowercase
 * - Trims whitespace
 * - Removes extra spaces
 */
export function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Match a merchant name against patterns
 * Returns the best match with category and confidence
 */
export function matchMerchantPattern(
  merchantName: string
): PatternMatch | null {
  const normalized = normalizeMerchantName(merchantName)

  if (!normalized) {
    return null
  }

  let bestMatch: PatternMatch | null = null
  let highestConfidence = 0

  for (const merchantPattern of MERCHANT_PATTERNS) {
    for (const pattern of merchantPattern.patterns) {
      const normalizedPattern = normalizeMerchantName(pattern)

      // Check if the normalized merchant name contains the pattern
      if (normalized.includes(normalizedPattern)) {
        // Calculate confidence based on match quality
        let confidence = merchantPattern.confidence

        // Exact match gets full confidence
        if (normalized === normalizedPattern) {
          confidence = merchantPattern.confidence
        }
        // Partial match gets slightly reduced confidence
        else {
          confidence = merchantPattern.confidence * 0.95
        }

        // Keep the best match
        if (confidence > highestConfidence) {
          highestConfidence = confidence
          bestMatch = {
            category: merchantPattern.category,
            confidence,
            matchedPattern: pattern,
          }
        }
      }
    }
  }

  return bestMatch
}

/**
 * Get category for a merchant name
 * Returns category and confidence score
 */
export function getMerchantCategory(merchantName: string): {
  category: Category
  confidence: number
} {
  const match = matchMerchantPattern(merchantName)

  if (match) {
    return {
      category: match.category,
      confidence: match.confidence,
    }
  }

  return {
    category: Category.Uncategorized,
    confidence: 0,
  }
}
