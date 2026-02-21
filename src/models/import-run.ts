import type { FileType } from './parsed-data'

export type ImportRunStatus = 'processing' | 'completed' | 'failed'

export interface ImportRun {
  id: string
  fileName: string
  fileType: FileType
  fileChecksum: string
  status: ImportRunStatus
  totalRows: number
  insertedRows: number
  duplicateRows: number
  errorMessage?: string
  startedAt: string
  finishedAt?: string
  createdAt: string
}
