import type { ParsedData } from '../models'
import { ParsedDataDisplay } from '../components/ParsedDataDisplay'

interface DashboardPageProps {
  data: ParsedData
  onReset: () => void
  onCategoryChange: (transactionId: string, category: string) => void
}

export function DashboardPage({
  data,
  onReset,
  onCategoryChange,
}: DashboardPageProps) {
  return (
    <ParsedDataDisplay
      data={data}
      onReset={onReset}
      onCategoryChange={onCategoryChange}
      activeSection="dashboard"
      showOnlyActiveSection
    />
  )
}
