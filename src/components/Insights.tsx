import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  TrendingDown,
  Scissors,
  Repeat,
  LineChart,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { CategoryBadge } from './CategoryBadge'
import { formatCurrency } from '../utils/formatting'
import type { Currency, Transaction, TransactionsFilter } from '../models'
import type { SupabaseSession } from '../services/supabase/client'
import { buildInsightInput, getUtcMonthPeriod } from '../services/insights/insight-data'
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
  referenceDate?: Date
}

const TYPE_ORDER: InsightType[] = [
  'bleeding_money',
  'easiest_cut',
  'recurring',
  'trend',
  'anomaly',
]

const TYPE_META: Record<InsightType, { label: string; icon: typeof TrendingDown }> = {
  bleeding_money: { label: '¿Dónde se fue tu dinero?', icon: TrendingDown },
  easiest_cut: { label: 'Fácil de recortar', icon: Scissors },
  recurring: { label: 'Suscripciones y cargos recurrentes', icon: Repeat },
  trend: { label: 'Tendencias', icon: LineChart },
  anomaly: { label: 'Anomalías', icon: AlertTriangle },
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 }
const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  high: 'var(--neg)',
  medium: 'var(--accent)',
  low: 'var(--text-faint)',
}

function groupAndSortInsights(insights: Insight[]): Array<{ type: InsightType; items: Insight[] }> {
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

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('es-UY', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
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
  referenceDate = new Date(),
}: InsightsProps) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [cached, setCached] = useState<CachedInsightsLookup | null>(null)
  const [loadingCache, setLoadingCache] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const isConfigured = aiEnabled && Boolean(claudeApiKey)

  const period = useMemo(
    () => getUtcMonthPeriod(referenceDate, monthOffset),
    [referenceDate, monthOffset]
  )

  const input = useMemo(
    () => buildInsightInput(transactions, period, homeCurrency, fxRate),
    [transactions, period, homeCurrency, fxRate]
  )

  useEffect(() => {
    if (!isConfigured) {
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
            e instanceof Error ? e.message : 'No se pudieron cargar los insights'
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCache(false)
      })

    return () => {
      cancelled = true
    }
  }, [session, input, isConfigured])

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              fontWeight: 600,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Sparkles size={22} style={{ color: 'var(--accent)' }} aria-hidden="true" />
            Insights
          </h1>
          <p className="text-muted-foreground" style={{ fontSize: 14, marginTop: 4 }}>
            ¿Dónde se fue tu dinero? ¿Cómo podés gastar menos?
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            variant="outline"
            size="icon"
            aria-label="Mes anterior"
            onClick={() => setMonthOffset((m) => m - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span
            className="font-mono"
            style={{ fontSize: 14, minWidth: 120, textAlign: 'center', textTransform: 'capitalize' }}
          >
            {formatMonthLabel(period.start)}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Mes siguiente"
            disabled={monthOffset >= 0}
            onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--neg)' }}>
          {error}
        </p>
      )}

      {!isConfigured && (
        <Card className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">Activá la IA para ver insights</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Los insights usan tu clave de Claude configurada en Configuración
              para analizar tus gastos de este período.
            </p>
          </div>
          <Button onClick={onNavigateToSettings}>Ir a Configuración</Button>
        </Card>
      )}

      {isConfigured && !loadingCache && !cached && (
        <Card className="p-8 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="text-primary" size={28} />
          </div>
          <div>
            <h2 className="mb-2">Generá tus primeros insights</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Analizamos tus categorías, comercios y cargos recurrentes de{' '}
              {formatMonthLabel(period.start)} para mostrarte dónde se fue tu
              dinero.
            </p>
          </div>
          <Button onClick={() => void handleGenerate()} disabled={generating}>
            <Sparkles size={16} />
            {generating ? 'Generando…' : 'Generar insights'}
          </Button>
        </Card>
      )}

      {isConfigured && cached && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
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
            <Card
              className="p-4"
              style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
            >
              <p style={{ fontSize: 13, margin: 0 }}>
                Tus transacciones de este período cambiaron desde la última
                vez que generaste insights. Los que ves abajo pueden estar
                desactualizados —{' '}
                <button
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--brand-text)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  regenerar ahora
                </button>
                .
              </p>
            </Card>
          )}

          {groups.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground" style={{ margin: 0 }}>
                No encontramos patrones destacados en {formatMonthLabel(period.start)}.
              </p>
            </Card>
          )}

          {groups.map((group) => {
            const meta = TYPE_META[group.type]
            const Icon = meta.icon
            return (
              <div key={group.type}>
                <h3
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 12,
                  }}
                >
                  <Icon size={16} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  {meta.label}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {group.items.map((insight, i) => (
                    <Card
                      key={`${group.type}-${i}`}
                      className="p-4"
                      style={{
                        borderLeft: `3px solid ${SEVERITY_COLOR[insight.severity]}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>
                            {insight.title}
                          </p>
                          <p
                            className="text-muted-foreground"
                            style={{ fontSize: 13, margin: 0 }}
                          >
                            {insight.narrative}
                          </p>
                          {insight.category && (
                            <div style={{ marginTop: 8 }}>
                              <CategoryBadge categoryId={insight.category} size="sm" />
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {typeof insight.amount === 'number' && (
                            <p
                              className="font-mono"
                              style={{ fontSize: 16, fontWeight: 600, margin: 0 }}
                            >
                              {insight.amount < 0 ? '−' : ''}
                              {formatCurrency(Math.abs(insight.amount), insight.currency)}
                            </p>
                          )}
                          {insight.category && (
                            <button
                              onClick={() =>
                                onNavigateToTransactions({ category: insight.category })
                              }
                              style={{
                                marginTop: 6,
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontSize: 12,
                                color: 'var(--brand-text)',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
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
