import { CreditCard, Wallet } from 'lucide-react'
import { ACCOUNT_SHORT_LABELS, accountOf } from '../../utils/account-display'

export function getAccountIcon(type: string) {
  if (type === 'credit_card') return <CreditCard size={14} />
  return <Wallet size={14} />
}

// Which of the three Santander accounts a row came from. A bank account is
// identified by its currency (USD and $U are separate accounts).
export function getAccountLabel(source: string, currency: string): string {
  return ACCOUNT_SHORT_LABELS[accountOf(source, currency)]
}

// Flags a category worth a second look (none, or a low-confidence automatic
// one). The explanation is in the accessible name, not only a tooltip.
export function ReviewMarker() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-[color:var(--accent)] px-1.5 py-px text-caption font-semibold text-[color:var(--text)]"
      title="Categoría sin asignar o asignada automáticamente con poca seguridad"
    >
      Revisar
      <span className="sr-only">
        : categoría sin asignar o asignada automáticamente con poca seguridad
      </span>
    </span>
  )
}
