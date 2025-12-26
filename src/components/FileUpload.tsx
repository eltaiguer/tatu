import { useCallback, useState } from 'react'

interface FileUploadProps {
  onFileSelect: (file: File) => void
}

export function FileUpload({ onFileSelect }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files)
      const csvFile = files.find((f) => f.name.endsWith('.csv'))

      if (csvFile) {
        onFileSelect(csvFile)
      }
    },
    [onFileSelect]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files[0]) {
        onFileSelect(files[0])
      }
    },
    [onFileSelect]
  )

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
          onChange={handleFileInput}
          className="hidden"
          id="file-upload"
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
      </div>
    </div>
  )
}
