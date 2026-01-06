import { useCallback, useState } from 'react'
import { Upload, FileText } from 'lucide-react'

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void
}

export function FileUpload({ onFilesSelect }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFiles = useCallback(
    (files: File[]) => {
      const csvFiles = files.filter((file) =>
        file.name.toLowerCase().endsWith('.csv')
      )

      if (csvFiles.length === 0) {
        setError('Only CSV files are supported.')
        return
      }

      if (csvFiles.length !== files.length) {
        setError('Only CSV files are supported.')
        return
      }

      setError(null)
      setIsProcessing(true)
      setProgress(0)

      const reader = new FileReader()
      reader.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const next = Math.round((event.loaded / event.total) * 100)
          setProgress(next)
        }
      }
      reader.onloadend = () => {
        onFilesSelect(csvFiles)
        setTimeout(() => {
          setIsProcessing(false)
        }, 0)
      }
      reader.readAsArrayBuffer(csvFiles[0])
    },
    [onFilesSelect]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      handleFiles(files)
    },
    [handleFiles]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        handleFiles(Array.from(files))
      }
    },
    [handleFiles]
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Importar Transacciones
        </h2>
        <p className="text-base text-neutral-500 dark:text-neutral-400">
          Importá extractos CSV de Santander Uruguay
        </p>
      </div>

      {/* Upload Card */}
      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-8">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="file-dropzone"
          className={`border-2 border-dashed rounded-2xl p-12 transition-colors ${
            isDragging
              ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300'
          }`}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="text-center">
              <p className="font-medium text-base text-neutral-900 dark:text-neutral-50 mb-1">
                Arrastrá tu archivo CSV aquí
              </p>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                o hacé clic para seleccionar
              </p>
            </div>
            <input
              type="file"
              accept=".csv"
              multiple
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
              data-testid="file-input"
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center justify-center px-4 py-2 bg-primary-600 dark:bg-primary-400 text-white dark:text-neutral-900 text-sm font-medium rounded-lg hover:bg-primary-700 dark:hover:bg-primary-500 cursor-pointer transition-colors"
            >
              Seleccionar archivo
            </label>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            {isProcessing && (
              <p className="text-sm text-primary-600 dark:text-primary-400">
                Uploading... {progress}%
              </p>
            )}
          </div>
        </div>
      </div>

      {/* File Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
              <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <h4 className="font-medium text-lg text-neutral-900 dark:text-neutral-50">
              Tarjeta de Crédito
            </h4>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Extracto de tarjeta Santander con compras y pagos en UYU y USD.
          </p>
        </div>

        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-accent-50 dark:bg-accent-900/20">
              <FileText className="w-5 h-5 text-accent-600 dark:text-accent-400" />
            </div>
            <h4 className="font-medium text-lg text-neutral-900 dark:text-neutral-50">
              Cuenta USD
            </h4>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Caja de ahorro en dólares con movimientos de débito y crédito.
          </p>
        </div>

        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-success-50 dark:bg-success-900/20">
              <FileText className="w-5 h-5 text-success-600 dark:text-success-400" />
            </div>
            <h4 className="font-medium text-lg text-neutral-900 dark:text-neutral-50">
              Cuenta UYU
            </h4>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Caja de ahorro en pesos uruguayos con todas las operaciones.
          </p>
        </div>
      </div>

      {/* Instructions Card */}
      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-6">
        <h4 className="font-medium text-lg text-neutral-900 dark:text-neutral-50 mb-4">
          Cómo obtener tu extracto CSV
        </h4>
        <ol className="space-y-3">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 dark:bg-primary-400 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-normal">
              1
            </span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Ingresá a tu Home Banking de Santander Uruguay
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 dark:bg-primary-400 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-normal">
              2
            </span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Seleccioná la cuenta o tarjeta que querés exportar
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 dark:bg-primary-400 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-normal">
              3
            </span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Buscá la opción "Exportar" o "Descargar movimientos"
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 dark:bg-primary-400 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-normal">
              4
            </span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Seleccioná formato CSV y el período deseado
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 dark:bg-primary-400 text-white dark:text-neutral-900 flex items-center justify-center text-xs font-normal">
              5
            </span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              Descargá el archivo y arrastralo a esta pantalla
            </span>
          </li>
        </ol>
      </div>
    </div>
  )
}
