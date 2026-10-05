import { useState } from 'react'
import { Loader2, SearchCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { Currency, Transaction } from '../../models'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  findPossibleDuplicates,
  type DuplicateGroup,
  type DuplicateScan,
} from '../../services/dedup/duplicate-review'
import { sumCountedTotals } from '../../services/spending/spending-rules'
import type { DeleteResult } from '../../services/mutations/transaction-mutations'
import { formatCurrency, formatDate } from '../../utils/formatting'
import { PartialWriteError, userErrorMessage } from '../../utils/user-error'

export interface DuplicatesReviewProps {
  transactions: Transaction[]
  homeCurrency: Currency
  fxRate: number
  onBulkDelete: (transactionIds: string[]) => Promise<DeleteResult>
  onRestoreTransactions: (
    transactions: Transaction[]
  ) => Promise<{ restored: number }>
}

function txDone(count: number, participleStem: string): string {
  return count === 1
    ? `1 transacción ${participleStem}a`
    : `${count} transacciones ${participleStem}as`
}

function copies(count: number): string {
  return count === 1 ? '1 copia' : `${count} copias`
}

const rowName = (tx: Transaction) => tx.displayDescription || tx.description

/**
 * Configuración → Datos: the one-off "Buscar posibles duplicados" tool
 * (#167). Scans the history once when opened (`findPossibleDuplicates`),
 * pre-selects the copies the grouping rule says to drop, and deletes what
 * the user confirms through the normal soft delete, with "Deshacer". A
 * deleted copy keeps its fingerprint, so a later re-import of the same rows
 * skips them (#57).
 */
export function DuplicatesReview({
  transactions,
  homeCurrency,
  fxRate,
  onBulkDelete,
  onRestoreTransactions,
}: DuplicatesReviewProps) {
  const [scan, setScan] = useState<DuplicateScan | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  function open() {
    const next = findPossibleDuplicates(transactions)
    setScan(next)
    setSelected(new Set(next.flagged.flatMap((group) => group.preselected)))
  }

  function close() {
    if (deleting) return
    setScan(null)
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectedRows = scan
    ? [...scan.flagged, ...scan.unknownOrigin]
        .flatMap((group) => group.rows)
        .filter((tx) => selected.has(tx.id))
    : []
  const inflation = sumCountedTotals(selectedRows, homeCurrency, fxRate).expense
  const empty =
    scan !== null &&
    scan.flagged.length === 0 &&
    scan.unknownOrigin.length === 0

  function reportDeleted(result: DeleteResult) {
    const message = txDone(result.removed.length, 'eliminad')
    if (!result.reversible) {
      toast.success(message)
      return
    }
    toast(message, {
      duration: 8000,
      action: {
        label: 'Deshacer',
        onClick: () => {
          toast.promise(onRestoreTransactions(result.removed), {
            loading: 'Restaurando…',
            success: ({ restored }) => txDone(restored, 'restaurad'),
            error: (error) =>
              userErrorMessage(error, 'No se pudo deshacer la eliminación'),
          })
        },
      },
    })
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      reportDeleted(await onBulkDelete(selectedRows.map((tx) => tx.id)))
      setScan(null)
    } catch (error) {
      if (error instanceof PartialWriteError) {
        // Some copies were deleted (and left the list): they keep their undo.
        const result = error.result as DeleteResult | undefined
        if (result && result.removed.length > 0) reportDeleted(result)
        setScan(null)
      }
      toast.error(
        userErrorMessage(error, 'No se pudieron eliminar los duplicados')
      )
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-[24px] border-b border-[var(--border)] px-[24px] py-[16px]">
        <div>
          <div className="text-body font-semibold text-[var(--text)]">
            Buscar posibles duplicados
          </div>
          <div className="mt-[2px] text-label text-[var(--text-muted)]">
            Movimientos que quedaron repetidos al importar archivos que se
            superponían
          </div>
        </div>
        <Button
          variant="outline"
          onClick={open}
          className="flex shrink-0 items-center gap-[6px] text-small leading-[1.428571]"
        >
          <SearchCheck size={14} />
          Buscar duplicados
        </Button>
      </div>

      <Dialog open={scan !== null} onOpenChange={(next) => !next && close()}>
        <DialogContent className="flex max-h-[min(720px,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-[640px]">
          <DialogHeader className="border-b border-[var(--border)] px-[24px] pt-[24px] pb-[16px]">
            <DialogTitle>Posibles duplicados</DialogTitle>
            <DialogDescription>
              {empty
                ? 'Revisamos todas tus transacciones.'
                : 'Revisá las copias marcadas antes de eliminarlas. Podés deshacerlo después.'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-[24px] py-[16px]">
            {empty && (
              <div className="py-[24px] text-center">
                <p className="mb-[6px] text-body font-semibold">
                  No encontramos posibles duplicados
                </p>
                <p className="mx-auto my-0 max-w-[360px] text-small text-[var(--text-muted)]">
                  Ningún movimiento aparece en más de un archivo importado.
                </p>
              </div>
            )}
            {scan && scan.flagged.length > 0 && (
              <GroupSection
                title="Importadas más de una vez"
                hint="El mismo movimiento aparece en archivos distintos que importaste. Marcamos todas las copias menos la más antigua."
                groups={scan.flagged}
                selected={selected}
                onToggle={toggle}
                disabled={deleting}
              />
            )}
            {scan && scan.unknownOrigin.length > 0 && (
              <GroupSection
                title="No sabemos de qué archivo vienen"
                hint="Se importaron antes de que Tatú guardara de qué archivo viene cada movimiento. Pueden ser duplicados o dos compras iguales el mismo día: marcá solo las que sobren."
                groups={scan.unknownOrigin}
                selected={selected}
                onToggle={toggle}
                disabled={deleting}
              />
            )}
          </div>

          <DialogFooter className="items-center border-t border-[var(--border)] px-[24px] py-[16px] sm:justify-between">
            {empty ? (
              <Button variant="outline" onClick={close} className="ml-auto">
                Cerrar
              </Button>
            ) : (
              <>
                <p
                  className="m-0 text-small text-[var(--text-muted)]"
                  aria-live="polite"
                >
                  {inflation > 0 && (
                    <>
                      Estas copias suman{' '}
                      <span className="amt font-mono font-semibold tabular-nums text-[var(--text)]">
                        {formatCurrency(inflation, homeCurrency)}
                      </span>{' '}
                      a tus gastos
                    </>
                  )}
                </p>
                <div className="flex w-full flex-col-reverse gap-[8px] sm:w-auto sm:flex-row">
                  <Button variant="outline" onClick={close} disabled={deleting}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void handleDelete()}
                    disabled={deleting || selectedRows.length === 0}
                  >
                    {deleting && <Loader2 size={14} className="animate-spin" />}
                    Eliminar {copies(selectedRows.length)}
                  </Button>
                </div>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function GroupSection({
  title,
  hint,
  groups,
  selected,
  onToggle,
  disabled,
}: {
  title: string
  hint: string
  groups: DuplicateGroup[]
  selected: ReadonlySet<string>
  onToggle: (id: string, checked: boolean) => void
  disabled: boolean
}) {
  return (
    <section className="mb-[20px] last:mb-0">
      <h3 className="m-0 text-body font-semibold text-[var(--text)]">
        {title}
      </h3>
      <p className="mt-[2px] mb-[12px] text-label text-[var(--text-muted)]">
        {hint}
      </p>
      <ul className="m-0 flex list-none flex-col gap-[10px] p-0">
        {groups.map((group) => {
          const first = group.rows[0]
          return (
            <li
              key={group.rows.map((tx) => tx.id).join('|')}
              className="rounded-[10px] border border-[var(--border)] px-[14px] py-[12px]"
            >
              <div className="mb-[8px] flex items-baseline justify-between gap-[12px]">
                <div className="min-w-0">
                  <div className="truncate text-small font-semibold text-[var(--text)]">
                    {rowName(first)}
                  </div>
                  <div className="text-label text-[var(--text-muted)]">
                    {formatDate(first.date)}
                  </div>
                </div>
                <span className="amt shrink-0 font-mono text-small tabular-nums text-[var(--text)]">
                  {first.type === 'debit' ? '−' : '+'}
                  {formatCurrency(first.amount, first.currency)}
                </span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
                {group.rows.map((tx) => {
                  const imported = tx.createdAt
                    ? `importada el ${formatDate(tx.createdAt)}`
                    : 'importada recién'
                  const id = `dup-${tx.id}`
                  return (
                    <li key={tx.id} className="flex items-center gap-[10px]">
                      <Checkbox
                        id={id}
                        checked={selected.has(tx.id)}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          onToggle(tx.id, checked === true)
                        }
                        aria-label={`Eliminar la copia de ${rowName(tx)} ${imported}`}
                      />
                      <label
                        htmlFor={id}
                        className="cursor-pointer text-small text-[var(--text-muted)]"
                      >
                        Copia {imported}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
