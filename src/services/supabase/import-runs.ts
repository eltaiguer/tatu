import { getSupabaseClient } from './client'
import { UserFacingError } from '../../utils/user-error'

const IMPORT_RUN_FAILED = 'No se pudo iniciar la importación. Intentá de nuevo.'

type ImportRunFileType = 'credit_card' | 'bank_account_usd' | 'bank_account_uyu'

interface CreateImportRunInput {
  fileName: string
  fileType: ImportRunFileType
  fileChecksum: string
}

interface CompleteImportRunInput {
  totalRows: number
  insertedRows: number
  duplicateRows: number
}

export async function createImportRun(
  userId: string,
  input: CreateImportRunInput
): Promise<string> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('import_runs')
    .insert({
      user_id: userId,
      file_name: input.fileName,
      file_type: input.fileType,
      file_checksum: input.fileChecksum,
      status: 'processing',
    })
    .select('id')
    .single()

  if (error) {
    console.error('createImportRun failed:', error.message)
    throw new UserFacingError(IMPORT_RUN_FAILED, { cause: error })
  }

  if (!data?.id) {
    throw new UserFacingError(IMPORT_RUN_FAILED, {
      cause: new Error('createImportRun returned no id'),
    })
  }

  return data.id as string
}

export async function completeImportRun(
  userId: string,
  importId: string,
  stats: CompleteImportRunInput
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('import_runs')
    .update({
      status: 'completed',
      total_rows: stats.totalRows,
      inserted_rows: stats.insertedRows,
      duplicate_rows: stats.duplicateRows,
      finished_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', importId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function failImportRun(
  userId: string,
  importId: string,
  errorMessage: string
): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('import_runs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', importId)

  if (error) {
    throw new Error(error.message)
  }
}
