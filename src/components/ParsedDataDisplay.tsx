import type { ParsedData } from '../models'
import {
  Category,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
} from '../models/category'

interface ParsedDataDisplayProps {
  data: ParsedData
  onReset: () => void
}

export function ParsedDataDisplay({ data, onReset }: ParsedDataDisplayProps) {
  const metadata = data.metadata

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
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
              {data.transactions.length}
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

      {/* Metadata */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Account Metadata
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {'cliente' in metadata && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Client:</span>
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

      {/* Transactions Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <div className="p-6 pb-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Transactions
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-100">
                    {tx.date.toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-gray-900 dark:text-gray-100">
                    {tx.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                      <span>{CATEGORY_ICONS[tx.category as Category] || '❓'}</span>
                      <span>{CATEGORY_LABELS[tx.category as Category] || tx.category || 'Uncategorized'}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        tx.type === 'credit'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}
                    >
                      {tx.type}
                    </span>
                  </td>
                  <td
                    className={`px-6 py-4 whitespace-nowrap text-right font-medium ${
                      tx.type === 'credit'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {tx.type === 'credit' ? '+' : '-'}
                    {tx.amount.toFixed(2)} {tx.currency}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900 dark:text-gray-100">
                    {tx.balance !== undefined
                      ? `${tx.balance.toFixed(2)} ${tx.currency}`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Total Debits
          </p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
            {data.transactions
              .filter((tx) => tx.type === 'debit')
              .reduce((sum, tx) => sum + tx.amount, 0)
              .toFixed(2)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Total Credits
          </p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
            {data.transactions
              .filter((tx) => tx.type === 'credit')
              .reduce((sum, tx) => sum + tx.amount, 0)
              .toFixed(2)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400">Net</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
            {(
              data.transactions
                .filter((tx) => tx.type === 'credit')
                .reduce((sum, tx) => sum + tx.amount, 0) -
              data.transactions
                .filter((tx) => tx.type === 'debit')
                .reduce((sum, tx) => sum + tx.amount, 0)
            ).toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  )
}
