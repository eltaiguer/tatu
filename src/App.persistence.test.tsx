import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Transaction } from './models'

const STORAGE_KEY = 'tatu:transactions'
const OriginalFileReader = globalThis.FileReader

class MockFileReader implements FileReader {
  static content = ''

  EMPTY = 0 as const
  LOADING = 1 as const
  DONE = 2 as const

  error: DOMException | null = null
  onabort: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null =
    null
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null =
    null
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null =
    null
  onloadend:
    | ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown)
    | null = null
  onloadstart:
    | ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown)
    | null = null
  onprogress:
    | ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown)
    | null = null
  readyState = this.DONE
  result: string | ArrayBuffer | null = null
  ontimeout:
    | ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown)
    | null = null

  abort(): void {}
  readAsArrayBuffer(): void {}
  readAsBinaryString(): void {}
  readAsDataURL(): void {}
  readAsText(): void {
    this.result = MockFileReader.content
    this.onload?.call(
      this,
      { target: this } as unknown as ProgressEvent<FileReader>
    )
    this.onloadend?.call(
      this,
      { target: this } as unknown as ProgressEvent<FileReader>
    )
  }
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true
  }
}

function makePersistedTransaction(id: string): Transaction {
  return {
    id,
    date: new Date('2026-01-01T00:00:00.000Z'),
    description: `tx ${id}`,
    amount: 123,
    currency: 'UYU',
    type: 'debit',
    source: 'bank_account',
    rawData: {},
  }
}

describe('App persistence flow', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    globalThis.FileReader = MockFileReader as unknown as typeof FileReader
  })

  afterEach(() => {
    globalThis.FileReader = OriginalFileReader
  })

  it('persists transactions to localStorage after CSV upload', async () => {
    const csv = readFileSync(
      join(process.cwd(), 'samples', 'UYUmovements.csv'),
      'utf-8'
    )
    MockFileReader.content = csv

    const { default: App } = await import('./App')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))
    const input = screen.getByLabelText('Seleccionar archivo')
    fireEvent.change(input, {
      target: {
        files: [new File([csv], 'UYUmovements.csv', { type: 'text/csv' })],
      },
    })

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Transacciones' })
      ).toBeInTheDocument()
    )

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()

    const parsed = JSON.parse(raw ?? '{}')
    expect(parsed.state.transactions.length).toBeGreaterThan(0)
  })

  it('rehydrates persisted transactions on fresh app load', async () => {
    const stored = {
      state: {
        transactions: [
          {
            ...makePersistedTransaction('tx-1'),
            date: '2026-01-01T00:00:00.000Z',
          },
          {
            ...makePersistedTransaction('tx-2'),
            date: '2026-01-02T00:00:00.000Z',
          },
        ],
      },
      version: 0,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))

    const { default: App } = await import('./App')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Transacciones' }))
    expect(screen.getByText('2 transacciones encontradas')).toBeInTheDocument()
    expect(screen.getAllByText('tx tx-1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('tx tx-2').length).toBeGreaterThan(0)
  })
})
