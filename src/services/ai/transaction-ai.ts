import { Category, CATEGORY_LABELS } from '../../models'
import type { Transaction } from '../../models'
import type { CustomCategory } from '../categories/category-store'
import type { CustomPattern } from '../categorizer/custom-patterns'
import type { AiConfig } from './ai-config'
import { firstTextBlock, type ClaudeResponseLike } from './text-block'
import { resolveBuiltinAlias } from '../categories/category-aliases'

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
  descriptionExamples: Array<{
    raw: string
    friendly: string
    category?: string
  }>
  categoryExamples: Array<{ merchant: string; category: string }>
  customCategories: CustomCategory[]
  customPatterns: CustomPattern[]
}

// Each result object cost roughly 45-60 output tokens on Haiku 4.5, so a
// 150-row batch needed ~8,250 and overflowed the previous 8192 cap. The 5.5
// tokenizer counts about 30% more (~11,000 per batch), and the low-effort
// thinking the model does before answering is billed against the same cap,
// so 16,000 is the budget with the headroom that leaves — re-measure
// `usage.output_tokens` before raising the batch size.
const MAX_OUTPUT_TOKENS = 16000
/** Rows per request; exported so the dev panels can say how many calls a run is. */
export const BATCH_SIZE = 150

// Confidence 1 means "the user said so" everywhere (edits, bulk categorize,
// the evaluation labels); the model's own 1.0 is capped just below it.
const MAX_AI_CONFIDENCE = 0.99

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
    parts.push(
      'USER RULES (always apply these, they override all other patterns):'
    )
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
  // Pre-rename ids ("food", "transfer") still appear in the model's output;
  // they resolve to the current built-in, as everywhere else.
  const normalized = resolveBuiltinAlias(raw.trim().toLowerCase())
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

type AiEnrichmentBatchResponse = ClaudeResponseLike

/** Parses one batch response into results, or throws a diagnosable error. */
function parseBatchResponse(
  response: AiEnrichmentBatchResponse,
  inputs: AiEnrichmentInput[],
  context: AiCorrectionContext
): AiEnrichmentResult[] {
  // A response cut off at max_tokens leaves invalid JSON behind. Saying so
  // beats letting JSON.parse fail on the fragment with an opaque message.
  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      'La respuesta del modelo quedó truncada (límite de tokens alcanzado). ' +
        'Probá importar menos transacciones a la vez.'
    )
  }

  const text = firstTextBlock(response)

  let parsed: Array<{
    id: string
    displayDescription: string
    category: string
    confidence?: number
  }>
  try {
    // Claude occasionally wraps output in markdown fences despite instructions
    const raw = text.trim()
    const jsonText = raw.startsWith('[')
      ? raw
      : (raw.match(/\[[\s\S]*\]/)?.[0] ?? raw)
    parsed = JSON.parse(jsonText) as typeof parsed
  } catch (e) {
    throw new Error(
      `No se pudo parsear la respuesta del modelo: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  const results: AiEnrichmentResult[] = []
  for (const item of parsed) {
    if (!item.id || typeof item.displayDescription !== 'string') continue
    const rawConfidence =
      typeof item.confidence === 'number' ? item.confidence : 0.7
    results.push({
      id: item.id,
      category: validateCategory(item.category ?? '', context.customCategories),
      displayDescription:
        item.displayDescription.trim() ||
        (inputs.find((t) => t.id === item.id)?.description ?? item.id),
      confidence: Math.min(MAX_AI_CONFIDENCE, Math.max(0, rawConfidence)),
    })
  }
  return results
}

/** 401/403 mean the credential is wrong; retrying cannot help. */
function isNonRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status
  return status === 401 || status === 403
}

export interface AiEnrichmentOutcome {
  results: Map<string, AiEnrichmentResult>
  /**
   * Set when some batches failed but others succeeded. The successful results
   * are still returned — a single bad batch must not discard a whole import's
   * worth of enrichment.
   */
  partialFailure?: string
}

export async function enrichTransactionsWithAi(
  inputs: AiEnrichmentInput[],
  config: AiConfig,
  context: AiCorrectionContext
): Promise<AiEnrichmentOutcome> {
  // Loaded on demand so the SDK stays out of the startup bundle (#62).
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: config.apiKey,
    dangerouslyAllowBrowser: true,
  })

  // Identical across every batch (it depends only on customCategories), which
  // makes it a stable cache prefix. Volatile per-batch data lives in the user
  // message, after this breakpoint.
  //
  // At ~1,200 tokens this prompt clears the minimum cacheable prefix of the
  // 5.5 models (512 tokens); it was below Haiku 4.5's 4,096, where the
  // breakpoint was silently inert. Verify with usage.cache_read_input_tokens
  // before claiming a saving.
  const systemPrompt = [
    {
      type: 'text' as const,
      text: buildSystemPrompt(context.customCategories),
      cache_control: { type: 'ephemeral' as const },
    },
  ]

  const results = new Map<string, AiEnrichmentResult>()
  const failures: string[] = []
  let batchCount = 0

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    batchCount += 1
    const batch = inputs.slice(i, i + BATCH_SIZE)

    try {
      // The 5.5 models think by default and the thinking counts against
      // max_tokens; this is classification, so the lowest effort keeps the
      // output budget for the JSON.
      const response = (await client.messages.create({
        model: config.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: 'low' },
        system: systemPrompt,
        messages: [{ role: 'user', content: buildUserMessage(batch, context) }],
      })) as AiEnrichmentBatchResponse

      for (const result of parseBatchResponse(response, inputs, context)) {
        results.set(result.id, result)
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))

      // Batch isolation is for transient faults. A bad key or revoked
      // permission fails identically for every remaining batch, so carrying
      // on would fire one doomed request per batch — 20 of them on a
      // 3,000-row import — before the user sees the same message. The SDK
      // does not retry these either.
      if (isNonRetryable(error)) {
        break
      }
    }
  }

  // Every batch failed — this is a hard failure, not a partial one.
  if (failures.length > 0 && failures.length === batchCount) {
    throw new Error(failures[0])
  }

  return {
    results,
    partialFailure:
      failures.length > 0
        ? `${failures.length} de ${batchCount} lotes fallaron: ${failures[0]}`
        : undefined,
  }
}
