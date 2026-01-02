import type { ParsedData } from '../models'
import { ParsedDataDisplay } from '../components/ParsedDataDisplay'

interface TransactionsPageProps {
  data: ParsedData
  onReset: () => void
  onCategoryChange: (transactionId: string, category: string) => void
}

export function TransactionsPage({
  data,
  onReset,
  onCategoryChange,
}: TransactionsPageProps) {
  return (
    <ParsedDataDisplay
      data={data}
      onReset={onReset}
      onCategoryChange={onCategoryChange}
      activeSection="transactions"
      showOnlyActiveSection
    />
  )
}
