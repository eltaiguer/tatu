import { FileUpload } from '../components/FileUpload'

interface ImportPageProps {
  onFilesSelect: (files: File[]) => void
  error: string | null
}

export function ImportPage({ onFilesSelect, error }: ImportPageProps) {
  return (
    <div id="import">
      <FileUpload onFilesSelect={onFilesSelect} />

      {error && (
        <div className="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <span className="text-red-600 dark:text-red-400 text-xl">
                ⚠️
              </span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Error parsing file
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
