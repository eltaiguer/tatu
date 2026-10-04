import { useEffect, useMemo, useState } from 'react'
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
import { formatCurrency } from '../utils/formatting'
import type { Currency, Transaction, TransactionsFilter } from '../models'
import type { SupabaseSession } from '../services/supabase/client'
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

interface InsightsProps {
  transactions: Transaction[]
  homeCurrency: Currency
  fxRate: number
  session: SupabaseSession
  aiEnabled: boolean
  claudeApiKey: string
  onNavigateToTransactions: (filter: TransactionsFilter) => void
  onNavigateToSettings: () => void
  onNavigateToImport?: () => void
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
  session,
  aiEnabled,
  claudeApiKey,
  onNavigateToTransactions,
  onNavigateToSettings,
  onNavigateToImport,
}: InsightsProps) {
  const [cached, setCached] = useState<CachedInsightsLookup | null>(null)
  const [loadingCache, setLoadingCache] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const isConfigured = aiEnabled && Boolean(claudeApiKey)
  const hasTransactions = transactions.length > 0

  const input = useMemo(
    () => buildInsightInput(transactions, homeCurrency, fxRate),
    [transactions, homeCurrency, fxRate]
  )

  useEffect(() => {
    if (!isConfigured || !hasTransactions) {
      setLoadingCache(false)
      setCached(null)
      return
    }

    let cancelled = false
    setLoadingCache(true)
    setError('')

    getCachedInsights(session, input)
      .then((result) => {
        if (!cancelled) setCached(result)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : 'No se pudieron cargar los insights'
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCache(false)
      })

    return () => {
      cancelled = true
    }
  }, [session, input, isConfigured, hasTransactions])

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      const result = await generateInsights(input, claudeApiKey)
      await saveCachedInsights(session, input, result, 'claude-opus-4-8')
      setCached({
        result,
        model: 'claude-opus-4-8',
        generatedAt: new Date().toISOString(),
        isStale: false,
      })
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron generar los insights'
      )
    } finally {
      setGenerating(false)
    }
  }

  const groups = useMemo(
    () => groupAndSortInsights(cached?.result.insights ?? []),
    [cached]
  )

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
        subtitle="¿Dónde se fue tu dinero? ¿Cómo podés gastar menos? — toda tu historia, de un vistazo."
      />

      {error && (
        <p role="alert" className="text-[13px] text-[var(--neg)]">
          {error}
        </p>
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

      {hasTransactions && !isConfigured && (
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

      {hasTransactions && isConfigured && !loadingCache && !cached && (
        <Card className="p-8 text-center space-y-4 items-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">Generá tus primeros insights</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Analizamos todas tus categorías, comercios y cargos recurrentes
              para mostrarte dónde se fue tu dinero.
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

      {hasTransactions && isConfigured && cached && (
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
                Tus transacciones cambiaron desde la última vez que generaste
                insights. Los que ves abajo pueden estar desactualizados —{' '}
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
