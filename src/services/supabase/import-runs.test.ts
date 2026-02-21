import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseSession } from './client'

const {
  insertMock,
  selectMock,
  singleMock,
  updateMock,
  eqMock,
  eqIdMock,
  fromMock,
} = vi.hoisted(() => ({
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  eqIdMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('./client', () => ({
  getSupabaseClient: () => ({ from: fromMock }),
}))

const session: SupabaseSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  user: { id: 'user-1', email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
}

describe('supabase import runs service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    singleMock.mockResolvedValue({ data: { id: 'run-1' }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    insertMock.mockReturnValue({ select: selectMock })

    eqIdMock.mockResolvedValue({ error: null })
    eqMock.mockReturnValue({ eq: eqIdMock })
    updateMock.mockReturnValue({ eq: eqMock })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'import_runs') {
        throw new Error('unexpected table')
      }
      return { insert: insertMock, update: updateMock }
    })
  })

  it('creates an import run in processing state', async () => {
    const { createImportRun } = await import('./import-runs')
    const id = await createImportRun(session, {
      fileName: 'movements.csv',
      fileType: 'bank_account_uyu',
      fileChecksum: 'abc123',
    })

    expect(id).toBe('run-1')
    expect(insertMock).toHaveBeenCalledTimes(1)
  })

  it('completes an import run with counters', async () => {
    const { completeImportRun } = await import('./import-runs')
    await completeImportRun(session, 'run-1', {
      totalRows: 10,
      insertedRows: 8,
      duplicateRows: 2,
    })

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        total_rows: 10,
      })
    )
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqIdMock).toHaveBeenCalledWith('id', 'run-1')
  })

  it('marks import run as failed', async () => {
    const { failImportRun } = await import('./import-runs')
    await failImportRun(session, 'run-1', 'bad csv')

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'bad csv',
      })
    )
  })
})
