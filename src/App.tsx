import { useState } from 'react'
import { useStore } from 'zustand'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { InsightsPage } from './pages/InsightsPage'
import { ToolsPage } from './pages/ToolsPage'
import { ImportPage } from './pages/ImportPage'
import { parseCSV } from './services/parsers'
import type { ParsedData } from './models'
import { setMerchantCategoryOverride } from './services/categorizer/category-overrides'
import { transactionStore } from './stores/transaction-store'

function App() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
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
      navigate('/')
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
    navigate('/')
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
    <Layout>
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
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                parsedData ? (
                  <DashboardPage
                    data={{ ...parsedData, transactions }}
                    onReset={handleReset}
                    onCategoryChange={handleCategoryChange}
                  />
                ) : (
                  <Navigate to="/import" replace />
                )
              }
            />
            <Route
              path="/import"
              element={
                <ImportPage onFilesSelect={handleFilesSelect} error={error} />
              }
            />
            <Route
              path="/transactions"
              element={
                parsedData ? (
                  <TransactionsPage
                    data={{ ...parsedData, transactions }}
                    onReset={handleReset}
                    onCategoryChange={handleCategoryChange}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/insights"
              element={
                parsedData ? (
                  <InsightsPage
                    data={{ ...parsedData, transactions }}
                    onReset={handleReset}
                    onCategoryChange={handleCategoryChange}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </ErrorBoundary>
    </Layout>
  )
}

export default App
