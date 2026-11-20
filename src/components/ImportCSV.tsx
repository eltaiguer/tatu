// CSV Import - Drag and drop file upload with validation

import { Card } from './ui/card'
import { Button } from './ui/button'
import {
  Upload,
  FileText,
  Check,
  CircleAlert,
  Info,
  Loader,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  importAiErrorMessage,
  StatementReadError,
  userErrorMessage,
  WorkspaceChangedError,
} from '../utils/user-error'
import type { FileType, Transaction, TransactionsFilter } from '../models'
import type {
  ImportStatementOptions,
  StatementFile,
  StatementImportResult,
} from '../services/import/import-statement'
import { ACCOUNT_LABELS } from '../utils/account-display'
import { monthSpanLabel } from '../services/filters/period-label'
import { countReviewRows, reviewLink } from '../services/import/import-review'

// validating = reading/parsing the file; importing = the file is valid and
// its rows are being saved.
type ImportState = 'idle' | 'validating' | 'importing' | 'success' | 'error'

interface ImportSummary {
  added: number
  duplicates: number
  previouslyDeleted: number
  /** Stored rows whose garbled description this import repaired (#192). */
  repaired: number
  fileType: FileType
  // The month "Ver transacciones" opens: the newest new row's, or the file's
  // newest when nothing was new.
  month: { y: number; m: number } | null
  // What the file covered, whatever was new (null: no rows).
  fileRange: { from: string; to: string } | null
  fileRows: number
  // Ids of the rows this import added: the "a revisar" count is read from the
  // stored rows with these ids, since rules, AI and transfer inference change
  // category and confidence after the import's own classification.
  addedIds: ReadonlySet<string>
}

// One line per count in the summary. A new count (e.g. corrected rows) is one
// more entry here.
function summaryLines(summary: ImportSummary, toReview: number) {
  return [
    { count: summary.added, one: 'nueva', many: 'nuevas', hint: undefined },
    // The file's own new rows still to review (0 says nothing is left).
    ...(summary.added > 0
      ? [
          {
            count: toReview,
            one: 'a revisar',
            many: 'a revisar',
            hint: 'sin categoría o con poca seguridad',
          },
        ]
      : []),
    {
      count: summary.duplicates,
      one: 'duplicada omitida',
      many: 'duplicadas omitidas',
      hint: undefined,
    },
    {
      count: summary.previouslyDeleted,
      one: 'eliminada antes',
      many: 'eliminadas antes',
      hint: undefined,
    },
    // Only when it happened: most imports repair nothing.
    ...(summary.repaired > 0
      ? [
          {
            count: summary.repaired,
            one: 'corregida',
            many: 'corregidas',
            hint: undefined,
          },
        ]
      : []),
  ]
}

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

// One picked file's result: what it imported, or why it could not be.
type FileOutcome =
  | { kind: 'imported'; fileName: string; summary: ImportSummary }
  | {
      kind: 'failed'
      fileName: string
      title: string
      message: string
    }

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
    let repairsFailed = 0
    let aiError: StatementImportResult['aiError']
    let aiPartial: StatementImportResult['aiPartial']

    for (const [index, file] of files.entries()) {
      if (cancelledRef.current) return
      setFileName(file.name)
      setProgress({ index: index + 1, total: files.length })
      setImportState('validating')

      // A file that is not a CSV is refused on the spot, before any await.
      const imported = isCsv(file)
        ? await importOne(file)
        : failure(file, 'Error al validar archivo', undefined)
      if (cancelledRef.current) return
      done.push(imported.outcome)
      if (imported.result) {
        repairsFailed += imported.result.repairsFailed ?? 0
        aiError ??= imported.result.aiError
        aiPartial ??= imported.result.aiPartial
      }
      // The rest would fail the same way: another user is signed in.
      if (imported.workspaceChanged) break
    }

    setOutcomes(done)
    // One file that failed keeps the error screen with "Intentar nuevamente".
    setImportState(
      files.length === 1 && done[0]?.kind === 'failed' ? 'error' : 'success'
    )

    // Said once for the batch, not per file.
    if (repairsFailed > 0) {
      toast.warning(
        `No se ${repairsFailed === 1 ? 'pudo' : 'pudieron'} corregir ${repairsFailed} descripci${repairsFailed === 1 ? 'ón' : 'ones'}. Importá el archivo de nuevo para reintentar.`
      )
    }

    // The import succeeded, but the AI step did not — say so, otherwise a
    // dead API key looks identical to poor categorization. Total failure
    // and partial failure need different wording: telling the user "no
    // disponible" when 10 of 12 batches did enrich is simply wrong.
    if (aiError !== undefined) {
      toast.warning(
        `Categorización con IA no disponible: ${importAiErrorMessage(aiError)}. Se usaron las reglas de categorización.`
      )
    } else if (aiPartial) {
      toast.warning(
        `Categorización con IA incompleta: ${aiPartial}. El resto se categorizó con reglas.`
      )
    }
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
                    Archivo {progress.index} de {progress.total}
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

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many
}

// What one imported file came to: its account, its period, its counts.
function FileSummary({
  summary,
  toReview,
}: {
  summary: ImportSummary
  toReview: number
}) {
  return (
    <>
      <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
        {ACCOUNT_LABELS[summary.fileType]}
      </div>
      {summary.fileRange && (
        <p className="mt-3 text-sm text-muted-foreground">
          {monthSpanLabel(summary.fileRange.from, summary.fileRange.to)} ·{' '}
          <span className="font-mono tabular-nums">{summary.fileRows}</span>{' '}
          {plural(summary.fileRows, 'movimiento', 'movimientos')}
        </p>
      )}
      <ul
        aria-label="Resumen de la importación"
        className="mt-4 space-y-1 text-sm"
      >
        {summaryLines(summary, toReview).map(({ count, one, many, hint }) => (
          <li key={many}>
            <span className="font-mono tabular-nums font-medium">{count}</span>{' '}
            <span className="text-muted-foreground">
              {plural(count, one, many)}
              {hint && ` · ${hint}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function ImportSummaryPanel({
  outcomes,
  transactions,
  headingRef,
  onImportAnother,
  onViewTransactions,
}: {
  outcomes: FileOutcome[]
  transactions: Transaction[]
  headingRef: React.RefObject<HTMLHeadingElement>
  onImportAnother: () => void
  onViewTransactions?: (filter: TransactionsFilter) => void
}) {
  const sectionId = useId()
  const several = outcomes.length > 1
  const imported = outcomes.flatMap((o) => (o.kind === 'imported' ? [o] : []))
  const failedCount = outcomes.length - imported.length
  // Nothing new is not a success: the files were most likely imported before.
  const nothingNew = imported.every(({ summary }) => summary.added === 0)
  const allFailed = imported.length === 0
  const repaired = imported.reduce((sum, o) => sum + o.summary.repaired, 0)

  // Counted live from the stored rows, through the Transacciones filter, so a
  // later transfer pairing or edit is reflected and the number is what the
  // link opens.
  const { perFile, link, linkCount } = useMemo(() => {
    const perFile = outcomes.map((outcome) =>
      outcome.kind === 'imported'
        ? countReviewRows(
            transactions,
            { review: true },
            outcome.summary.addedIds
          )
        : 0
    )
    const link = reviewLink(
      imported.flatMap(({ summary }) =>
        summary.added > 0 && summary.fileRange
          ? [{ fileType: summary.fileType, fileRange: summary.fileRange }]
          : []
      )
    )
    return {
      perFile,
      link,
      linkCount: link ? countReviewRows(transactions, link) : 0,
    }
    // `imported` is derived from `outcomes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomes, transactions])
  const toReviewTotal = perFile.reduce((sum, n) => sum + n, 0)
  // The button opens exactly `linkCount` rows; it only shows when this
  // import's own new rows have something to review.
  const reviewAction =
    onViewTransactions && link && toReviewTotal > 0 && linkCount > 0
      ? () => onViewTransactions(link)
      : undefined
  // "Ver transacciones" opens the newest month among the imported files.
  const viewMonth = imported
    .flatMap(({ summary }) => (summary.month ? [summary.month] : []))
    .reduce<{
      y: number
      m: number
    } | null>(
      (newest, month) =>
        !newest || month.y * 12 + month.m > newest.y * 12 + newest.m
          ? month
          : newest,
      null
    )
  const viewAction = onViewTransactions
    ? () =>
        onViewTransactions(
          viewMonth ? { period: { mode: 'month', ...viewMonth } } : {}
        )
    : undefined

  const heading = allFailed
    ? 'No se pudieron importar los archivos'
    : nothingNew
      ? 'No había movimientos nuevos'
      : 'Importación completada'

  return (
    <div className="text-center py-8 sm:py-12">
      <div className="flex flex-col items-center gap-4">
        {allFailed ? (
          <div className="p-4 rounded-full bg-neg-soft">
            <CircleAlert className="text-destructive" size={48} />
          </div>
        ) : nothingNew ? (
          <div className="p-4 rounded-full bg-muted">
            <Info className="text-muted-foreground" size={48} />
          </div>
        ) : (
          <div className="p-4 rounded-full bg-pos-soft">
            <Check className="text-pos" size={48} />
          </div>
        )}
        <div className="w-full">
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="font-medium mb-1 outline-none"
          >
            {heading}
          </h3>
          {!allFailed && nothingNew && failedCount === 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              {several
                ? 'Estos archivos ya estaban importados.'
                : 'Este archivo ya estaba importado.'}
            </p>
          )}
          {nothingNew && repaired > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              {repaired === 1
                ? 'Se corrigió 1 descripción.'
                : `Se corrigieron ${repaired} descripciones.`}
            </p>
          )}
          {several && failedCount > 0 && !allFailed && (
            <p className="text-sm text-muted-foreground mb-1">
              {failedCount === 1
                ? '1 archivo no se pudo importar.'
                : `${failedCount} archivos no se pudieron importar.`}
            </p>
          )}
          {outcomes.map((outcome, index) => {
            const body =
              outcome.kind === 'imported' ? (
                <FileSummary
                  summary={outcome.summary}
                  toReview={perFile[index]}
                />
              ) : (
                <>
                  <p className="text-sm font-medium">{outcome.title}</p>
                  <p className="text-sm text-destructive">{outcome.message}</p>
                </>
              )
            // One file reads as it always did; several get a section each.
            return several ? (
              <section
                key={index}
                aria-labelledby={`${sectionId}-${index}`}
                className="mt-6 border-t border-border pt-4 first:mt-4"
              >
                <h4
                  id={`${sectionId}-${index}`}
                  className="mb-2 break-all text-sm font-medium"
                >
                  {outcome.fileName}
                </h4>
                {body}
              </section>
            ) : (
              <div key={index}>
                <p className="text-sm text-muted-foreground mb-4 break-all">
                  {outcome.fileName}
                </p>
                {body}
              </div>
            )
          })}
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-4 w-full sm:w-auto">
          <Button
            onClick={onImportAnother}
            variant={nothingNew || !onViewTransactions ? 'default' : 'outline'}
          >
            Importar otro archivo
          </Button>
          {viewAction && !allFailed && (
            <Button
              onClick={viewAction}
              variant={nothingNew || reviewAction ? 'outline' : 'default'}
            >
              Ver transacciones
            </Button>
          )}
          {reviewAction && (
            <Button onClick={reviewAction}>
              Revisar {linkCount}{' '}
              {plural(linkCount, 'movimiento', 'movimientos')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
