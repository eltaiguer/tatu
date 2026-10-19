// Seeds the LOCAL Supabase stack with samples/*.csv for the dev user (#135).
// Run by `npm run dev:backend` (scripts/dev-backend.mjs) through vite-node, so
// the app modules below get the same `import.meta.env` they get in the browser.
//
// It goes through the app's own code on purpose, the same steps ImportCSV
// runs: `decodeCsvBytes` (Latin-1 or UTF-8, #192), `parseCSV` (ids),
// `categorizeParsedData` (categories), content dedup (`classifyImport`, #57)
// and `persistTransactions` (row mapping), so seeded rows are exactly what an
// import in the UI would write — re-importing a sample in the app reports
// every row as a duplicate. Rows an older seed stored garbled (samples read as
// UTF-8) are repaired in place, like a re-import in the app does.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { Transaction } from '../src/models'
import { categorizeParsedData } from '../src/services/categorizer/import-categorization'
import { classifyImport } from '../src/services/dedup/import-dedup'
import { parseCSV } from '../src/services/parsers'
import { decodeCsvBytes } from '../src/services/parsers/decode-csv'
import {
  getSupabaseAnonKey,
  getSupabaseClient,
  getSupabaseUrl,
} from '../src/services/supabase/client'
import {
  findImportCandidates,
  persistTransactions,
  updateTransactionsByIds,
} from '../src/services/supabase/transactions'

const SEED_EMAIL = 'dev@tatu.local'
const SEED_PASSWORD = 'tatu-dev-password'
const SAMPLES_DIR = join(process.cwd(), 'samples')

function fail(message: string): never {
  console.error(`seed-local: ${message}`)
  process.exit(1)
}

async function ensureSeedUser(url: string, serviceRoleKey: string) {
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await admin.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
  })
  if (error && error.code !== 'email_exists') {
    fail(`could not create ${SEED_EMAIL}: ${error.message}`)
  }
  console.log(
    error ? `user ${SEED_EMAIL} already exists` : `created user ${SEED_EMAIL}`
  )
}

function parseSamples(): Transaction[] {
  const byId = new Map<string, Transaction>()
  const files = readdirSync(SAMPLES_DIR)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .sort()
  for (const name of files) {
    // Same two steps as ImportCSV: pure parse, then import categorization.
    const result = categorizeParsedData(
      parseCSV(decodeCsvBytes(readFileSync(join(SAMPLES_DIR, name))), name)
    )
    console.log(
      `parsed ${name}: ${result.transactions.length} rows (${result.fileType})`
    )
    // Same id twice = the same movement; the import flow keeps the first.
    for (const tx of result.transactions) {
      if (!byId.has(tx.id)) byId.set(tx.id, tx)
    }
  }
  return Array.from(byId.values())
}

async function main() {
  const url = getSupabaseUrl()
  // Never seed anything but the local stack.
  const { hostname } = new URL(url)
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    fail(`refusing to seed non-local Supabase at ${url}`)
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set')
  getSupabaseAnonKey() // fail fast if the publishable key is missing

  await ensureSeedUser(url, serviceRoleKey)

  const client = getSupabaseClient()
  const { data, error } = await client.auth.signInWithPassword({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
  })
  if (error || !data.session) {
    fail(`sign-in as ${SEED_EMAIL} failed: ${error?.message ?? 'no session'}`)
  }
  const session = data.session

  // Like an import: rows already on the server (active or deleted) are left
  // alone, so re-running never duplicates data or undoes local edits.
  const transactions = parseSamples()
  const { added, repaired } = classifyImport(
    transactions,
    await findImportCandidates(session, transactions)
  )
  await persistTransactions(session, added)
  for (const tx of repaired) {
    await updateTransactionsByIds(session, [tx.id], {
      description: tx.description,
      rawData: tx.rawData,
    })
  }

  const { count, error: countError } = await client
    .from('transactions')
    .select('transaction_id', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
  if (countError) fail(`count failed: ${countError.message}`)

  console.log(
    `inserted ${added.length} new transactions, repaired ${repaired.length} ` +
      `(${transactions.length - added.length} already present); ` +
      `${SEED_EMAIL} now has ${count} rows`
  )
  await client.auth.signOut()
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
