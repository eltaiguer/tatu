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
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  importAiErrorMessage,
  StatementReadError,
  userErrorMessage,
} from '../utils/user-error'
import type { FileType, TransactionsFilter } from '../models'

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
}

// One line per count in the summary. A new count (e.g. corrected rows) is one
// more entry here.
function summaryLines(summary: ImportSummary) {
  return [
    { count: summary.added, one: 'nueva', many: 'nuevas' },
    {
      count: summary.duplicates,
      one: 'duplicada omitida',
      many: 'duplicadas omitidas',
    },
    {
      count: summary.previouslyDeleted,
      one: 'eliminada antes',
      many: 'eliminadas antes',
    },
    // Only when it happened: most imports repair nothing.
    ...(summary.repaired > 0
      ? [{ count: summary.repaired, one: 'corregida', many: 'corregidas' }]
      : []),
  ]
}

const ACCOUNT_LABELS: Record<FileType, string> = {
  credit_card: 'Tarjeta de crédito',
  bank_account_usd: 'Cuenta USD',
  bank_account_uyu: 'Cuenta $U',
}

// What the dialog needs from an import, declared here (structurally) so the
// dialog does not depend on the import service: `importStatement`'s result
// satisfies it, and so does a test double.
export interface ImportOutcome {
  added: readonly unknown[]
  duplicates: readonly unknown[]
  /** Rows deleted before; skipped so they stay deleted. */
  previouslyDeleted: readonly unknown[]
  /** Stored rows whose garbled description the import repaired (#192). */
  repaired: readonly unknown[]
  /** Repairs that did not save; importing again retries them. */
  repairsFailed?: number
  /** Enrichment did not run at all: what it threw (`importAiErrorMessage`). */
  aiError?: unknown
  /** Enrichment ran but some batches failed: the text to show. */
  aiPartial?: string
  fileType: FileType
  /** The month "Ver transacciones" opens. */
  month: { y: number; m: number } | null
}

interface ImportCSVProps {
  /** "Ver transacciones" on the summary; the import itself never navigates. */
  onViewTransactions?: (filter: TransactionsFilter) => void
  /**
   * Imports the picked file (`importStatement`, bound to the signed-in user).
   * A file it could not read rejects with a `StatementReadError`; any other
   * rejection is a failure to save. `onParsed` is progress only.
   */
  onTransactionsImported: (
    file: { bytes: ArrayBuffer; fileName: string },
    options: { onParsed?: () => void }
  ) => Promise<ImportOutcome>
}

const READ_FAILED = 'Error al leer el archivo'

// Bytes, not text: the encoding is decided by the import (#192), since
// Santander exports are Latin-1 and File.text() would read them as UTF-8.
async function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()

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

export function ImportCSV({
  onViewTransactions,
  onTransactionsImported,
}: ImportCSVProps) {
  const [importState, setImportState] = useState<ImportState>('idle')
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState<string>('')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  // Whether the failure happened after the file was understood (saving), so
  // a valid file is never reported as a validation error.
  const [failedWhileSaving, setFailedWhileSaving] = useState(false)
  // The real file input stays hidden; a real button opens it, so the picker
  // is reachable by Tab and Enter/Space (a <label> is not focusable, #193).
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Button takes no ref (React 18 function component); its drop zone does.
  const pickerRef = useRef<HTMLDivElement>(null)
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null)
  // Set by "Importar otro archivo", so focus goes back to the picker.
  const focusPickerRef = useRef(false)

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
      void handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFile = async (file: File) => {
    setFailedWhileSaving(false)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportState('error')
      setFileName(file.name)
      setErrorMessage('El archivo debe estar en formato CSV')
      return
    }

    setFileName(file.name)
    setImportState('validating')
    setErrorMessage('')

    try {
      const bytes = await readFileBytes(file)
      const {
        added,
        duplicates,
        previouslyDeleted,
        repaired,
        repairsFailed = 0,
        aiError,
        aiPartial,
        fileType,
        month,
      } = await onTransactionsImported(
        { bytes, fileName: file.name },
        { onParsed: () => setImportState('importing') }
      )

      // The dialog stays open on this summary (#202): no toast, no
      // navigation until the user picks "Ver transacciones".
      setImportSummary({
        added: added.length,
        duplicates: duplicates.length,
        previouslyDeleted: previouslyDeleted.length,
        repaired: repaired.length,
        fileType,
        month,
      })

      setImportState('success')

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
    } catch (error) {
      console.error('import failed:', error)
      // A file that could not be read says why (its message is the text to
      // show; a parser crash travels as its cause). Anything else — saving,
      // the network, a session that ended — is a failure to import, and its
      // text is translated so raw English never shows.
      const unreadable = error instanceof StatementReadError
      setImportState('error')
      setFailedWhileSaving(!unreadable)
      setErrorMessage(
        userErrorMessage(
          error,
          'No se pudo guardar la importación',
          // Reported once, by userErrorMessage. A parse crash may mean
          // Santander changed its export format.
          unreadable ? 'import-parse' : 'import'
        )
      )
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      void handleFile(e.target.files[0])
    }
  }

  const resetImport = () => {
    focusPickerRef.current = true
    setImportState('idle')
    setFileName('')
    setImportSummary(null)
    setErrorMessage('')
    setFailedWhileSaving(false)
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
                <p className="font-medium mb-1">Arrastrá tu archivo CSV aquí</p>
                <p className="text-sm text-muted-foreground">
                  o seleccioná un archivo
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
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

        {importState === 'success' && importSummary && (
          <ImportSummaryPanel
            summary={importSummary}
            fileName={fileName}
            accountLabel={ACCOUNT_LABELS[importSummary.fileType]}
            headingRef={summaryHeadingRef}
            onImportAnother={resetImport}
            onViewTransactions={
              onViewTransactions
                ? () =>
                    onViewTransactions(
                      importSummary.month
                        ? { period: { mode: 'month', ...importSummary.month } }
                        : {}
                    )
                : undefined
            }
          />
        )}

        {importState === 'error' && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-neg-soft">
                <CircleAlert className="text-destructive" size={48} />
              </div>
              <div>
                <p className="font-medium mb-1">
                  {failedWhileSaving
                    ? 'No se pudo importar'
                    : 'Error al validar archivo'}
                </p>
                <p className="text-sm text-muted-foreground mb-2">{fileName}</p>
                <p className="text-sm text-destructive">
                  {errorMessage || 'El archivo debe estar en formato CSV'}
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
            <h4>Tarjeta de crédito</h4>
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
            <h4>Cuenta USD</h4>
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
            <h4>Cuenta $U</h4>
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

function ImportSummaryPanel({
  summary,
  fileName,
  accountLabel,
  headingRef,
  onImportAnother,
  onViewTransactions,
}: {
  summary: ImportSummary
  fileName: string
  accountLabel: string
  headingRef: React.RefObject<HTMLHeadingElement>
  onImportAnother: () => void
  onViewTransactions?: () => void
}) {
  // Nothing new is not a success: the file was most likely imported before.
  const nothingNew = summary.added === 0

  return (
    <div className="text-center py-8 sm:py-12">
      <div className="flex flex-col items-center gap-4">
        {nothingNew ? (
          <div className="p-4 rounded-full bg-muted">
            <Info className="text-muted-foreground" size={48} />
          </div>
        ) : (
          <div className="p-4 rounded-full bg-pos-soft">
            <Check className="text-pos" size={48} />
          </div>
        )}
        <div>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="font-medium mb-1 outline-none"
          >
            {nothingNew
              ? 'No había movimientos nuevos'
              : 'Importación completada'}
          </h3>
          {nothingNew && (
            <p className="text-sm text-muted-foreground mb-1">
              Este archivo ya estaba importado.
            </p>
          )}
          {nothingNew && summary.repaired > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              {summary.repaired === 1
                ? 'Se corrigió 1 descripción.'
                : `Se corrigieron ${summary.repaired} descripciones.`}
            </p>
          )}
          <p className="text-sm text-muted-foreground mb-4 break-all">
            {fileName}
          </p>
          <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
            {accountLabel}
          </div>
          <ul
            aria-label="Resumen de la importación"
            className="mt-4 space-y-1 text-sm"
          >
            {summaryLines(summary).map(({ count, one, many }) => (
              <li key={many}>
                <span className="font-mono tabular-nums font-medium">
                  {count}
                </span>{' '}
                <span className="text-muted-foreground">
                  {count === 1 ? one : many}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-4 w-full sm:w-auto">
          <Button
            onClick={onImportAnother}
            variant={nothingNew || !onViewTransactions ? 'default' : 'outline'}
          >
            Importar otro archivo
          </Button>
          {onViewTransactions && (
            <Button
              onClick={onViewTransactions}
              variant={nothingNew ? 'outline' : 'default'}
            >
              Ver transacciones
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
