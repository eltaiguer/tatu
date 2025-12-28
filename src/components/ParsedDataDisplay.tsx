import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ParsedData } from '../models'
import {
  applyFilters,
  sortTransactions,
  type FilterOptions,
} from '../services/filters/filters'
import { buildSearchSuggestions } from '../services/filters/search'
import { DashboardOverview } from './DashboardOverview'
import { ChartsSection } from './ChartsSection'
import { TransactionList } from './TransactionList'
import { AdvancedFilters } from './AdvancedFilters'
import { ExportPanel } from './ExportPanel'
import { CategoryManagement } from './CategoryManagement'
import { CollapsibleSection } from './CollapsibleSection'

interface ParsedDataDisplayProps {
  data: ParsedData
  onReset: () => void
  onCategoryChange: (transactionId: string, category: string) => void
}

export function ParsedDataDisplay({
  data,
  onReset,
  onCategoryChange,
}: ParsedDataDisplayProps) {
  const metadata = data.metadata
  const [filters, setFilters] = useState<FilterOptions>({})
  const [, setCategoryRevision] = useState(0)
  const [sectionsOpen, setSectionsOpen] = useState(() => ({
    dashboard: true,
    transactions: true,
    insights: false,
  }))
  const handlePeriodChange = useCallback(
    ({ dateFrom, dateTo }: { dateFrom?: Date; dateTo?: Date }) =>
      setFilters((current) => ({
        ...current,
        dateFrom,
        dateTo,
      })),
    []
  )

  const filteredTransactions = applyFilters(data.transactions, filters)
  const sortedTransactions = sortTransactions(filteredTransactions)
  const searchSuggestions = buildSearchSuggestions(data.transactions)
  const exportFileName = data.fileName.replace(/\.csv$/i, '') || 'tatu-export'
  const sectionIds = useMemo(
    () => ['dashboard', 'transactions', 'insights'],
    []
  )

  useEffect(() => {
    const openFromHash = () => {
      if (typeof window === 'undefined') {
        return
      }

      const hash = window.location.hash.replace('#', '')
      if (!hash || !sectionIds.includes(hash)) {
        return
      }

      setSectionsOpen((current) => ({
        ...current,
        [hash]: true,
      }))
    }

    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [sectionIds])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        id="import"
        className="flex items-center justify-between"
      >
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Parsed Data
        </h2>
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Upload Another File
        </button>
      </div>

      {/* File Info */}
      <CollapsibleSection
        id="dashboard"
        title="Dashboard"
        subtitle="File details, metadata, and period overview."
        isOpen={sectionsOpen.dashboard}
        onToggle={(next) =>
          setSectionsOpen((current) => ({ ...current, dashboard: next }))
        }
      >
        <div className="space-y-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              File Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">File:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {data.fileName}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Type:</span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {data.fileType.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Transactions:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  <span aria-live="polite">{sortedTransactions.length}</span>
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  Parsed At:
                </span>
                <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                  {data.parsedAt.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Account Metadata
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {'cliente' in metadata && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Client:
                  </span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                    {metadata.cliente}
                  </span>
                </div>
              )}

              {'numeroTarjeta' in metadata && (
                <>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Card Number:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {metadata.numeroTarjeta}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Card Alias:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {metadata.alias}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Statement Period:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {metadata.periodoDesde} - {metadata.periodoHasta}
                    </span>
                  </div>
                </>
              )}

              {'moneda' in metadata && (
                <>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Account:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {metadata.cuenta}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Number:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {metadata.numero}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Currency:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {metadata.moneda}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">
                      Period:
                    </span>
                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                      {metadata.periodoDesde} - {metadata.periodoHasta}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <DashboardOverview
            transactions={sortedTransactions}
            onPeriodChange={handlePeriodChange}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="insights"
        title="Insights"
        subtitle="Charts, exports, and category management."
        isOpen={sectionsOpen.insights}
        onToggle={(next) =>
          setSectionsOpen((current) => ({ ...current, insights: next }))
        }
      >
        <div className="space-y-6">
          <ChartsSection transactions={sortedTransactions} />

          <ExportPanel
            allTransactions={data.transactions}
            filteredTransactions={sortedTransactions}
            fileName={exportFileName}
          />

          <CategoryManagement
            onCategoriesUpdated={() =>
              setCategoryRevision((current) => current + 1)
            }
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="transactions"
        title="Transactions"
        subtitle="Filters, search, and the transaction list."
        isOpen={sectionsOpen.transactions}
        onToggle={(next) =>
          setSectionsOpen((current) => ({ ...current, transactions: next }))
        }
      >
        <div className="space-y-6">
          <AdvancedFilters
            filters={filters}
            onChange={setFilters}
            searchSuggestions={searchSuggestions}
          />

          <TransactionList
            transactions={sortedTransactions}
            onCategoryChange={onCategoryChange}
            highlightQuery={filters.query}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}
