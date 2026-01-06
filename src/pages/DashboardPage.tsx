import { Dashboard } from "../components/Dashboard"
import { type Transaction } from "../utils/data"

interface DashboardPageProps {
  transactions: Transaction[]
}

export function DashboardPage({ transactions }: DashboardPageProps) {
  return <Dashboard transactions={transactions} />
}
