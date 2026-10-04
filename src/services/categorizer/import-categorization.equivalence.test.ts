import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parseCSV } from '../parsers/csv-parser'

/**
 * Golden fixture: the category, confidence and display description every row
 * of the Santander samples gets at import (#64). Generated against the code
 * where the parsers still called the categorizer themselves, so moving that
 * call into the import pipeline must leave it unchanged.
 *
 * `id` and `date` are left out on purpose: they belong to the parser, not to
 * categorization, and other work (#57 dedup ids, #58 date parsing) may change
 * them. Row position in the sample identifies the row.
 *
 * An intentional categorizer change (e.g. a new merchant pattern) will fail
 * this test. Regenerate the fixture, review its diff, and commit it:
 *
 *   UPDATE_FIXTURE=1 npx vitest run src/services/categorizer/import-categorization.equivalence.test.ts
 */
const FIXTURE_PATH = join(
  __dirname,
  '__fixtures__',
  'sample-categorization.json'
)
const SAMPLES = [
  'CreditCardsMovementsDetail.csv',
  'USDmovements.csv',
  'UYUmovements.csv',
]

function importSample(fileName: string) {
  const csvContent = readFileSync(
    join(process.cwd(), 'samples', fileName),
    'utf-8'
  )
  return parseCSV(csvContent, fileName).transactions.map((tx) => ({
    description: tx.description,
    type: tx.type,
    category: tx.category ?? null,
    categoryConfidence: tx.categoryConfidence ?? null,
    displayDescription: tx.displayDescription ?? null,
  }))
}

describe('import categorization of the Santander samples', () => {
  const actual = Object.fromEntries(
    SAMPLES.map((fileName) => [fileName, importSample(fileName)])
  )

  if (process.env.UPDATE_FIXTURE === '1') {
    writeFileSync(FIXTURE_PATH, JSON.stringify(actual, null, 2) + '\n')
  }

  const expected = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'))

  it.each(SAMPLES)('matches the golden fixture for %s', (fileName) => {
    expect(actual[fileName].length).toBeGreaterThan(0)
    expect(actual[fileName]).toEqual(expected[fileName])
  })
})
