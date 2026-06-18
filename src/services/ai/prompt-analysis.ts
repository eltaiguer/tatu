import Anthropic from '@anthropic-ai/sdk'
import type { Transaction } from '../../models'
import type { AiConfig } from './ai-config'

const MAX_CC_SAMPLES = 180
const MAX_BA_SAMPLES = 120

interface DescriptionSample {
  description: string
  category: string
  displayDescription?: string
}

function deduplicateByDescription(transactions: Transaction[]): DescriptionSample[] {
  const seen = new Set<string>()
  const samples: DescriptionSample[] = []
  for (const tx of transactions) {
    if (seen.has(tx.description)) continue
    seen.add(tx.description)
    samples.push({
      description: tx.description,
      category: tx.category ?? 'uncategorized',
      displayDescription: tx.displayDescription,
    })
  }
  return samples
}

function formatSamples(samples: DescriptionSample[]): string {
  return samples
    .map((s) => {
      const renamed =
        s.displayDescription && s.displayDescription !== s.description
          ? ` → ${s.displayDescription}`
          : ''
      return `${s.description} | ${s.category}${renamed}`
    })
    .join('\n')
}

export async function analyzeTransactionPatterns(
  transactions: Transaction[],
  config: AiConfig
): Promise<string> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  })

  const creditCard = deduplicateByDescription(
    transactions.filter((tx) => tx.source === 'credit_card')
  ).slice(0, MAX_CC_SAMPLES)

  const bankAccount = deduplicateByDescription(
    transactions.filter((tx) => tx.source === 'bank_account')
  ).slice(0, MAX_BA_SAMPLES)

  const userMessage = `Below are unique transaction descriptions from Santander Uruguay, grouped by account type.
Each line: raw description | current category | → friendly name (only when a user renamed it).

Your task: produce prompt instructions for an AI transaction categorizer that will work
for ANY Santander Uruguay user. Do NOT use specific merchant names from this data as
examples unless they are universally recognizable chains (e.g., Netflix, Spotify, Uber).
Instead, describe the PATTERNS.

Produce these 5 sections as markdown:

1. PREFIX PATTERNS — bank-injected prefixes to strip, per account type
2. SUFFIX/NOISE PATTERNS — trailing card numbers, auth codes, city names, reference codes
3. MERCHANT ENCODING — how merchant names are abbreviated or encoded in Santander UY
4. CATEGORY HEURISTICS — what merchant types map to which categories (generic rules, not lists)
5. INTERNAL TRANSFER PATTERNS — description patterns that reliably identify internal movements

Write instructions, not data. The output will be pasted into an AI system prompt.

=== CREDIT CARD (${creditCard.length} unique descriptions) ===
${formatSamples(creditCard) || '(ninguna)'}

=== BANK ACCOUNT (${bankAccount.length} unique descriptions) ===
${formatSamples(bankAccount) || '(ninguna)'}`

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 4096,
    system:
      'You are a prompt engineer analyzing bank transaction data to write reusable AI categorization instructions.',
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = response.content[0]
  if (block.type !== 'text') {
    throw new Error(`Respuesta inesperada del modelo (tipo: ${block.type})`)
  }

  return block.text
}
