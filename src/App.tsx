import { useState } from 'react'
import { useStore } from 'zustand'
import { FileUpload } from './components/FileUpload'
import { Layout } from './components/Layout'
import { ParsedDataDisplay } from './components/ParsedDataDisplay'
import { ErrorBoundary } from './components/ErrorBoundary'
import { parseCSV } from './services/parsers'
import type { ParsedData } from './models'
import { setMerchantCategoryOverride } from './services/categorizer/category-overrides'
import { transactionStore } from './stores/transaction-store'

function App() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const transactions = useStore(transactionStore, (state) => state.transactions)
  const setTransactions = useStore(
    transactionStore,
    (state) => state.setTransactions
  )
  const clearTransactions = useStore(
    transactionStore,
    (state) => state.clearTransactions
  )
  const updateTransaction = useStore(
    transactionStore,
    (state) => state.updateTransaction
  )

  const handleFileSelect = async (file: File) => {
    setIsLoading(true)
    setError(null)

    try {
      const content = await file.text()
      const result = parseCSV(content, file.name)
      setTransactions(result.transactions)
      setParsedData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file')
      setParsedData(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFilesSelect = async (files: File[]) => {
    if (files.length > 1) {
      setError('Please upload one CSV file at a time.')
      return
    }
    if (files.length === 1) {
      await handleFileSelect(files[0])
    }
  }

  const handleReset = () => {
    setParsedData(null)
    setError(null)
    clearTransactions()
  }

  const handleCategoryChange = (
    transactionId: string,
    nextCategory: string
  ) => {
    const tx = transactions.find((item) => item.id === transactionId)
    if (!tx) {
      return
    }

    setMerchantCategoryOverride(tx.description, nextCategory)
    updateTransaction(transactionId, {
      category: nextCategory,
      categoryConfidence: 1,
    })
  }

  return (
    <Layout
      title="Tatu - Expense Tracker"
      subtitle="Santander Uruguay Bank Statement Parser"
    >
      <ErrorBoundary onReset={handleReset}>
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
          <ParsedDataDisplay
            data={{ ...parsedData, transactions }}
            onReset={handleReset}
            onCategoryChange={handleCategoryChange}
          />
        ) : (
          <div id="import">
            <FileUpload onFilesSelect={handleFilesSelect} />

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
      </ErrorBoundary>
    </Layout>
  )
}

export default App
