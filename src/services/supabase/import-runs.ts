import { getSupabaseClient, type SupabaseSession } from './client'

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
  session: SupabaseSession,
  input: CreateImportRunInput
): Promise<string> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('import_runs')
    .insert({
      user_id: session.user.id,
      file_name: input.fileName,
      file_type: input.fileType,
      file_checksum: input.fileChecksum,
      status: 'processing',
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  if (!data?.id) {
    throw new Error('No se pudo crear el registro de importación')
  }

  return data.id as string
}

export async function completeImportRun(
  session: SupabaseSession,
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
    .eq('user_id', session.user.id)
    .eq('id', importId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function failImportRun(
  session: SupabaseSession,
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
    .eq('user_id', session.user.id)
    .eq('id', importId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const bytes = new Uint8Array(digest)
    return Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }

  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }
  return `fallback-${Math.abs(hash)}`
}
