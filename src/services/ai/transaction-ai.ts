import Anthropic from '@anthropic-ai/sdk'
import { Category, CATEGORY_LABELS } from '../../models'
import type { Transaction } from '../../models'
import type { CustomCategory } from '../categories/category-store'
import type { CustomPattern } from '../categorizer/custom-patterns'
import type { AiConfig } from './ai-config'

export interface AiEnrichmentInput {
  id: string
  description: string
  type: 'debit' | 'credit'
  amount: number
  currency: 'USD' | 'UYU'
  source: 'credit_card' | 'bank_account'
}

export interface AiEnrichmentResult {
  id: string
  category: string
  displayDescription: string
  confidence: number
}

export interface AiCorrectionContext {
  descriptionExamples: Array<{ raw: string; friendly: string; category?: string }>
  categoryExamples: Array<{ merchant: string; category: string }>
  customCategories: CustomCategory[]
  customPatterns: CustomPattern[]
}

const BATCH_SIZE = 150

function buildSystemPrompt(customCategories: CustomCategory[]): string {
  const builtinLines = Object.values(Category)
    .filter((c) => c !== Category.Uncategorized)
    .map((c) => `${c} — ${CATEGORY_LABELS[c]}`)
    .join('\n')

  const customLines = customCategories
    .filter((c) => !c.isIgnored)
    .map((c) => `${c.id} — ${c.label}`)
    .join('\n')

  const categoryBlock = customLines
    ? `${builtinLines}\n${customLines}`
    : builtinLines

  return `You are a financial transaction classifier for a Santander Uruguay personal finance app.
The user has 3 accounts: a credit card (source: credit_card), a USD bank account, and a UYU bank account (both source: bank_account).

For each transaction return:
1. displayDescription — the real merchant or payee name, properly capitalized. Use brand capitalization for international names (Netflix, Spotify, Uber). Infer the real name from partial or encoded text; if truly unrecognizable keep the cleaned version.
2. category — EXACTLY one of the values listed in CATEGORIES below (the part before the dash).

STEP 1 — STRIP BANK-INJECTED PREFIXES (bank_account source only; credit_card starts directly with merchant):
Remove whichever prefix appears, then analyse the remainder:
  DEBITO OPERACION EN BANCA DIGITAL · DEBITO OPERACION EN SUPERNET O SMS
  CREDITO OPERACION EN BANCA DIGITAL · COMPRA CON TARJETA DEBITO
  TRANSF INSTANTANEA ENVIADA · TRANSF INSTANTANEA RECIBIDA
  TRANSFERENCIA ENVIADA · TRANSFERENCIA RECIBIDA
  CARGO POR TRASPASO CTA.COMBINADA · ABONO POR TRASPASO CTA.COMBINADA
  PAGO ELECTRONICO · CR. PAGO SUELDOS · RETIRO CORRESPONSALES
  ABONO POR PAGO A PROVEEDORES · COMISION POR COSTO PRODUCTO

STEP 2 — STRIP TRAILING NOISE (applies to all sources):
  • Masked card: TARJ: ####...XXXX
  • Auth/session codes: P[alphanumeric] (e.g. P432629721) · short random codes after merchant name (e.g. Fn6f76, B82nm6)
  • Reference codes: NRR:[numbers] · Santander codes: [digits]TT[digits]
  • City/location suffix: ", MONTEVIDEO" · ", MALDONADO" · ", PUNTA DEL EST" and similar
  • Branch numbers: trailing space + 2–4 digits after a brand name

STEP 3 — DECODE MERCHANT:
  • Normalize multiple spaces to single
  • Abbreviations: Hnos → Hermanos · SRL/SA = company type (omit unless it's the brand)
  • Payment processors (not the merchant — real merchant name follows): Sq (Square) · Merpago (MercadoPago) · Tst · Bcf · Sp
  • DLO. prefix always means delivery (e.g. DLO.PEDIDOSYA → PedidosYa)
  • TRF. PLAZA- [NAME] → merchant/recipient is [NAME], strip the prefix

CATEGORIES:
${categoryBlock}
uncategorized — Sin categoría

TRANSFER RULES — two distinct categories:

"internal_transfer" (Transferencias internas) — movements between the user's own 3 accounts only:
  • CARGO/ABONO POR TRASPASO CTA.COMBINADA + account number
  • PAGO ELECTRONICO TARJETA CREDITO → credit card bill payment from bank account
  • Matched debit/credit pairs for the same amount on the same day (own-account sweep)

"external_transfer" (Transferencias externas) — money sent to or received from another person:
  • TRANSF INSTANTANEA ENVIADA/RECIBIDA + person name
  • TRANSFERENCIA ENVIADA/RECIBIDA + person name
  • DEBITO OPERACION EN BANCA DIGITAL + TRF. PLAZA- [person name]
  • Any description with NRR:[code] followed by a person name

Neither (use the correct category instead):
  • DEBITO OPERACION EN BANCA DIGITAL + utility/gov entity (UTE, IMM, ANTEL) → utilities or housing
  • TRANSFERENCIA RECIBIDA + company name ending in SRL/SA → income
  • CR. PAGO SUELDOS → always income
  • Named external merchant → appropriate expense category

CATEGORY HINTS (for ambiguous cases):
  • CR. PAGO SUELDOS → income · COMISION POR COSTO PRODUCTO → fees
  • DLO. or MercadoPago + restaurant name → delivery, not restaurants
  • Rideshare (Uber, Lyft, Lime) and local transport codes (Cpatu, Movil) → transport
  • Streaming/subscriptions (Spotify, Netflix, Apple, Disney) → entertainment
  • B2B SaaS/cloud (GitHub, Atlassian, Google Cloud, Cloudflare, Upwork) → check custom categories first
  • Debit card purchase at supermarket/grocery chain → groceries even if name is unfamiliar

confidence — 0.0–1.0: certainty about both displayDescription and category.
  1.0 = known brand with obvious category (Netflix, Uber, Spotify)
  0.8–0.95 = clear merchant, unambiguous category
  0.55–0.79 = recognized but category could be debated
  0.3–0.54 = partially decoded name or ambiguous context
  < 0.3 = truly uncertain

Respond ONLY with a JSON array. No explanation. No markdown fences.
FORMAT: [{"id":"<id>","displayDescription":"<name>","category":"<category>","confidence":<0.0-1.0>},...]`
}

const MATCH_TYPE_LABEL: Record<string, string> = {
  contains: 'contains',
  starts_with: 'starts with',
  exact: 'exact',
}

function buildUserMessage(
  inputs: AiEnrichmentInput[],
  context: AiCorrectionContext
): string {
  const parts: string[] = []

  if (context.customPatterns.length > 0) {
    parts.push('USER RULES (always apply these, they override all other patterns):')
    for (const p of context.customPatterns) {
      const matchLabel = MATCH_TYPE_LABEL[p.matchType] ?? p.matchType
      parts.push(`${matchLabel} "${p.pattern}" → ${p.category}`)
    }
    parts.push('')
  }

  const descExamples = context.descriptionExamples.slice(0, 20)
  const catExamples = context.categoryExamples.slice(0, 20)

  if (descExamples.length > 0 || catExamples.length > 0) {
    parts.push('USER CORRECTIONS (learn from these patterns):')
    for (const ex of descExamples) {
      const catPart = ex.category ? ` (${ex.category})` : ''
      parts.push(`Description: "${ex.raw}" → "${ex.friendly}"${catPart}`)
    }
    for (const ex of catExamples) {
      parts.push(`Category: "${ex.merchant}" → ${ex.category}`)
    }
    parts.push('')
  }

  parts.push('TRANSACTIONS:')
  parts.push(JSON.stringify(inputs))

  return parts.join('\n')
}

export function validateCategory(
  raw: string,
  customCategories: CustomCategory[]
): string {
  const normalized = raw.trim().toLowerCase()
  if ((Object.values(Category) as string[]).includes(normalized)) {
    return normalized
  }
  if (customCategories.some((c) => c.id === normalized)) {
    return normalized
  }
  return Category.Uncategorized
}

export function applyAiEnrichment(
  transactions: Transaction[],
  results: Map<string, AiEnrichmentResult>
): Transaction[] {
  return transactions.map((tx) => {
    const result = results.get(tx.id)
    if (!result) return tx
    return {
      ...tx,
      category: result.category,
      categoryConfidence: result.confidence,
      displayDescription: result.displayDescription,
    }
  })
}

export async function enrichTransactionsWithAi(
  inputs: AiEnrichmentInput[],
  config: AiConfig,
  context: AiCorrectionContext
): Promise<Map<string, AiEnrichmentResult>> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  })

  const systemPrompt = buildSystemPrompt(context.customCategories)
  const results = new Map<string, AiEnrichmentResult>()

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE)
    const userMessage = buildUserMessage(batch, context)

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const block = response.content[0]
    if (block.type !== 'text')
      throw new Error(
        `Respuesta inesperada del modelo (tipo: ${block.type})`
      )

    let parsed: Array<{ id: string; displayDescription: string; category: string; confidence?: number }>
    try {
      // Claude occasionally wraps output in markdown fences despite instructions
      const raw = block.text.trim()
      const jsonText = raw.startsWith('[')
        ? raw
        : (raw.match(/\[[\s\S]*\]/)?.[0] ?? raw)
      parsed = JSON.parse(jsonText) as typeof parsed
    } catch (e) {
      throw new Error(
        `No se pudo parsear la respuesta del modelo: ${e instanceof Error ? e.message : String(e)}`
      )
    }

    for (const item of parsed) {
      if (!item.id || typeof item.displayDescription !== 'string') continue
      const rawConfidence = typeof item.confidence === 'number' ? item.confidence : 0.7
      results.set(item.id, {
        id: item.id,
        category: validateCategory(item.category ?? '', context.customCategories),
        displayDescription: item.displayDescription.trim() || (inputs.find((t) => t.id === item.id)?.description ?? item.id),
        confidence: Math.min(1, Math.max(0, rawConfidence)),
      })
    }
  }

  return results
}
