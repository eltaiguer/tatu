import { Dashboard } from '../components/Dashboard'
import type { Transaction } from '../models'

interface DashboardPageProps {
  transactions: Transaction[]
}

export function DashboardPage({ transactions }: DashboardPageProps) {
  return <Dashboard transactions={transactions} />
}
