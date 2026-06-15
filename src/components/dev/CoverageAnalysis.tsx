import { useState } from 'react'
import { Button } from '../ui/button'
import type { SupabaseSession } from '../../services/supabase/client'
import { loadUserTransactions } from '../../services/supabase/transactions'
import { listCategoryOverrides } from '../../services/supabase/category-overrides'
import { categorizeTransaction } from '../../services/categorizer/transaction-categorizer'
import { normalizeMerchantName } from '../../services/categorizer/merchant-patterns'
import type { Transaction } from '../../models'

interface MerchantStat {
  description: string
  normalizedKey: string
  confidence: number
  classifiedAs: string
  dbCategory: string | undefined
  frequency: number
  isInOverrides: boolean
}

interface AnalysisResult {
  totalUnique: number
  high: MerchantStat[]
  medium: MerchantStat[]
  low: MerchantStat[]
  overrideCount: number
  lowInOverrides: number
}

function tier(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.85) return 'high'
  if (confidence >= 0.5) return 'medium'
  return 'low'
}

async function runAnalysis(session: SupabaseSession): Promise<AnalysisResult> {
  const [transactions, overrides] = await Promise.all([
    loadUserTransactions(session),
    listCategoryOverrides(session),
  ])

  const overrideKeys = new Set(overrides.map((o) => o.merchantNormalized))

  // Group by normalized description
  const byKey = new Map<
    string,
    { description: string; transactions: Transaction[] }
  >()
  for (const tx of transactions) {
    const key = normalizeMerchantName(tx.description) || tx.description
    if (!byKey.has(key)) {
      byKey.set(key, { description: tx.description, transactions: [] })
    }
    byKey.get(key)!.transactions.push(tx)
  }

  const stats: MerchantStat[] = []
  for (const [key, { description, transactions: txs }] of byKey) {
    const sample = txs[0]
    const result = categorizeTransaction(description, sample.type, {
      amount: sample.amount,
      currency: sample.currency,
    })

    // Most frequent category in DB for this merchant
    const categoryCounts = new Map<string, number>()
    for (const tx of txs) {
      if (tx.category) {
        categoryCounts.set(tx.category, (categoryCounts.get(tx.category) ?? 0) + 1)
      }
    }
    const dbCategory = [...categoryCounts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0]

    stats.push({
      description,
      normalizedKey: key,
      confidence: result.confidence,
      classifiedAs: result.category,
      dbCategory,
      frequency: txs.length,
      isInOverrides: overrideKeys.has(key),
    })
  }

  stats.sort((a, b) => b.frequency - a.frequency)

  const high = stats.filter((s) => tier(s.confidence) === 'high')
  const medium = stats.filter((s) => tier(s.confidence) === 'medium')
  const low = stats.filter((s) => tier(s.confidence) === 'low')

  return {
    totalUnique: stats.length,
    high,
    medium,
    low,
    overrideCount: overrides.length,
    lowInOverrides: low.filter((s) => s.isInOverrides).length,
  }
}

function Pill({
  label,
  color,
}: {
  label: string
  color: string
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: color,
        color: '#fff',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function MerchantTable({ rows }: { rows: MerchantStat[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, 20)

  return (
    <div style={{ marginTop: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Merchant
            </th>
            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Classified as
            </th>
            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>
              DB category
            </th>
            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Conf
            </th>
            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Freq
            </th>
            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Override
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr
              key={row.normalizedKey}
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <td
                style={{
                  padding: '6px 8px',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                }}
                title={row.description}
              >
                {row.description}
              </td>
              <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                {row.classifiedAs}
              </td>
              <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                {row.dbCategory ?? '—'}
              </td>
              <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>
                {(row.confidence * 100).toFixed(0)}%
              </td>
              <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>
                {row.frequency}
              </td>
              <td style={{ padding: '6px 8px' }}>
                {row.isInOverrides ? '✓' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginTop: 8,
            fontSize: 12,
            color: 'var(--text-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          {expanded ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}

export function CoverageAnalysis({ session }: { session: SupabaseSession | null }) {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'low' | 'medium' | 'high'>('low')

  async function handleRun() {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      setResult(await runAnalysis(session))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const pct = (n: number, total: number) =>
    total === 0 ? '0' : ((n / total) * 100).toFixed(1)

  return (
    <div style={{ padding: '16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button
          variant="outline"
          onClick={() => void handleRun()}
          disabled={loading || !session}
          style={{ fontSize: 13 }}
        >
          {loading ? 'Analizando…' : 'Analizar cobertura'}
        </Button>
        {error && (
          <span style={{ fontSize: 12, color: 'var(--neg)' }}>{error}</span>
        )}
      </div>

      {result && (
        <div>
          {/* Summary pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <Pill
              label={`${result.totalUnique} merchants únicos`}
              color="oklch(0.45 0.05 260)"
            />
            <Pill
              label={`Alta: ${result.high.length} (${pct(result.high.length, result.totalUnique)}%)`}
              color="oklch(0.55 0.15 145)"
            />
            <Pill
              label={`Media: ${result.medium.length} (${pct(result.medium.length, result.totalUnique)}%)`}
              color="oklch(0.65 0.15 70)"
            />
            <Pill
              label={`Baja: ${result.low.length} (${pct(result.low.length, result.totalUnique)}%)`}
              color="oklch(0.55 0.18 25)"
            />
          </div>

          {/* Derived pattern candidates summary */}
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--surface-2)',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            <strong>Candidatos a patrones derivados:</strong>{' '}
            {result.overrideCount} overrides de usuario confirmados.{' '}
            {result.lowInOverrides > 0 && (
              <span style={{ color: 'var(--neg)' }}>
                {result.lowInOverrides} merchants con override están en la zona baja — ya cubiertos por el usuario, buenos para patrones derivados.
              </span>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['low', 'medium', 'high'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  padding: '5px 12px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontWeight: activeTab === t ? 600 : 400,
                  background: activeTab === t ? 'var(--surface-2)' : 'transparent',
                  color: 'var(--text)',
                }}
              >
                {t === 'low' ? `Baja (${result.low.length})` : t === 'medium' ? `Media (${result.medium.length})` : `Alta (${result.high.length})`}
              </button>
            ))}
          </div>

          {activeTab === 'low' && <MerchantTable rows={result.low} />}
          {activeTab === 'medium' && <MerchantTable rows={result.medium} />}
          {activeTab === 'high' && <MerchantTable rows={result.high} />}
        </div>
      )}
    </div>
  )
}
