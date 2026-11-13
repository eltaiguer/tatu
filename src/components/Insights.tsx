import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { Card } from './ui/card'
import { Button } from './ui/button'
import { CategoryBadge } from './CategoryBadge'
import { HouseholdModeToggle } from './dashboard/HouseholdModeToggle'
import { NoHouseholdState } from './dashboard/EmptyStates'
import { UndefinedHouseholdNote } from './insights/UndefinedHouseholdNote'
import { formatCurrency } from '../utils/formatting'
import type { Currency, Transaction, TransactionsFilter } from '../models'
import type {
  InsightsMode,
  Repository,
} from '../services/repository/repository'
import type { ClaudeClient } from '../services/ai/claude-client'
import { partitionByHousehold } from '../services/household/household'
import { sumCountedTotals } from '../services/spending/spending-rules'
import { useHouseholdRules } from '../hooks/useHouseholdRules'
import { buildInsightInput } from '../services/insights/insight-data'
import {
  generateInsights,
  type Insight,
  type InsightSeverity,
  type InsightType,
} from '../services/insights/insight-generator'
import {
  getCachedInsights,
  saveCachedInsights,
  type CachedInsightsLookup,
} from '../services/insights/insight-cache'
import { INSIGHTS_MODEL } from '../services/ai/models'
import {
  aiErrorMessage,
  reportAiError,
  userErrorMessage,
} from '../utils/user-error'

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
const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  high: 'var(--neg)',
  medium: 'var(--accent)',
  low: 'var(--text-faint)',
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
  claudeClient,
}: InsightsProps) {
  // Todo and Hogar are two analyses with their own cache row (ADR-0005). The
  // lookup, a running generation and an error each belong to the mode they
  // started in, so switching mode never shows or saves one in the other.
  const mode: InsightsMode = householdMode ? 'hogar' : 'todo'
  const [lookup, setLookup] = useState<{
    mode: InsightsMode
    value: CachedInsightsLookup | null
  } | null>(null)
  const [loadingCache, setLoadingCache] = useState(true)
  const [generatingModes, setGeneratingModes] = useState<
    ReadonlySet<InsightsMode>
  >(new Set())
  const [errorState, setErrorState] = useState<{
    mode: InsightsMode
    message: string
  } | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  const cached = lookup?.mode === mode ? lookup.value : null
  const generating = generatingModes.has(mode)
  const error = errorState?.mode === mode ? errorState.message : ''
  const setError = useCallback(
    (message: string, forMode: InsightsMode = modeRef.current) =>
      setErrorState(message ? { mode: forMode, message } : null),
    []
  )

  const isConfigured = aiEnabled && Boolean(claudeApiKey)
  const hasTransactions = transactions.length > 0

  // Hogar's rows: the ones that resolve to household; Sin definir apart. The
  // rules come through the hook so a merchant rule alone changes them.
  const householdRules = useHouseholdRules()
  const { household: householdRows, unassigned: unassignedRows } = useMemo(
    () => partitionByHousehold(transactions, householdRules),
    [transactions, householdRules]
  )
  const noHouseholdSpend = householdMode && householdRows.length === 0
  const hasRows = householdMode ? !noHouseholdSpend : hasTransactions

  const input = useMemo(
    () =>
      householdMode
        ? buildInsightInput(householdRows, homeCurrency, fxRate, {
            scope: 'hogar',
          })
        : buildInsightInput(transactions, homeCurrency, fxRate),
    [householdMode, householdRows, transactions, homeCurrency, fxRate]
  )

  const unassigned = useMemo(
    () => ({
      count: unassignedRows.length,
      total: sumCountedTotals(unassignedRows, homeCurrency, fxRate).expense,
    }),
    [unassignedRows, homeCurrency, fxRate]
  )

  useEffect(() => {
    if (!isConfigured || !hasRows) {
      setLoadingCache(false)
      setLookup({ mode, value: null })
      return
    }

    let cancelled = false
    setLoadingCache(true)
    setError('')

    getCachedInsights(repository, input)
      .then((result) => {
        if (!cancelled) setLookup({ mode, value: result })
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            userErrorMessage(
              e,
              'No se pudieron cargar los insights',
              'insights'
            )
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCache(false)
      })

    return () => {
      cancelled = true
    }
  }, [repository, input, isConfigured, hasRows, mode, setError])

  function setGenerating(forMode: InsightsMode, on: boolean) {
    setGeneratingModes((current) => {
      const next = new Set(current)
      if (on) next.add(forMode)
      else next.delete(forMode)
      return next
    })
  }

  async function handleGenerate() {
    // This run belongs to the mode and input it started with.
    const startedMode = mode
    const startedInput = input
    setGenerating(startedMode, true)
    setError('', startedMode)
    let step: 'generate' | 'save' = 'generate'
    try {
      const result = await generateInsights(
        startedInput,
        claudeApiKey,
        ...(claudeClient ? [claudeClient] : [])
      )
      // Shown even if saving fails: it was generated (and paid for) — but
      // only where it was generated: another mode has its own cards.
      if (modeRef.current === startedMode) {
        setLookup({
          mode: startedMode,
          value: {
            result,
            model: INSIGHTS_MODEL,
            generatedAt: new Date().toISOString(),
            isStale: false,
          },
        })
      }
      step = 'save'
      await saveCachedInsights(repository, startedInput, result, INSIGHTS_MODEL)
    } catch (e) {
      if (step === 'generate') {
        reportAiError(e, 'insights')
        setError(
          `No se pudieron generar los insights: ${aiErrorMessage(e)}`,
          startedMode
        )
      } else {
        setError(
          userErrorMessage(
            e,
            'No se pudieron guardar los insights',
            'insights'
          ),
          startedMode
        )
      }
    } finally {
      setGenerating(startedMode, false)
    }
  }

  const groups = useMemo(
    () => groupAndSortInsights(cached?.result.insights ?? []),
    [cached]
  )
  // The lookup of the other mode is on screen until this one's answer lands:
  // show no state of its own meanwhile.
  const lookedUp = lookup?.mode === mode && !loadingCache

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

      {householdMode && hasTransactions && unassigned.count > 0 && (
        <UndefinedHouseholdNote
          total={unassigned.total}
          count={unassigned.count}
          homeCurrency={homeCurrency}
          onNavigateToTransactions={onNavigateToTransactions}
        />
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
              variant="outline"
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
                  ? 'Tus gastos del hogar cambiaron desde la última vez que generaste los insights del hogar.'
                  : 'Tus transacciones cambiaron desde la última vez que generaste insights.'}{' '}
                Los que ves abajo pueden estar desactualizados —{' '}
                <button
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                  className="cursor-pointer border-none bg-transparent p-0 font-semibold text-[var(--brand-text)] underline"
                >
                  regenerar ahora
                </button>
                .
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
                  {group.items.map((insight, i) => (
                    <Card
                      key={`${group.type}-${i}`}
                      className="p-4"
                      style={{
                        borderLeft: `3px solid ${SEVERITY_COLOR[insight.severity]}`,
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-[12px]">
                        <div className="min-w-[200px] flex-1">
                          <p className="mx-0 mt-0 mb-[4px] text-[14px] font-semibold">
                            {insight.title}
                          </p>
                          <p className="m-0 text-[13px] text-muted-foreground">
                            {insight.narrative}
                          </p>
                          {insight.category && (
                            <div className="mt-[8px]">
                              <CategoryBadge
                                categoryId={insight.category}
                                size="sm"
                              />
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {typeof insight.amount === 'number' && (
                            <p className="m-0 font-mono text-[16px] font-semibold">
                              {insight.amount < 0 ? '−' : ''}
                              {formatCurrency(
                                Math.abs(insight.amount),
                                insight.currency
                              )}
                            </p>
                          )}
                          {insight.category && (
                            <button
                              onClick={() =>
                                onNavigateToTransactions({
                                  category: insight.category,
                                  // Inside Hogar the drill stays in the house.
                                  ...(householdMode && {
                                    household: 'household' as const,
                                  }),
                                })
                              }
                              className="mt-[6px] cursor-pointer border-none bg-transparent p-0 text-[12px] font-semibold text-[var(--brand-text)]"
                            >
                              Ver transacciones →
                            </button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
