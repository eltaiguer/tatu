import { useState } from 'react'
import { FileUpload } from './components/FileUpload'
import { ParsedDataDisplay } from './components/ParsedDataDisplay'
import { parseCSV } from './services/parsers'
import type { ParsedData } from './models'

function App() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleFileSelect = async (file: File) => {
    setIsLoading(true)
    setError(null)

    try {
      const content = await file.text()
      const result = parseCSV(content, file.name)
      setParsedData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file')
      setParsedData(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setParsedData(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Tatu - Expense Tracker
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Santander Uruguay Bank Statement Parser
          </p>
        </div>

        {/* Main Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">
                Parsing CSV file...
              </p>
            </div>
          </div>
        ) : parsedData ? (
          <ParsedDataDisplay data={parsedData} onReset={handleReset} />
        ) : (
          <div>
            <FileUpload onFileSelect={handleFileSelect} />

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

            {/* Instructions */}
            <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
                Supported File Types
              </h3>
              <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                <li className="flex items-start">
                  <span className="mr-2">💳</span>
                  <span>
                    <strong>Credit Card Statements</strong> - Automatically
                    detects and parses multi-currency transactions
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">💵</span>
                  <span>
                    <strong>USD Bank Account</strong> - Parses debits, credits,
                    and balances
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">💰</span>
                  <span>
                    <strong>UYU Bank Account</strong> - Parses debits, credits,
                    and balances
                  </span>
                </li>
              </ul>
            </div>

            {/* Test Files Info */}
            <div className="mt-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Sample Files Available
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                You can test with the sample files in the{' '}
                <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                  samples/
                </code>{' '}
                directory:
              </p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <li>• CreditCardsMovementsDetail.csv</li>
                <li>• USDmovements.csv</li>
                <li>• UYUmovements.csv</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
