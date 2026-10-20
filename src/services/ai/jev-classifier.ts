/**
 * Category classification with Jev, TypeSafe's decision-only model, through
 * OpenRouter (the one route that answers browser CORS preflights; TypeSafe's
 * own API and SDK refuse the browser).
 *
 * Jev answers typed questions, it does not write: one Choice question per
 * transaction over the category ids, with the row in the shared state. It
 * returns the chosen id, a probability per option and a confidence derived
 * from how peaked the spread is — a calibrated number, unlike the figure a
 * generative model writes for itself. It cannot produce a display name, so
 * this covers the category half of `enrichTransactionsWithAi` only.
 *
 * Jev reads literally and is distracted by noise, so the merchant is cleaned
 * in code (`rawMerchantKey`) rather than asked for. Today it is used by the
 * [Dev] evaluation panel to measure agreement against the rules and Claude.
 */
import { Category, CATEGORY_LABELS } from '../../models'
import type { AiEnrichmentInput } from './transaction-ai'
import type { CustomCategory } from '../categories/category-store'
import { rawMerchantKey } from '../merchants/merchant-key'

export interface JevConfig {
  apiKey: string
  model: string
  /** OpenRouter by default; overridable for a gateway or tests. */
  baseUrl?: string
}

export interface JevPrediction {
  id: string
  category: string
  confidence: number
}

export interface JevOutcome {
  results: Map<string, JevPrediction>
  /** Set when some batches failed but others succeeded. */
  partialFailure?: string
}

export const OPENROUTER_SYSTEMONE_URL = 'https://openrouter.ai/api/v1/systemone'

/** Rows per call: each question sees the whole state, so keep it small. */
export const BATCH_SIZE = 10

const INSTRUCTIONS =
  'Which category does the transaction with this id belong to? ' +
  'The user is a person in Uruguay with a Santander credit card, a USD bank ' +
  'account and a UYU bank account. `description` is the raw statement line, ' +
  '`merchant` the same line with bank codes removed. Pick the category that ' +
  'best describes what the money was spent on or received for.'

const CATEGORY_HINTS: Partial<Record<Category, string>> = {
  [Category.InternalTransfer]:
    "Money moved between the user's own accounts: traspaso cta.combinada, pago electronico tarjeta credito (paying the card from the bank), compra/venta dolares",
  [Category.ExternalTransfer]:
    'Money sent to or received from another person (a transfer with a personal name)',
  [Category.Income]:
    'Salary or client payment received (cr. pago sueldos, a company name ending in SRL or SA)',
  [Category.Fees]: 'Bank fees and interest (comision, cargo, interes)',
  [Category.Groceries]:
    'Supermarkets and food shops (Disco, Devoto, Tienda Inglesa, Ta-Ta, Geant, carniceria, panaderia)',
  [Category.Restaurants]:
    'Restaurants, bars, cafes and food delivery (PedidosYa, Rappi, Uber Eats)',
  [Category.Transport]: 'Fuel, taxis, Uber, buses, parking, tolls',
  [Category.Utilities]: 'UTE (power), OSE (water), Antel (phone/internet), gas',
  [Category.Software]: 'Software, SaaS, cloud and developer services',
}

function criteria(customCategories: CustomCategory[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const category of Object.values(Category)) {
    if (category === Category.Uncategorized) continue
    const hint = CATEGORY_HINTS[category]
    out[category] = hint
      ? `${CATEGORY_LABELS[category]}: ${hint}`
      : CATEGORY_LABELS[category]
  }
  for (const custom of customCategories) {
    if (custom.isIgnored) continue
    out[custom.id] = custom.label
  }
  return out
}

interface ChoiceAnswer {
  type?: string
  choice?: string
  confidence?: number
}

async function classifyBatch(
  batch: AiEnrichmentInput[],
  config: JevConfig,
  options: Record<string, string>
): Promise<JevPrediction[]> {
  const questions = Object.fromEntries(
    batch.map((row) => [
      row.id,
      {
        type: 'choice',
        instructions: `${INSTRUCTIONS} Transaction id: ${row.id}.`,
        criteria: options,
      },
    ])
  )
  const state = {
    transactions: batch.map((row) => ({
      id: row.id,
      description: row.description,
      merchant: rawMerchantKey(row.description),
      type: row.type,
      amount: row.amount,
      currency: row.currency,
      source: row.source,
    })),
  }

  let response: Response
  try {
    response = await fetch(config.baseUrl ?? OPENROUTER_SYSTEMONE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: config.model, state, questions }),
    })
  } catch (error) {
    // A blocked preflight or no network surfaces as a bare TypeError.
    throw new Error(
      `No se pudo conectar con OpenRouter (${error instanceof Error ? error.message : String(error)}).`
    )
  }
  if (!response.ok) {
    // The body carries the reason (unknown model, bad shape); keep it.
    throw new JevHttpError(response.status, await response.text())
  }
  const payload = (await response.json()) as {
    answers?: Record<string, ChoiceAnswer>
  }

  const results: JevPrediction[] = []
  for (const row of batch) {
    const answer = payload.answers?.[row.id]
    if (!answer || typeof answer.choice !== 'string') continue
    // Own keys only (never a prototype name) and tolerant of case/spacing,
    // as validateCategory is for Claude.
    const choice = answer.choice.trim().toLowerCase()
    const category = Object.hasOwn(options, choice)
      ? choice
      : Category.Uncategorized
    const confidence =
      typeof answer.confidence === 'number'
        ? Math.min(1, Math.max(0, answer.confidence))
        : 0
    results.push({ id: row.id, category, confidence })
  }
  return results
}

class JevHttpError extends Error {
  constructor(
    readonly status: number,
    body: string
  ) {
    super(`Jev respondió ${status}: ${body.trim().slice(0, 300)}`)
  }
}

/** 401/403 mean the key is wrong; no later batch can do better. */
function isNonRetryable(error: unknown): boolean {
  return (
    error instanceof JevHttpError &&
    (error.status === 401 || error.status === 403)
  )
}

export async function classifyWithJev(
  inputs: AiEnrichmentInput[],
  config: JevConfig,
  customCategories: CustomCategory[]
): Promise<JevOutcome> {
  const options = criteria(customCategories)
  const results = new Map<string, JevPrediction>()
  const failures: string[] = []
  let batchCount = 0

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    batchCount += 1
    const batch = inputs.slice(i, i + BATCH_SIZE)
    try {
      for (const prediction of await classifyBatch(batch, config, options)) {
        results.set(prediction.id, prediction)
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
      if (isNonRetryable(error)) break
    }
  }

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
