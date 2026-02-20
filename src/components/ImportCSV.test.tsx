import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportCSV } from './ImportCSV';
import type { ParsedData, Transaction } from '../models';
import { transactionStore } from '../stores/transaction-store';
import { parseCSV } from '../services/parsers/csv-parser';

vi.mock('../services/parsers/csv-parser', () => ({
  parseCSV: vi.fn(),
}));

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? 'tx-id',
    date: overrides.date ?? new Date('2026-02-20T12:00:00.000Z'),
    description: overrides.description ?? 'Test tx',
    amount: overrides.amount ?? 100,
    currency: overrides.currency ?? 'UYU',
    type: overrides.type ?? 'debit',
    source: overrides.source ?? 'bank_account',
    rawData: overrides.rawData ?? {},
    category: overrides.category,
    categoryConfidence: overrides.categoryConfidence,
    balance: overrides.balance,
  };
}

function makeParsedData(transactions: Transaction[]): ParsedData {
  return {
    fileType: 'bank_account_uyu',
    transactions,
    metadata: {
      cliente: 'Jose',
      cuenta: 'Caja de ahorro',
      numero: '123',
      moneda: 'UYU',
      sucursal: 'Montevideo',
      periodoDesde: '01/02/2026',
      periodoHasta: '20/02/2026',
    },
    fileName: 'movimientos.csv',
    parsedAt: new Date('2026-02-20T12:00:00.000Z'),
  };
}

describe('ImportCSV', () => {
  beforeEach(() => {
    transactionStore.getState().clearTransactions();
    vi.clearAllMocks();
  });

  it('processes parsed transactions into the persisted store', async () => {
    const user = userEvent.setup();
    const mockedParseCSV = vi.mocked(parseCSV);

    mockedParseCSV.mockReturnValueOnce(
      makeParsedData([
        makeTransaction({ id: 'a1', description: 'UBER', amount: 150 }),
        makeTransaction({ id: 'a2', description: 'DEVOTO', amount: 220 }),
      ])
    );

    const { container } = render(<ImportCSV />);
    const input = container.querySelector('#file-upload') as HTMLInputElement;

    await act(async () => {
      await user.upload(input, new File(['csv-content'], 'movimientos.csv', { type: 'text/csv' }));
    });

    expect(await screen.findByText('Archivo validado correctamente')).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Procesar 2 transacciones' }));
    });

    expect(transactionStore.getState().transactions).toHaveLength(2);
    expect(screen.getByText('Se agregaron 2 transacciones')).toBeInTheDocument();
  });

  it('reports duplicates when processing already-imported transactions', async () => {
    const user = userEvent.setup();
    const mockedParseCSV = vi.mocked(parseCSV);

    transactionStore.getState().setTransactions([
      makeTransaction({ id: 'dupe', description: 'EXISTING', amount: 80 }),
    ]);

    mockedParseCSV.mockReturnValueOnce(
      makeParsedData([
        makeTransaction({ id: 'dupe', description: 'EXISTING', amount: 80 }),
        makeTransaction({ id: 'new', description: 'NUEVA', amount: 120 }),
      ])
    );

    const { container } = render(<ImportCSV />);
    const input = container.querySelector('#file-upload') as HTMLInputElement;

    await act(async () => {
      await user.upload(input, new File(['csv-content'], 'movimientos.csv', { type: 'text/csv' }));
    });
    await screen.findByText('Archivo validado correctamente');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Procesar 2 transacciones' }));
    });

    expect(transactionStore.getState().transactions).toHaveLength(2);
    expect(
      screen.getByText('Se agregaron 1 transacciones (1 duplicadas omitidas)')
    ).toBeInTheDocument();
  });

  it('shows parsing error when csv format is invalid', async () => {
    const user = userEvent.setup();
    const mockedParseCSV = vi.mocked(parseCSV);

    mockedParseCSV.mockImplementationOnce(() => {
      throw new Error('Formato no soportado');
    });

    const { container } = render(<ImportCSV />);
    const input = container.querySelector('#file-upload') as HTMLInputElement;

    await act(async () => {
      await user.upload(input, new File(['bad'], 'movimientos.csv', { type: 'text/csv' }));
    });

    expect(await screen.findByText('Error al validar archivo')).toBeInTheDocument();
    expect(screen.getByText('Formato no soportado')).toBeInTheDocument();
    expect(transactionStore.getState().transactions).toHaveLength(0);
  });
});
