// The import dialog's summary: what each picked file came to (#202, #275).
import { Check, CircleAlert, Info } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Button } from '../ui/button'
import type { FileType, Transaction, TransactionsFilter } from '../../models'
import { ACCOUNT_LABELS } from '../../utils/account-display'
import { monthSpanLabel } from '../../services/filters/period-label'
import {
  countReviewRows,
  reviewLink,
} from '../../services/import/import-review'

export interface ImportSummary {
  added: number
  duplicates: number
  previouslyDeleted: number
  /** Stored rows whose garbled description this import repaired (#192). */
  repaired: number
  fileType: FileType
  // The month "Ver transacciones" opens: the newest new row's, or the file's
  // newest when nothing was new.
  month: { y: number; m: number } | null
  // What the file covered, whatever was new (null: no rows).
  fileRange: { from: string; to: string } | null
  fileRows: number
  // Ids of the rows this import added: the "a revisar" count is read from the
  // stored rows with these ids, since rules, AI and transfer inference change
  // category and confidence after the import's own classification.
  addedIds: ReadonlySet<string>
}

// One line per count in the summary. A new count (e.g. corrected rows) is one
// more entry here.
function summaryLines(
  summary: ImportSummary,
  toReview: number,
  // With several files a zero says nothing and the list gets long: the
  // duplicates and previously deleted lines show only when they happened.
  hideZeros: boolean
) {
  const lines = [
    {
      count: summary.added,
      one: 'nueva',
      many: 'nuevas',
      hint: undefined,
      actionable: false,
      quiet: false,
    },
    // The file's own new rows still to review (0 says nothing is left).
    ...(summary.added > 0
      ? [
          {
            count: toReview,
            one: 'a revisar',
            many: 'a revisar',
            hint: 'sin categoría o con poca seguridad',
            // The line that asks something of the user.
            actionable: true,
            quiet: false,
          },
        ]
      : []),
    {
      count: summary.duplicates,
      one: 'duplicada omitida',
      many: 'duplicadas omitidas',
      hint: undefined,
      actionable: false,
      quiet: true,
    },
    {
      count: summary.previouslyDeleted,
      one: 'eliminada antes',
      many: 'eliminadas antes',
      hint: undefined,
      actionable: false,
      quiet: true,
    },
    // Only when it happened: most imports repair nothing.
    ...(summary.repaired > 0
      ? [
          {
            count: summary.repaired,
            one: 'corregida',
            many: 'corregidas',
            hint: undefined,
            actionable: false,
            quiet: false,
          },
        ]
      : []),
  ]
  return hideZeros ? lines.filter((l) => !(l.quiet && l.count === 0)) : lines
}

// One picked file's result: what it imported, or why it could not be.
export type FileOutcome =
  | { kind: 'imported'; fileName: string; summary: ImportSummary }
  | {
      kind: 'failed'
      fileName: string
      title: string
      message: string
    }

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many
}

// What one imported file came to: its account, its period, its counts.
function FileSummary({
  summary,
  toReview,
  fileName,
  several,
}: {
  summary: ImportSummary
  toReview: number
  fileName: string
  several: boolean
}) {
  return (
    <>
      <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
        {ACCOUNT_LABELS[summary.fileType]}
      </div>
      {summary.fileRange && (
        <p className="mt-3 text-sm text-muted-foreground">
          {monthSpanLabel(summary.fileRange.from, summary.fileRange.to)} ·{' '}
          <span className="font-mono tabular-nums">{summary.fileRows}</span>{' '}
          {plural(summary.fileRows, 'movimiento', 'movimientos')}
        </p>
      )}
      <ul
        // Each file's list needs its own name when there are several.
        aria-label={
          several
            ? `Resumen de la importación: ${fileName}`
            : 'Resumen de la importación'
        }
        className="mt-4 space-y-1 text-sm"
      >
        {summaryLines(summary, toReview, several).map(
          ({ count, one, many, hint, actionable }) => (
            <li key={many} className="flex justify-center">
              <span
                className={
                  actionable
                    ? 'rounded-full border border-[color:var(--accent)] px-2 py-px'
                    : undefined
                }
              >
                <span className="font-mono tabular-nums font-medium">
                  {count}
                </span>{' '}
                <span
                  className={
                    actionable
                      ? 'text-[color:var(--text)]'
                      : 'text-muted-foreground'
                  }
                >
                  {plural(count, one, many)}
                  {hint && ` · ${hint}`}
                </span>
              </span>
            </li>
          )
        )}
      </ul>
    </>
  )
}

export function ImportSummaryPanel({
  outcomes,
  transactions,
  headingRef,
  onImportAnother,
  onViewTransactions,
}: {
  outcomes: FileOutcome[]
  transactions: Transaction[]
  headingRef: React.RefObject<HTMLHeadingElement>
  onImportAnother: () => void
  onViewTransactions?: (filter: TransactionsFilter) => void
}) {
  const sectionId = useId()
  const several = outcomes.length > 1
  const imported = outcomes.flatMap((o) => (o.kind === 'imported' ? [o] : []))
  const failedCount = outcomes.length - imported.length
  // Nothing new is not a success: the files were most likely imported before.
  const nothingNew = imported.every(({ summary }) => summary.added === 0)
  const allFailed = imported.length === 0
  const repaired = imported.reduce((sum, o) => sum + o.summary.repaired, 0)

  // Counted live from the stored rows, through the Transacciones filter, so a
  // later transfer pairing or edit is reflected and the number is what the
  // link opens.
  const { perFile, link, linkCount } = useMemo(() => {
    const perFile = outcomes.map((outcome) =>
      outcome.kind === 'imported'
        ? countReviewRows(
            transactions,
            { review: true },
            outcome.summary.addedIds
          )
        : 0
    )
    const link = reviewLink(
      imported.flatMap(({ summary }) =>
        summary.added > 0 && summary.fileRange
          ? [{ fileType: summary.fileType, fileRange: summary.fileRange }]
          : []
      )
    )
    return {
      perFile,
      link,
      linkCount: link ? countReviewRows(transactions, link) : 0,
    }
    // `imported` is derived from `outcomes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomes, transactions])
  const toReviewTotal = perFile.reduce((sum, n) => sum + n, 0)
  // The button opens exactly `linkCount` rows; it only shows when this
  // import's own new rows have something to review.
  const reviewAction =
    onViewTransactions && link && toReviewTotal > 0 && linkCount > 0
      ? () => onViewTransactions(link)
      : undefined
  // "Ver transacciones" opens the newest month among the files that added
  // rows; only when nothing was new, among all of them.
  const monthSources = imported.some(({ summary }) => summary.added > 0)
    ? imported.filter(({ summary }) => summary.added > 0)
    : imported
  const viewMonth = monthSources
    .flatMap(({ summary }) => (summary.month ? [summary.month] : []))
    .reduce<{
      y: number
      m: number
    } | null>(
      (newest, month) =>
        !newest || month.y * 12 + month.m > newest.y * 12 + newest.m
          ? month
          : newest,
      null
    )
  const viewAction = onViewTransactions
    ? () =>
        onViewTransactions(
          viewMonth ? { period: { mode: 'month', ...viewMonth } } : {}
        )
    : undefined

  const heading = allFailed
    ? 'No se pudieron importar los archivos'
    : nothingNew
      ? 'No había movimientos nuevos'
      : 'Importación completada'

  return (
    <div className="text-center py-8 sm:py-12">
      <div className="flex flex-col items-center gap-4">
        {allFailed ? (
          <div className="p-4 rounded-full bg-neg-soft">
            <CircleAlert className="text-destructive" size={48} />
          </div>
        ) : nothingNew ? (
          <div className="p-4 rounded-full bg-muted">
            <Info className="text-muted-foreground" size={48} />
          </div>
        ) : (
          <div className="p-4 rounded-full bg-pos-soft">
            <Check className="text-pos" size={48} />
          </div>
        )}
        <div className="w-full">
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="font-medium mb-1 outline-none"
          >
            {heading}
          </h3>
          {!allFailed && nothingNew && failedCount === 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              {several
                ? 'Estos archivos ya estaban importados.'
                : 'Este archivo ya estaba importado.'}
            </p>
          )}
          {nothingNew && repaired > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              {repaired === 1
                ? 'Se corrigió 1 descripción.'
                : `Se corrigieron ${repaired} descripciones.`}
            </p>
          )}
          {several && failedCount > 0 && !allFailed && (
            <p className="text-sm text-muted-foreground mb-1">
              <span className="font-mono tabular-nums">{failedCount}</span>{' '}
              {failedCount === 1
                ? 'archivo no se pudo importar.'
                : 'archivos no se pudieron importar.'}
            </p>
          )}
          {outcomes.map((outcome, index) => {
            const body =
              outcome.kind === 'imported' ? (
                <FileSummary
                  summary={outcome.summary}
                  toReview={perFile[index]}
                  fileName={outcome.fileName}
                  several={several}
                />
              ) : (
                <>
                  <p className="text-sm font-medium">{outcome.title}</p>
                  <p className="text-sm text-destructive">{outcome.message}</p>
                </>
              )
            // One file reads as it always did; several get a section each.
            return several ? (
              <section
                key={index}
                aria-labelledby={`${sectionId}-${index}`}
                className="mt-6 border-t border-border pt-4 first:mt-4"
              >
                <h4
                  id={`${sectionId}-${index}`}
                  className="mb-2 break-all text-sm font-medium"
                >
                  {outcome.fileName}
                </h4>
                {body}
              </section>
            ) : (
              <div key={index}>
                <p className="text-sm text-muted-foreground mb-4 break-all">
                  {outcome.fileName}
                </p>
                {body}
              </div>
            )
          })}
        </div>
        {/* Stays at the bottom of the dialog while a long summary scrolls. */}
        <div className="sticky bottom-[-1.5rem] z-10 -mb-8 flex w-full flex-col-reverse justify-center gap-3 bg-card pt-4 pb-6 sm:flex-row">
          <Button
            onClick={onImportAnother}
            variant={nothingNew || !onViewTransactions ? 'default' : 'outline'}
          >
            Importar otro archivo
          </Button>
          {viewAction && !allFailed && (
            <Button
              onClick={viewAction}
              variant={nothingNew || reviewAction ? 'outline' : 'default'}
            >
              Ver transacciones
            </Button>
          )}
          {reviewAction && (
            <Button onClick={reviewAction}>
              Revisar{' '}
              <span className="font-mono tabular-nums">{linkCount}</span>{' '}
              {plural(linkCount, 'movimiento', 'movimientos')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
