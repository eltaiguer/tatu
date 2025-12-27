import { useCallback, useState } from 'react'

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
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="file-dropzone"
      className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
      }`}
    >
      <div className="space-y-4">
        <div className="text-4xl">📄</div>
        <div>
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Drop your Santander CSV file here
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            or click to browse
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
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors"
        >
          Choose File
        </label>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Supports: Credit Card, USD Account, UYU Account
        </p>
        {error ? (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        {isProcessing ? (
          <p className="text-xs text-blue-600 dark:text-blue-400">
            Uploading... {progress}%
          </p>
        ) : null}
      </div>
    </div>
  )
}
