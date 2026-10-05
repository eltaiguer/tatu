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
  aiErrorMessage,
  UserFacingError,
  userErrorMessage,
} from '../utils/user-error'
import { parseCSV } from '../services/parsers/csv-parser'
import { categorizeParsedData } from '../services/categorizer/import-categorization'
import { transactionStore } from '../stores/transaction-store'
import type { ParsedData, Transaction, TransactionsFilter } from '../models'

// validating = reading/parsing the file; importing = the file is valid and
// its rows are being saved.
type ImportState = 'idle' | 'validating' | 'importing' | 'success' | 'error'
type UiFileType = 'credit_card' | 'usd_account' | 'uyu_account'

interface ImportSummary {
  added: number
  duplicates: number
  previouslyDeleted: number
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
  ]
}

function newestMonth(rows: Transaction[]): ImportSummary['month'] {
  if (rows.length === 0) return null
  const newest = new Date(Math.max(...rows.map((tx) => tx.date.getTime())))
  return { y: newest.getFullYear(), m: newest.getMonth() }
}

interface ImportCSVProps {
  /** "Ver transacciones" on the summary; the import itself never navigates. */
  onViewTransactions?: (filter: TransactionsFilter) => void
  onTransactionsImported?: (
    transactions: Transaction[],
    context?: {
      parsedData: ParsedData
      csvContent: string
      fileName: string
    }
  ) => Promise<{
    added: Transaction[]
    duplicates: Transaction[]
    /** Rows deleted before; skipped so they stay deleted. */
    previouslyDeleted?: Transaction[]
    /**
     * Set when the import succeeded but AI enrichment did not, so the user can
     * tell a dead API key apart from the model categorizing badly.
     */
    /** Enrichment did not run at all. */
    aiError?: string
    /** Enrichment ran but some batches failed; the rest were applied. */
    aiPartial?: string
  }>
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () =>
      reject(new UserFacingError('Error al leer el archivo'))
    reader.readAsText(file)
  })
}

export function ImportCSV({
  onViewTransactions,
  onTransactionsImported,
}: ImportCSVProps) {
  const [importState, setImportState] = useState<ImportState>('idle')
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState<string>('')
  const [fileType, setFileType] = useState<UiFileType | null>(null)
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

    // Parser errors are UserFacingErrors (Spanish, say what to do); anything
    // else — a parser bug, saving, the network — is translated so raw
    // English never shows.
    let parsed = false
    try {
      const csvContent = await readFileAsText(file)
      // Parsers return uncategorized rows; categorize before anything else
      // sees them (dedup, AI enrichment, the store).
      const result = categorizeParsedData(parseCSV(csvContent, file.name))
      parsed = true
      setImportState('importing')

      if (result.fileType === 'credit_card') {
        setFileType('credit_card')
      } else if (result.fileType === 'bank_account_usd') {
        setFileType('usd_account')
      } else {
        setFileType('uyu_account')
      }

      const {
        added,
        duplicates,
        previouslyDeleted = [],
        aiError,
        aiPartial,
      } = onTransactionsImported
        ? await onTransactionsImported(result.transactions, {
            parsedData: result,
            csvContent,
            fileName: file.name,
          })
        : {
            ...transactionStore.getState().addTransactions(result.transactions),
            // Local-only path never runs AI enrichment.
            aiError: undefined as string | undefined,
            aiPartial: undefined as string | undefined,
          }

      // The dialog stays open on this summary (#202): no toast, no
      // navigation until the user picks "Ver transacciones".
      setImportSummary({
        added: added.length,
        duplicates: duplicates.length,
        previouslyDeleted: previouslyDeleted.length,
        month: newestMonth(added.length > 0 ? added : result.transactions),
      })

      setImportState('success')

      // The import succeeded, but the AI step did not — say so, otherwise a
      // dead API key looks identical to poor categorization. Total failure
      // and partial failure need different wording: telling the user "no
      // disponible" when 10 of 12 batches did enrich is simply wrong.
      if (aiError) {
        toast.warning(
          `Categorización con IA no disponible: ${aiErrorMessage(aiError)}. Se usaron las reglas de categorización.`
        )
      } else if (aiPartial) {
        toast.warning(
          `Categorización con IA incompleta: ${aiErrorMessage(aiPartial)}. El resto se categorizó con reglas.`
        )
      }
    } catch (error) {
      console.error('import failed:', error)
      setImportState('error')
      setFailedWhileSaving(parsed)
      setErrorMessage(
        userErrorMessage(
          error,
          parsed
            ? 'No se pudo guardar la importación'
            : 'No se pudo leer el archivo. Revisá que sea un extracto CSV de Santander.'
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
    setFileType(null)
    setImportSummary(null)
    setErrorMessage('')
    setFailedWhileSaving(false)
  }

  const getAccountTypeLabel = (type: UiFileType) => {
    switch (type) {
      case 'credit_card':
        return 'Tarjeta de crédito'
      case 'usd_account':
        return 'Cuenta USD'
      case 'uyu_account':
        return 'Cuenta $U'
      default:
        return ''
    }
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
            accountLabel={fileType ? getAccountTypeLabel(fileType) : null}
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
              <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/20">
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
            <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
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
            <div className="p-2 rounded-lg bg-accent-50 dark:bg-accent-900/20">
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
            <div className="p-2 rounded-lg bg-success-50 dark:bg-success-900/20">
              <FileText className="text-success-600" size={20} />
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

      <Card className="p-4 bg-primary-50 dark:bg-primary-900/10 border-primary/20">
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
  accountLabel: string | null
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
          <div className="p-4 rounded-full bg-success-100 dark:bg-success-900/20">
            <Check className="text-success-600" size={48} />
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
          <p className="text-sm text-muted-foreground mb-4 break-all">
            {fileName}
          </p>
          {accountLabel && (
            <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
              {accountLabel}
            </div>
          )}
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
