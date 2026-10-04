import type { Transaction } from '../../models'
import { getUserRename } from '../../utils/transaction-display'

// THE merchant key (#120): what Resumen's "Mayores comercios", its
// drill-through to Transacciones, Insights' topMerchants and recurring-charge
// detection all group by, so the same rows form the same merchant everywhere.
// A merchant-naming change lands here and nowhere else.
//
// - Renamed rows (displayDescription or a live description override) key on
//   the rename, folded but never stripped: the user's name is intentional.
// - Otherwise the raw Santander description minus its per-transaction noise.
//
// Not pure in `tx` alone: live description overrides are read from the
// description-overrides module (same as getDisplayDescription).

const DIACRITICS = /[̀-ͯ]/g

// Lowercase, accent-free, `*` as a separator ("MERPAGO*FOO" = "Merpago Foo"),
// single spaces.
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// What is left when everything meaningful was noise: a payment processor or a
// bank concept that prefixes many different counterparties. Keying on it
// would merge every merchant behind it, so the digits are kept instead.
const GENERIC_KEYS = new Set([
  'mp',
  'merpago',
  'mercadopago',
  'mercado pago',
  'paypal',
  'dlo',
  'dlocal',
  'sp',
  'sq',
  'tst',
  'compra con tarjeta debito',
  'debito operacion en supernet o sms',
  'debito operacion en supernet o sms trf. plaza',
  'credito por operacion en supernet',
  'transf instantanea enviada',
  'transf instantanea recibida',
  'transferencia enviada',
  'transferencia enviada trf. plaza',
  'transferencia recibida',
  'transferencia recibida recibida',
])

// A lone word this short after dropping codes ("AB 1234") is too thin to
// tell merchants apart — unless it is a known short merchant.
const MIN_SINGLE_WORD_KEY = 4

// Short names that are a merchant on their own (Uruguayan utilities and
// agencies, chains), so "UTE 20251106" and "UTE 20251206" are one merchant.
const KNOWN_SHORT_MERCHANTS = new Set([
  'ute',
  'ose',
  'bps',
  'dgi',
  'bse',
  'bhu',
  'imm',
  'stm',
  'kfc',
  'tcc',
  'cot',
  'cut',
])

// Uruguayan places a statement appends as ", PLACE" without a card mask
// (folded). Elsewhere a comma segment may be part of a name — a transfer's
// "SURNAME, FIRST NAME" — so it is only stripped for these or in the
// debit-card shape ("…, CITY TARJ: ####1234"). Places that are also common
// first names or surnames (Mercedes, Dolores, Florida, Rocha, Rivera,
// Artigas, Melo, Young, Trinidad) are left out: only the card shape strips
// them.
const KNOWN_PLACES = new Set([
  'montevideo',
  'punta del este',
  'maldonado',
  'canelones',
  'ciudad de la costa',
  'las piedras',
  'pando',
  'la paz',
  'colonia',
  'colonia del sacramento',
  'carmelo',
  'nueva helvecia',
  'salto',
  'paysandu',
  'tacuarembo',
  'fray bentos',
  'minas',
  'la paloma',
  'chuy',
  'durazno',
  'san jose',
  'san jose de mayo',
  'treinta y tres',
  'piriapolis',
  'atlantida',
  'la barra',
  'jose ignacio',
  'carrasco',
])

// A trailing ", MONTEVIDEO": letters after the last comma (or nothing).
const TRAILING_PLACE = /,\s*([a-z][a-z .'-]*)?$/
const MAX_PLACE_WORDS = 3

// Transfers and Supernet operations end in a person's name, never a city.
const TRANSFER_SHAPE =
  /^(?:transf|transferencia|credito por operacion|debito operacion|cr\. pago)\b/

function stripTrailingPlace(
  text: string,
  cardPurchase: boolean,
  transfer: boolean
): string {
  const match = TRAILING_PLACE.exec(text)
  if (!match) return text
  const place = (match[1] ?? '').trim()
  const strip =
    place === '' ||
    (!transfer && KNOWN_PLACES.has(place)) ||
    (cardPurchase && place.split(' ').length <= MAX_PLACE_WORDS)
  return strip ? text.slice(0, match.index) : text
}

const EDGE_PUNCTUATION = /^[\s,.;:/-]+|[\s,.;:/-]+$/g

// Drops NRR references, the card mask and a trailing ", PLACE"; with
// `dropDigits`, also every token containing a digit — except numbers after
// "NRO", which tell payees apart ("NRO FAMILIA 5506").
function denoise(folded: string, dropDigits: boolean): string {
  const cardPurchase = /\btarj:/.test(folded)
  let afterNro = false
  const tokens = folded
    .replace(/\bnrr:\S*/g, ' ')
    .replace(/\btarj:\s*\S*/g, ' ')
    // Commas stand alone, so dropping "7SEVEN," keeps the ", CITY" boundary.
    .replace(/,/g, ' , ')
    .split(/\s+/)
    .filter((token) => {
      if (token === '') return false
      if (token === 'nro') afterNro = true
      return !dropDigits || afterNro || !/\d/.test(token)
    })
  return stripTrailingPlace(
    tokens.join(' ').replace(/ ,/g, ',').replace(EDGE_PUNCTUATION, ''),
    cardPurchase,
    TRANSFER_SHAPE.test(folded)
  )
    .replace(EDGE_PUNCTUATION, '')
    .replace(/\s+/g, ' ')
}

// Whether dropping codes left too little to key on: nothing, a bare
// processor/bank prefix, or one short word.
function tooGeneric(key: string): boolean {
  return (
    key === '' ||
    GENERIC_KEYS.has(key) ||
    (!key.includes(' ') &&
      key.length < MIN_SINGLE_WORD_KEY &&
      !KNOWN_SHORT_MERCHANTS.has(key))
  )
}

// The key of an un-renamed description: drops tokens with digits (auth and
// reference codes, installment counters "Cuota 09 10", branch numbers),
// `NRR:…` references, the `TARJ: ####1234` card mask and a trailing
// ", CITY"; folds case, accents and whitespace. When that leaves too little
// to tell merchants apart, the digits stay (still without NRR, mask, city).
export function rawMerchantKey(description: string): string {
  const folded = fold(description)
  const stripped = denoise(folded, true)
  const withDigits = denoise(folded, false)
  if (stripped === withDigits || !tooGeneric(stripped)) return stripped
  return withDigits || folded
}

export function merchantKeyOf(tx: Transaction): string {
  const rename = getUserRename(tx)
  if (rename) return fold(rename)
  // A split part is prefilled with the parent's bank description, so it goes
  // through the same stripping as its unsplit siblings; a user-typed part
  // rarely has codes to strip.
  return rawMerchantKey(tx.description)
}

function newestFirst(a: Transaction, b: Transaction): number {
  return b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id)
}

// The friendliest name for a group of rows sharing a key: the most recent
// rename, else the most common raw description. Ties go to the most recent
// row, so the label does not depend on input order (it feeds InsightInput,
// whose hash decides whether cached insights are stale).
export function merchantLabelFor(rows: Transaction[]): string {
  const byRecency = [...rows].sort(newestFirst)
  for (const tx of byRecency) {
    const rename = getUserRename(tx)
    if (rename) return rename
  }

  const counts = new Map<string, number>()
  for (const tx of byRecency) {
    const name = tx.description.trim()
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  let label = ''
  let best = 0
  // byRecency order + strict > keeps the most recent variant on ties.
  for (const [name, count] of counts) {
    if (count > best) {
      label = name
      best = count
    }
  }
  return label
}

export interface MerchantGroup {
  key: string
  label: string
  transactions: Transaction[]
}

// Groups rows by merchant key, in order of each key's first row.
export function groupByMerchant(rows: Transaction[]): MerchantGroup[] {
  const byKey = new Map<string, Transaction[]>()
  for (const tx of rows) {
    const key = merchantKeyOf(tx)
    const list = byKey.get(key)
    if (list) list.push(tx)
    else byKey.set(key, [tx])
  }
  return Array.from(byKey, ([key, transactions]) => ({
    key,
    label: merchantLabelFor(transactions),
    transactions,
  }))
}
