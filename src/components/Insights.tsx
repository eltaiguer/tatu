import { useMemo, useState } from 'react'
import { PageHeader } from './ui/page-header'
import {
  Sparkles,
  TrendingDown,
  Scissors,
  Repeat,
  LineChart,
  AlertTriangle,
  RefreshCw,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { InsightCard } from './insights/InsightCard'
import { useMutationFeedback } from './transactions/useMutationFeedback'
import { HouseholdModeToggle } from './dashboard/HouseholdModeToggle'
import { NoHouseholdState } from './dashboard/EmptyStates'
import { todayAsUtcDate, toMonthKey } from '../utils/date-utils'
import type { Currency, Transaction, TransactionsFilter } from '../models'
import type { TransactionsProps } from './transactions/transactions-props'
import type { Repository } from '../services/repository/repository'
import type { ClaudeClient } from '../services/ai/claude-client'
import { householdExpenses } from '../services/household/household'
import { householdMarkedToast } from '../services/household/household-copy'
import {
  buildInsightActionIndex,
  insightActions,
} from '../services/insights/insight-actions'
import { useHouseholdRules } from '../hooks/useHouseholdRules'
import {
  buildInsightInput,
  type InsightsMode,
} from '../services/insights/insight-data'
import type {
  Insight,
  InsightSeverity,
  InsightType,
} from '../services/insights/insight-generator'
import { useInsightsByMode } from './insights/useInsightsByMode'

const NO_ROWS: Transaction[] = []

interface InsightsProps {
  transactions: Transaction[]
  homeCurrency: Currency
  fxRate: number
  /** The signed-in user's repository: the insights cache lives there. */
  repository: Repository
  aiEnabled: boolean
  claudeApiKey: string
  onNavigateToTransactions: (filter: TransactionsFilter) => void
  onNavigateToSettings: () => void
  onNavigateToImport?: () => void
  /** Hogar mode (`/insights?hogar=si`, owned by App): the household's rows only. */
  householdMode?: boolean
  onHouseholdModeChange?: (householdMode: boolean) => void
  onNavigateToCategories?: () => void
  /** Recurring cards' "Marcar como hogar" (Todo): the merchant's household rule. */
  onApplyHouseholdToSimilar?: TransactionsProps['onApplyHouseholdToSimilar']
  /** Tests hand in a fake; the app builds the real one from the key. */
  claudeClient?: ClaudeClient
}

const TYPE_ORDER: InsightType[] = [
  'bleeding_money',
  'easiest_cut',
  'recurring',
  'trend',
  'anomaly',
]

const TYPE_META: Record<
  InsightType,
  { label: string; icon: typeof TrendingDown }
> = {
  bleeding_money: { label: '¿Dónde se fue tu dinero?', icon: TrendingDown },
  easiest_cut: { label: 'Fácil de recortar', icon: Scissors },
  recurring: { label: 'Suscripciones y cargos recurrentes', icon: Repeat },
  trend: { label: 'Tendencias', icon: LineChart },
  anomaly: { label: 'Anomalías', icon: AlertTriangle },
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function groupAndSortInsights(
  insights: Insight[]
): Array<{ type: InsightType; items: Insight[] }> {
  const byType = new Map<InsightType, Insight[]>()
  insights.forEach((insight) => {
    const list = byType.get(insight.type) ?? []
    list.push(insight)
    byType.set(insight.type, list)
  })

  return TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
    type,
    items: [...(byType.get(type) ?? [])].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    ),
  }))
}

export function Insights({
  transactions,
  homeCurrency,
  fxRate,
  repository,
  aiEnabled,
  claudeApiKey,
  onNavigateToTransactions,
  onNavigateToSettings,
  onNavigateToImport,
  householdMode = false,
  onHouseholdModeChange,
  onNavigateToCategories,
  onApplyHouseholdToSimilar,
  claudeClient,
}: InsightsProps) {
  // Todo and Hogar are two analyses with their own cache row and their own
  // state (ADR-0005; see useInsightsByMode).
  const mode: InsightsMode = householdMode ? 'hogar' : 'todo'
  const isConfigured = aiEnabled && Boolean(claudeApiKey)
  const hasTransactions = transactions.length > 0

  // Hogar's rows: the ones that resolve to household. The rules come through
  // the hook so a merchant rule alone changes them. Todo never looks at them,
  // so a rule never rebuilds Todo's input.
  const householdRules = useHouseholdRules()
  const householdRows = useMemo(
    () =>
      householdMode ? householdExpenses(transactions, householdRules) : NO_ROWS,
    [householdMode, transactions, householdRules]
  )
  const noHouseholdSpend = householdMode && householdRows.length === 0
  const hasRows = householdMode ? !noHouseholdSpend : hasTransactions

  // Today's month, as on Resumen: the comparison reads the clock, so both
  // inputs rebuild when it rolls over (a month can become complete on the 1st
  // with no data change). `now` is passed so the memos depend on what they read.
  const currentMonth = toMonthKey(todayAsUtcDate())

  const todoInput = useMemo(
    () =>
      buildInsightInput(transactions, homeCurrency, fxRate, {
        now: new Date(),
      }),
    // currentMonth: the clock decides the month in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, homeCurrency, fxRate, currentMonth]
  )
  const householdInput = useMemo(
    () =>
      householdMode && householdRows.length > 0
        ? buildInsightInput(householdRows, homeCurrency, fxRate, {
            scope: 'hogar',
            // The imports' months and end, not the household rows'.
            coverage: transactions,
            now: new Date(),
          })
        : null,
    // currentMonth: the clock decides the month in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      householdMode,
      householdRows,
      transactions,
      homeCurrency,
      fxRate,
      currentMonth,
    ]
  )
  const input = householdMode ? householdInput : todoInput

  const { cached, lookedUp, generating, error, generate } = useInsightsByMode({
    repository,
    mode,
    input: hasRows ? input : null,
    isConfigured,
    claudeApiKey,
    claudeClient,
  })
  const handleGenerate = generate

  const groups = useMemo(
    () => groupAndSortInsights(cached?.result.insights ?? []),
    [cached]
  )

  const actionIndex = useMemo(
    () =>
      buildInsightActionIndex({
        rows: householdMode ? householdRows : transactions,
        all: transactions,
        householdMode,
        householdRules,
        homeCurrency,
        fxRate,
      }),
    [
      householdMode,
      householdRows,
      transactions,
      householdRules,
      homeCurrency,
      fxRate,
    ]
  )

  // Each card's actions, decided once per cache result / data change rather
  // than on every render (a write in flight re-renders the list).
  const actionsByInsight = useMemo(
    () =>
      new Map(
        (cached?.result.insights ?? []).map((insight) => [
          insight,
          insightActions(insight, actionIndex),
        ])
      ),
    [cached, actionIndex]
  )

  // Every card whose "Marcar como hogar" write is in flight.
  const [markingKeys, setMarkingKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const { reportError } = useMutationFeedback({})
  function setMarking(key: string, on: boolean) {
    setMarkingKeys((current) => {
      const next = new Set(current)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }
  // One write saves one rule, so a merchant spanning several rule keys is
  // marked one anchor after another, with one toast for the summed count.
  async function markHousehold(
    key: string,
    merchant: string,
    transactionIds: string[]
  ) {
    if (!onApplyHouseholdToSimilar) return
    setMarking(key, true)
    try {
      let affected = 0
      for (const id of transactionIds) {
        affected += (await onApplyHouseholdToSimilar(id, true)).affected
      }
      toast.success(householdMarkedToast(merchant, affected))
    } catch (markError) {
      reportError(markError, 'No se pudo marcar como hogar')
    } finally {
      setMarking(key, false)
    }
  }

  return (
    <div className="flex flex-col gap-[24px]">
      <PageHeader
        icon={
          <Sparkles
            size={22}
            className="text-[var(--accent)]"
            aria-hidden="true"
          />
        }
        title="Insights"
        subtitle={
          householdMode
            ? 'Solo los gastos del hogar — lo que revisan juntos, toda la historia.'
            : '¿Dónde se fue tu dinero? ¿Cómo podés gastar menos? — toda tu historia, de un vistazo.'
        }
        actions={
          hasTransactions &&
          onHouseholdModeChange && (
            <HouseholdModeToggle
              householdMode={householdMode}
              onChange={onHouseholdModeChange}
            />
          )
        }
      />

      {error && (
        <p role="alert" className="text-[13px] text-[var(--neg)]">
          {error}
        </p>
      )}

      {hasTransactions && noHouseholdSpend && (
        <NoHouseholdState onNavigateToCategories={onNavigateToCategories} />
      )}

      {!hasTransactions && (
        <Card className="p-8 text-center space-y-4 items-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">Importá tus movimientos primero</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Los insights se generan a partir de tu historial de transacciones.
              Importá un extracto para empezar.
            </p>
          </div>
          {onNavigateToImport && (
            <Button onClick={onNavigateToImport}>
              <Upload size={16} />
              Importar CSV
            </Button>
          )}
        </Card>
      )}

      {hasRows && !isConfigured && (
        <Card className="p-8 text-center space-y-4 items-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">Activá la IA para ver insights</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Los insights usan tu clave de Claude configurada en Configuración
              para analizar todo tu historial de gastos.
            </p>
          </div>
          <Button onClick={onNavigateToSettings}>Ir a Configuración</Button>
        </Card>
      )}

      {hasRows && isConfigured && lookedUp && !cached && (
        <Card className="p-8 text-center space-y-4 items-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">
              {householdMode
                ? 'Generá los insights del hogar'
                : 'Generá tus primeros insights'}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {householdMode
                ? 'Analizamos las categorías, comercios y cargos recurrentes de los gastos del hogar para mostrarte dónde se va la plata de la casa.'
                : 'Analizamos todas tus categorías, comercios y cargos recurrentes para mostrarte dónde se fue tu dinero.'}
            </p>
            <p className="text-muted-foreground max-w-md mx-auto mt-2 text-xs">
              Se envían a Anthropic tus totales por categoría y comercio, usando
              tu clave API. El costo de uso corre por tu cuenta.
            </p>
          </div>
          <Button onClick={() => void handleGenerate()} disabled={generating}>
            <Sparkles size={16} />
            {generating ? 'Generando…' : 'Generar insights'}
          </Button>
        </Card>
      )}

      {hasRows && isConfigured && cached && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <p className="m-0 text-[12px] text-[var(--text-faint)]">
              Generado el{' '}
              {new Date(cached.generatedAt).toLocaleString('es-UY', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <Button
              variant={cached.isStale ? 'default' : 'outline'}
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={generating}
            >
              <RefreshCw size={14} />
              {generating ? 'Regenerando…' : 'Regenerar'}
            </Button>
          </div>

          {cached.isStale && (
            <Card className="p-4 border-[var(--accent)] bg-[var(--accent-soft)]">
              <p className="m-0 text-[13px]">
                {householdMode
                  ? 'Desde la última vez que generaste los insights del hogar cambiaron tus gastos del hogar o se completó un mes.'
                  : 'Desde la última vez que generaste insights cambiaron tus transacciones o se completó un mes.'}{' '}
                Los insights pueden estar desactualizados.
              </p>
            </Card>
          )}

          {groups.length === 0 && (
            <Card className="p-6 text-center">
              <p className="m-0 text-muted-foreground">
                No encontramos patrones destacados en tu historial.
              </p>
            </Card>
          )}

          {groups.map((group) => {
            const meta = TYPE_META[group.type]
            const Icon = meta.icon
            return (
              <div key={group.type}>
                <h3 className="mb-[12px] flex items-center gap-[8px] text-[14px] font-semibold">
                  <Icon
                    size={16}
                    className="text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                  {meta.label}
                </h3>
                <div className="flex flex-col gap-[10px]">
                  {group.items.map((insight, i) => {
                    const key = `${group.type}-${i}`
                    const actions = actionsByInsight.get(insight)
                    if (!actions) return null
                    const offer =
                      actions.household?.state === 'offer'
                        ? actions.household
                        : null
                    return (
                      <InsightCard
                        key={key}
                        insight={insight}
                        actions={actions}
                        onDrill={onNavigateToTransactions}
                        onMarkHousehold={
                          offer && onApplyHouseholdToSimilar
                            ? () =>
                                void markHousehold(
                                  key,
                                  actions.merchantLabel ??
                                    insight.merchant ??
                                    '',
                                  offer.transactionIds
                                )
                            : undefined
                        }
                        marking={markingKeys.has(key)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
