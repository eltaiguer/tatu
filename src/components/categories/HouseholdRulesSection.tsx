import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Trash } from 'lucide-react'
import { Section } from '../ui/section'
import type { Transaction } from '../../models'
import { useHouseholdRuleRecords } from '../../hooks/useHouseholdRules'
import { rowsReachedByMerchantKey } from '../../services/household/household'
import {
  deleteHouseholdRuleWithSync,
  restoreHouseholdRuleWithSync,
} from '../../services/household/household-rules-store'
import {
  requireRepository,
  type Repository,
} from '../../services/repository/repository'
import { userErrorMessage } from '../../utils/user-error'

interface HouseholdRulesSectionProps {
  transactions: Transaction[]
  // The signed-in user's repository: deleting and restoring save through it.
  repository?: Repository | null
}

// "Reglas del hogar": the merchants the user told Tatu are (or are not)
// household expenses, each with how many rows it reaches and a delete with
// undo. Reads the rules from the store itself, so a rule saved from
// Transacciones shows without a remount.
export function HouseholdRulesSection({
  transactions,
  repository,
}: HouseholdRulesSectionProps) {
  const records = useHouseholdRuleRecords()
  // Rules whose delete is in flight (their button is disabled).
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set())

  // Rows each rule reaches: the same list as the "Aplicar a las N similares"
  // toast. Memoized on the data, not on the in-flight set.
  const reached = useMemo(
    () =>
      new Map(
        records.map((rule) => [
          rule.merchantNormalized,
          rowsReachedByMerchantKey(transactions, rule.merchantNormalized)
            .length,
        ])
      ),
    [transactions, records]
  )

  async function handleDelete(key: string) {
    setDeleting((current) => new Set(current).add(key))
    try {
      const repo = requireRepository(repository)
      const removed = await deleteHouseholdRuleWithSync(repo, key)
      if (!removed) return
      toast('Regla eliminada', {
        duration: 8000,
        action: {
          label: 'Deshacer',
          onClick: () => {
            void toast.promise(restoreHouseholdRuleWithSync(repo, removed), {
              loading: 'Restaurando…',
              success: 'Regla restaurada',
              error: (error) =>
                userErrorMessage(error, 'No se pudo deshacer la eliminación'),
            })
          },
        },
      })
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudo eliminar la regla'))
    } finally {
      setDeleting((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  return (
    <Section title="Reglas del hogar">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-[24px] py-[20px]">
        <p className="mb-[16px] text-[13px] text-[var(--text-muted)]">
          Comercios para los que recordaste si son gastos del hogar.
        </p>

        {records.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
            {records.map((rule) => {
              const name = rule.merchantOriginal ?? rule.merchantNormalized
              const count = reached.get(rule.merchantNormalized) ?? 0
              return (
                <li
                  key={rule.merchantNormalized}
                  className="flex items-center gap-[10px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-[12px] py-[8px]"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[10px] gap-y-[2px]">
                    <span
                      title={name}
                      className="min-w-0 max-w-full truncate font-mono text-[12px]"
                    >
                      {name}
                    </span>
                    <span className="text-[12px] whitespace-nowrap text-[var(--text-muted)]">
                      {rule.isHousehold ? 'Hogar: Sí' : 'Hogar: No'}
                    </span>
                    <span className="text-[12px] whitespace-nowrap text-[var(--text-muted)]">
                      {count} {count === 1 ? 'transacción' : 'transacciones'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDelete(rule.merchantNormalized)
                    }}
                    disabled={deleting.has(rule.merchantNormalized)}
                    aria-label={`Eliminar regla del hogar ${name}`}
                    className="grid shrink-0 cursor-pointer place-items-center rounded-[6px] border-none bg-none p-[4px] text-[var(--neg)] disabled:cursor-default disabled:opacity-50"
                  >
                    <Trash size={13} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-[16px] text-center text-[13px] text-[var(--text-faint)]">
            Todavía no hay reglas del hogar. Se crean desde una transacción,
            cuando elegís Hogar para todas las de un comercio.
          </p>
        )}
      </div>
    </Section>
  )
}
