// CSV Import - Drag and drop file upload with validation

import { Card } from './ui/card'
import { Button } from './ui/button'
import { Upload, FileText, CircleAlert, Loader } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  importAiErrorMessage,
  StatementReadError,
  userErrorMessage,
  WorkspaceChangedError,
} from '../utils/user-error'
import type { Transaction, TransactionsFilter } from '../models'
import type {
  ImportStatementOptions,
  StatementFile,
  StatementImportResult,
} from '../services/import/import-statement'
import { ACCOUNT_LABELS } from '../utils/account-display'
import {
  ImportSummaryPanel,
  type FileOutcome,
  type ImportSummary,
} from './import/ImportSummaryPanel'

// validating = reading/parsing the file; importing = the file is valid and
// its rows are being saved.
type ImportState = 'idle' | 'validating' | 'importing' | 'success' | 'error'

// The part of an import's result the dialog reads. Type-only imports: the
// dialog has no runtime dependency on the import service, and a test double
// only has to supply these fields.
export type ImportOutcome = Pick<
  StatementImportResult,
  | 'added'
  | 'duplicates'
  | 'previouslyDeleted'
  | 'repaired'
  | 'repairsFailed'
  | 'aiError'
  | 'aiPartial'
  | 'fileType'
  | 'month'
  | 'fileRange'
  | 'fileRows'
>

interface ImportCSVProps {
  /**
   * The signed-in user's rows: the summary counts what is left to review in
   * them, live, never in the import's own result (#275).
   */
  transactions: Transaction[]
  /** "Ver transacciones" on the summary; the import itself never navigates. */
  onViewTransactions?: (filter: TransactionsFilter) => void
  /**
   * Imports the picked file (`importStatement`, bound to the signed-in user).
   * A file it could not read rejects with a `StatementReadError`; any other
   * rejection is a failure to save. `onParsed` is progress only.
   */
  onTransactionsImported: (
    file: StatementFile,
    options: ImportStatementOptions
  ) => Promise<ImportOutcome>
}

const READ_FAILED = 'Error al leer el archivo'

// Bytes, not text: the encoding is decided by the import (#192), since
// Santander exports are Latin-1 and File.text() would read them as UTF-8.
async function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    try {
      return await file.arrayBuffer()
    } catch (error) {
      // e.g. NotReadableError: the file moved or lost permission.
      throw new StatementReadError(READ_FAILED, { cause: error })
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // Not `instanceof ArrayBuffer`: the reader's buffer may come from
      // another realm (jsdom).
      const result = reader.result
      if (result && typeof result !== 'string') resolve(result)
      else reject(new StatementReadError(READ_FAILED))
    }
    reader.onerror = () => reject(new StatementReadError(READ_FAILED))
    reader.readAsArrayBuffer(file)
  })
}

type ImportedResult = ImportOutcome & { fileName: string }

// "a, b y c"
function listNames(names: string[]): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// The warnings of a batch (repairs, AI), said once for all of it. With one
// file picked they read exactly as they always did; with several they name
// the files, since "se usaron las reglas" is not true of the ones that
// were enriched.
function warnAboutBatch(done: ImportedResult[], picked: number) {
  const repairsFailed = done.reduce((n, d) => n + (d.repairsFailed ?? 0), 0)
  if (repairsFailed > 0) {
    toast.warning(
      `No se ${repairsFailed === 1 ? 'pudo' : 'pudieron'} corregir ${repairsFailed} descripci${repairsFailed === 1 ? 'ón' : 'ones'}. Importá el archivo de nuevo para reintentar.`
    )
  }

  // The import succeeded, but the AI step did not — say so, otherwise a
  // dead API key looks identical to poor categorization. Total failure
  // and partial failure need different wording: telling the user "no
  // disponible" when 10 of 12 batches did enrich is simply wrong.
  const failed = done.filter((d) => d.aiError !== undefined)
  const partial = done.filter((d) => d.aiError === undefined && d.aiPartial)
  const parts: string[] = []
  if (failed.length > 0) {
    const reason = importAiErrorMessage(failed[0].aiError)
    parts.push(
      picked === 1 || failed.length === done.length
        ? `Categorización con IA no disponible: ${reason}. Se usaron las reglas de categorización.`
        : `Categorización con IA no disponible en ${listNames(failed.map((d) => d.fileName))}: ${reason}. En ${failed.length === 1 ? 'ese archivo' : 'esos archivos'} se usaron las reglas de categorización.`
    )
  }
  if (partial.length > 0) {
    parts.push(
      picked === 1
        ? `Categorización con IA incompleta: ${partial[0].aiPartial}. El resto se categorizó con reglas.`
        : `Categorización con IA incompleta en ${listNames(partial.map((d) => `${d.fileName} (${d.aiPartial})`))}. El resto se categorizó con reglas.`
    )
  }
  if (parts.length > 0) toast.warning(parts.join(' '))
}

interface ImportedFile {
  outcome: FileOutcome
  /** Set when the file imported. */
  result?: ImportOutcome
  /** The signed-in user changed under the import: the batch stops. */
  workspaceChanged?: boolean
}

function summarize(result: ImportOutcome): ImportSummary {
  return {
    added: result.added.length,
    duplicates: result.duplicates.length,
    previouslyDeleted: result.previouslyDeleted.length,
    repaired: result.repaired.length,
    fileType: result.fileType,
    month: result.month,
    fileRange: result.fileRange,
    fileRows: result.fileRows,
    addedIds: new Set(result.added.map((row) => row.id)),
  }
}

function isCsv(file: File): boolean {
  return file.name.toLowerCase().endsWith('.csv')
}

function failure(file: File, title: string, error: unknown): ImportedFile {
  const unreadable = error === undefined || error instanceof StatementReadError
  return {
    workspaceChanged: error instanceof WorkspaceChangedError,
    outcome: {
      kind: 'failed',
      fileName: file.name,
      title,
      message:
        error === undefined
          ? 'El archivo debe estar en formato CSV'
          : userErrorMessage(
              error,
              'No se pudo guardar la importación',
              // Reported once, by userErrorMessage. A parse crash may mean
              // Santander changed its export format.
              unreadable ? 'import-parse' : 'import'
            ),
    },
  }
}

export function ImportCSV({
  transactions,
  onViewTransactions,
  onTransactionsImported,
}: ImportCSVProps) {
  const [importState, setImportState] = useState<ImportState>('idle')
  const [dragActive, setDragActive] = useState(false)
  // The file being imported, and its place in the batch.
  const [fileName, setFileName] = useState<string>('')
  const [progress, setProgress] = useState<{ index: number; total: number }>({
    index: 1,
    total: 1,
  })
  // What each picked file came to, in pick order.
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([])
  // The real file input stays hidden; a real button opens it, so the picker
  // is reachable by Tab and Enter/Space (a <label> is not focusable, #193).
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Button takes no ref (React 18 function component); its drop zone does.
  const pickerRef = useRef<HTMLDivElement>(null)
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null)
  // Set by "Importar otro archivo", so focus goes back to the picker.
  const focusPickerRef = useRef(false)
  // Set when the dialog closes (or the user signs out) mid-batch: the file in
  // flight finishes, the rest are never started and nothing more is shown.
  const cancelledRef = useRef(false)
  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [])

  // The import replaces what had focus (the picker) with the summary; move
  // focus to its heading so it is announced and Tab starts from there.
  useEffect(() => {
    if (importState === 'success') {
      summaryHeadingRef.current?.focus()
    } else if (importState === 'idle' && focusPickerRef.current) {
      focusPickerRef.current = false
      pickerRef.current?.querySelector('button')?.focus()
    }
  }, [importState])

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      void handleFiles(Array.from(e.dataTransfer.files))
    }
  }

  // Imports one file. Never rejects: a failure is the outcome.
  const importOne = async (file: File): Promise<ImportedFile> => {
    try {
      const bytes = await readFileBytes(file)
      const result = await onTransactionsImported(
        { bytes, fileName: file.name },
        {
          onParsed: () => {
            if (!cancelledRef.current) setImportState('importing')
          },
        }
      )
      return {
        outcome: {
          kind: 'imported',
          fileName: file.name,
          summary: summarize(result),
        },
        result,
      }
    } catch (error) {
      console.error('import failed:', error)
      // A file that could not be read says why (its message is the text to
      // show; a parser crash travels as its cause). Anything else — saving,
      // the network, a session that ended — is a failure to import, and its
      // text is translated so raw English never shows.
      return failure(
        file,
        error instanceof StatementReadError
          ? 'Error al validar archivo'
          : 'No se pudo importar',
        error
      )
    }
  }

  // The files go strictly one after the other: each import reads the rows the
  // previous one stored (dedup, taken ids, transfer pairing).
  const handleFiles = async (files: File[]) => {
    cancelledRef.current = false
    const done: FileOutcome[] = []
    // What the files that imported came back with, for the warnings.
    const imported: ImportedResult[] = []

    for (const [index, file] of files.entries()) {
      if (cancelledRef.current) return
      setFileName(file.name)
      setProgress({ index: index + 1, total: files.length })
      setImportState('validating')

      // A file that is not a CSV is refused on the spot, before any await.
      const next = isCsv(file)
        ? await importOne(file)
        : failure(file, 'Error al validar archivo', undefined)
      // Another user is signed in: the rest would fail the same way, and
      // nothing of this batch may reach them (no summary, no toasts).
      if (next.workspaceChanged) {
        cancelledRef.current = true
        setImportState('idle')
        setOutcomes([])
        return
      }
      done.push(next.outcome)
      if (next.result) imported.push({ fileName: file.name, ...next.result })
      // The dialog closed meanwhile: the file in flight finished, so its
      // warnings (AI, repairs) are still said; the rest is not started.
      if (cancelledRef.current) {
        warnAboutBatch(imported, files.length)
        return
      }
    }

    setOutcomes(done)
    // One file that failed keeps the error screen with "Intentar nuevamente".
    setImportState(
      files.length === 1 && done[0]?.kind === 'failed' ? 'error' : 'success'
    )
    warnAboutBatch(imported, files.length)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      void handleFiles(Array.from(e.target.files))
    }
  }

  const resetImport = () => {
    focusPickerRef.current = true
    setImportState('idle')
    setFileName('')
    setOutcomes([])
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1">Importar transacciones</h2>
        <p className="text-muted-foreground">
          Importá extractos CSV de Santander Uruguay
        </p>
      </div>

      <Card className="p-8">
        {importState === 'idle' && (
          <div
            ref={pickerRef}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 transition-all text-center ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-primary/10">
                <Upload className="text-primary" size={32} />
              </div>
              {/* Phones can't drag files: below md only the button shows. */}
              <div className="hidden md:block">
                <p className="font-medium mb-1">
                  Arrastrá tus archivos CSV aquí
                </p>
                <p className="text-sm text-muted-foreground">
                  o seleccioná uno o varios
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileInput}
                className="hidden"
                tabIndex={-1}
                aria-label="Seleccionar archivo"
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Seleccionar archivo
              </Button>
            </div>
          </div>
        )}

        {(importState === 'validating' || importState === 'importing') && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader className="animate-spin text-primary" size={48} />
              <div>
                {progress.total > 1 && (
                  <p className="text-sm text-muted-foreground mb-1">
                    Archivo{' '}
                    <span className="font-mono tabular-nums">
                      {progress.index}
                    </span>{' '}
                    de{' '}
                    <span className="font-mono tabular-nums">
                      {progress.total}
                    </span>
                  </p>
                )}
                <p className="font-medium mb-1">
                  {importState === 'importing'
                    ? 'Importando…'
                    : 'Validando archivo…'}
                </p>
                <p className="text-sm text-muted-foreground">{fileName}</p>
              </div>
            </div>
          </div>
        )}

        {importState === 'success' && (
          <ImportSummaryPanel
            outcomes={outcomes}
            transactions={transactions}
            headingRef={summaryHeadingRef}
            onImportAnother={resetImport}
            onViewTransactions={onViewTransactions}
          />
        )}

        {importState === 'error' && outcomes[0]?.kind === 'failed' && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-neg-soft">
                <CircleAlert className="text-destructive" size={48} />
              </div>
              <div>
                <p className="font-medium mb-1">{outcomes[0].title}</p>
                <p className="text-sm text-muted-foreground mb-2">
                  {outcomes[0].fileName}
                </p>
                <p className="text-sm text-destructive">
                  {outcomes[0].message}
                </p>
              </div>
              <Button onClick={resetImport}>Intentar nuevamente</Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-brand-soft">
              <FileText className="text-primary" size={20} />
            </div>
            <h4>{ACCOUNT_LABELS.credit_card}</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Extracto de tarjeta Santander con compras y pagos en UYU y USD.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-accent-soft">
              <FileText className="text-accent" size={20} />
            </div>
            <h4>{ACCOUNT_LABELS.bank_account_usd}</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Caja de ahorro en dólares con movimientos de débito y crédito.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-pos-soft">
              <FileText className="text-pos" size={20} />
            </div>
            <h4>{ACCOUNT_LABELS.bank_account_uyu}</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Caja de ahorro en pesos uruguayos con todas las operaciones.
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h4 className="mb-4">Cómo obtener tu extracto CSV</h4>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              1
            </span>
            <span>Ingresá a tu Home Banking de Santander Uruguay</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              2
            </span>
            <span>Seleccioná la cuenta o tarjeta que querés exportar</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              3
            </span>
            <span>Buscá la opción "Exportar" o "Descargar movimientos"</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              4
            </span>
            <span>Seleccioná formato CSV y el período deseado</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
              5
            </span>
            <span>Descargá el archivo y arrastralo a esta pantalla</span>
          </li>
        </ol>
      </Card>

      <Card className="p-4 bg-brand-soft border-primary/20">
        <p className="text-sm">
          <strong>Tus datos son tuyos:</strong> Los movimientos se guardan en tu
          cuenta de Supabase bajo tu propio usuario. Nadie más tiene acceso a tu
          información financiera.
        </p>
      </Card>
    </div>
  )
}
