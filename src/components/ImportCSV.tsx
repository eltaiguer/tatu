// CSV Import - Drag and drop file upload with validation

import { Card } from './ui/card'
import { Button } from './ui/button'
import { Upload, FileText, Check, CircleAlert, Loader } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  aiErrorMessage,
  UserFacingError,
  userErrorMessage,
} from '../utils/user-error'
import { parseCSV } from '../services/parsers/csv-parser'
import { categorizeParsedData } from '../services/categorizer/import-categorization'
import { transactionStore } from '../stores/transaction-store'
import type { ParsedData, Transaction } from '../models'

type ImportState = 'idle' | 'validating' | 'success' | 'error'
type UiFileType = 'credit_card' | 'usd_account' | 'uyu_account'

interface ImportCSVProps {
  onImportComplete?: () => void
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
  onImportComplete,
  onTransactionsImported,
}: ImportCSVProps) {
  const [importState, setImportState] = useState<ImportState>('idle')
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState<string>('')
  const [fileType, setFileType] = useState<UiFileType | null>(null)
  const [importSummary, setImportSummary] = useState<{
    total: number
    imported: number
    duplicates: number
  } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  // The real file input stays hidden; a real button opens it, so the picker
  // is reachable by Tab and Enter/Space (a <label> is not focusable, #193).
  const fileInputRef = useRef<HTMLInputElement>(null)

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

      setImportSummary({
        total: result.transactions.length,
        imported: added.length,
        duplicates: duplicates.length,
      })

      setImportState('success')
      const deletedCount = previouslyDeleted.length
      toast.success(
        `${added.length} nueva${added.length === 1 ? '' : 's'} · ${duplicates.length} duplicada${duplicates.length === 1 ? '' : 's'} omitida${duplicates.length === 1 ? '' : 's'}` +
          (deletedCount > 0
            ? ` · ${deletedCount} que eliminaste antes ${deletedCount === 1 ? 'omitida' : 'omitidas'}`
            : '')
      )

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

      if (onImportComplete) {
        onImportComplete()
      }
    } catch (error) {
      console.error('import failed:', error)
      setImportState('error')
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
    setImportState('idle')
    setFileName('')
    setFileType(null)
    setImportSummary(null)
    setErrorMessage('')
  }

  const getAccountTypeLabel = (type: UiFileType) => {
    switch (type) {
      case 'credit_card':
        return 'Tarjeta de Crédito'
      case 'usd_account':
        return 'Cuenta USD'
      case 'uyu_account':
        return 'Cuenta UYU'
      default:
        return ''
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1">Importar Transacciones</h2>
        <p className="text-muted-foreground">
          Importá extractos CSV de Santander Uruguay
        </p>
      </div>

      <Card className="p-8">
        {importState === 'idle' && (
          <div
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
              <div>
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

        {importState === 'validating' && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader className="animate-spin text-primary" size={48} />
              <div>
                <p className="font-medium mb-1">Validando archivo...</p>
                <p className="text-sm text-muted-foreground">{fileName}</p>
              </div>
            </div>
          </div>
        )}

        {importState === 'success' && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-success-100 dark:bg-success-900/20">
                <Check className="text-success-600" size={48} />
              </div>
              <div>
                <p className="font-medium mb-1">Importación completada</p>
                <p className="text-sm text-muted-foreground mb-4">{fileName}</p>
                {fileType && (
                  <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
                    {getAccountTypeLabel(fileType)}
                  </div>
                )}
                {importSummary && (
                  <p className="text-sm text-muted-foreground mt-3">
                    {importSummary.imported} de {importSummary.total}{' '}
                    transacciones guardadas
                    {importSummary.duplicates > 0 && (
                      <> ({importSummary.duplicates} duplicadas omitidas)</>
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <Button onClick={resetImport} variant="outline">
                  Importar otro archivo
                </Button>
                {onImportComplete && (
                  <Button onClick={onImportComplete}>Ver transacciones</Button>
                )}
              </div>
            </div>
          </div>
        )}

        {importState === 'error' && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/20">
                <CircleAlert className="text-destructive" size={48} />
              </div>
              <div>
                <p className="font-medium mb-1">Error al validar archivo</p>
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
            <h4>Tarjeta de Crédito</h4>
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
            <h4>Cuenta UYU</h4>
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
