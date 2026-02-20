import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Category } from '../../models';
import { parseCSV } from './csv-parser';

function parseSample(fileName: string) {
  const samplePath = join(process.cwd(), 'samples', fileName);
  const csvContent = readFileSync(samplePath, 'utf-8');
  return parseCSV(csvContent, fileName);
}

function categorizationRate(categories: string[]): number {
  const categorized = categories.filter((category) => category !== Category.Uncategorized);
  return categories.length > 0 ? categorized.length / categories.length : 0;
}

describe('CSV categorization coverage', () => {
  it('maintains minimum categorization ratio for credit card sample', () => {
    const result = parseSample('CreditCardsMovementsDetail.csv');
    const rate = categorizationRate(result.transactions.map((tx) => tx.category || Category.Uncategorized));

    expect(result.transactions.length).toBeGreaterThan(0);
    expect(rate).toBeGreaterThanOrEqual(0.6);
  });

  it('maintains minimum categorization ratio for USD bank sample', () => {
    const result = parseSample('USDmovements.csv');
    const rate = categorizationRate(result.transactions.map((tx) => tx.category || Category.Uncategorized));

    expect(result.transactions.length).toBeGreaterThan(0);
    expect(rate).toBeGreaterThanOrEqual(0.6);
  });

  it('maintains minimum categorization ratio for UYU bank sample', () => {
    const result = parseSample('UYUmovements.csv');
    const rate = categorizationRate(result.transactions.map((tx) => tx.category || Category.Uncategorized));

    expect(result.transactions.length).toBeGreaterThan(0);
    expect(rate).toBeGreaterThanOrEqual(0.6);
  });

  it('keeps strong overall categorization across all Santander samples', () => {
    const all = [
      ...parseSample('CreditCardsMovementsDetail.csv').transactions,
      ...parseSample('USDmovements.csv').transactions,
      ...parseSample('UYUmovements.csv').transactions,
    ];

    const rate = categorizationRate(all.map((tx) => tx.category || Category.Uncategorized));
    expect(all.length).toBeGreaterThan(0);
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });
});
