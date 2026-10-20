import { useMemo, useState } from 'react'
import { Button } from '../ui/button'
import type { Transaction } from '../../models'
import type { AiConfig } from '../../services/ai/ai-config'
import {
  enrichTransactionsWithAi,
  type AiEnrichmentInput,
} from '../../services/ai/transaction-ai'
import { listCustomCategories } from '../../services/categories/category-store'
import { getCategoryDefinition } from '../../services/categories/category-registry'
import {
  labelledRows,
  rulePredictions,
  scoreAgreement,
  type AgreementReport,
} from '../../services/categorizer/eval/agreement'

interface Props {
  transactions: Transaction[]
  claudeApiKey: string
  aiModel: string
}

/** Newest labelled rows sent to the model: two batches at most. */
const AI_SAMPLE_CAP = 300
const AI_BATCH_SIZE = 150
const MAX_MISMATCHES = 40

type RunState = 'idle' | 'running' | 'done' | 'error'

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

function label(id: string): string {
  return getCategoryDefinition(id).label
}

const cell = { padding: '4px 8px', verticalAlign: 'top' as const }
const head = {
  ...cell,
  color: 'var(--text-muted)',
  fontWeight: 600,
  textAlign: 'left' as const,
}

/**
 * [Dev] How often each engine lands on the category the user chose. The
 * user's rows at confidence 1 are the labels; both engines run without the
 * user rules those rows created, as a fresh import would (see
 * services/categorizer/eval/agreement.ts). A candidate engine (another
 * model, another provider) is compared on the same rows.
 */
export function CategorizerEval({
  transactions,
  claudeApiKey,
  aiModel,
}: Props) {
  const rows = useMemo(() => labelledRows(transactions), [transactions])
  const aiSample = useMemo(() => rows.slice(0, AI_SAMPLE_CAP), [rows])
  const aiCalls = Math.ceil(aiSample.length / AI_BATCH_SIZE)

  const [rules, setRules] = useState<AgreementReport | null>(null)
  const [ai, setAi] = useState<AgreementReport | null>(null)
  const [aiState, setAiState] = useState<RunState>('idle')
  const [error, setError] = useState<string | null>(null)

  function handleRules() {
    setRules(scoreAgreement(rows, rulePredictions(rows)))
  }

  async function handleAi() {
    setAiState('running')
    setError(null)
    try {
      const config: AiConfig = {
        apiKey: claudeApiKey,
        enabled: true,
        model: aiModel,
      }
      const inputs: AiEnrichmentInput[] = aiSample.map((row) => ({
        id: row.id,
        description: row.description,
        type: row.type,
        amount: row.amount,
        currency: row.currency,
        source: row.source,
      }))
      // No correction examples and no custom patterns: the labels came
      // from those, so handing them to the model would score its memory.
      const { results, partialFailure } = await enrichTransactionsWithAi(
        inputs,
        config,
        {
          descriptionExamples: [],
          categoryExamples: [],
          customCategories: listCustomCategories(),
          customPatterns: [],
        }
      )
      setAi(
        scoreAgreement(
          aiSample,
          new Map([...results].map(([id, r]) => [id, r.category]))
        )
      )
      setAiState('done')
      if (partialFailure) setError(partialFailure)
    } catch (e) {
      setAiState('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const rulesById = new Map(
    rules?.mismatches.map((m) => [m.id, m.predicted]) ?? []
  )
  const aiById = new Map(ai?.mismatches.map((m) => [m.id, m.predicted]) ?? [])
  const mismatchRows = rows
    .filter((row) => rulesById.has(row.id) || aiById.has(row.id))
    .slice(0, MAX_MISMATCHES)

  return (
    <div style={{ fontSize: 13 }}>
      <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>
        {rows.length} transacciones categorizadas por vos (confianza 1) son la
        referencia. Las reglas y la IA se evalúan sin tus overrides ni reglas
        personalizadas, como en una importación nueva.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          type="button"
          variant="outline"
          onClick={handleRules}
          disabled={rows.length === 0}
        >
          Evaluar reglas
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleAi}
          disabled={
            !claudeApiKey || aiSample.length === 0 || aiState === 'running'
          }
        >
          {aiState === 'running'
            ? 'Evaluando IA...'
            : `Evaluar IA (${aiSample.length} filas, ${aiCalls} ${aiCalls === 1 ? 'llamada' : 'llamadas'})`}
        </Button>
      </div>
      {error && (
        <p style={{ color: 'var(--danger, #c33)', margin: '8px 0 0' }}>
          {error}
        </p>
      )}

      {(rules || ai) && (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: 12,
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={head}>Motor</th>
              <th style={head}>Coincide</th>
              <th style={head}>Acuerdo</th>
            </tr>
          </thead>
          <tbody>
            {rules && (
              <tr data-testid="eval-rules">
                <td style={cell}>Reglas</td>
                <td style={cell} className="amt">
                  {rules.agreed} de {rules.total}
                </td>
                <td style={cell} className="amt">
                  {percent(rules.agreement)}
                </td>
              </tr>
            )}
            {ai && (
              <tr data-testid="eval-ai">
                <td style={cell}>IA ({aiModel})</td>
                <td style={cell} className="amt">
                  {ai.agreed} de {ai.total}
                </td>
                <td style={cell} className="amt">
                  {percent(ai.agreement)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {rules && rules.byLabel.length > 0 && (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: 12,
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={head}>Categoría</th>
              <th style={head}>Filas</th>
              <th style={head}>Reglas</th>
              {ai && <th style={head}>IA</th>}
            </tr>
          </thead>
          <tbody>
            {rules.byLabel.map((entry) => {
              const aiEntry = ai?.byLabel.find((e) => e.label === entry.label)
              return (
                <tr key={entry.label}>
                  <td style={cell}>{label(entry.label)}</td>
                  <td style={cell} className="amt">
                    {entry.total}
                  </td>
                  <td style={cell} className="amt">
                    {percent(entry.agreed / entry.total)}
                  </td>
                  {ai && (
                    <td style={cell} className="amt">
                      {aiEntry ? percent(aiEntry.agreed / aiEntry.total) : '—'}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {mismatchRows.length > 0 && (
        <table
          data-testid="eval-mismatches"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: 12,
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={head}>Transacción</th>
              <th style={head}>Vos</th>
              {rules && <th style={head}>Reglas</th>}
              {ai && <th style={head}>IA</th>}
            </tr>
          </thead>
          <tbody>
            {mismatchRows.map((row) => (
              <tr key={row.id}>
                <td style={cell}>{row.description}</td>
                <td style={cell}>{label(row.label)}</td>
                {rules && (
                  <td style={cell}>
                    {rulesById.has(row.id)
                      ? label(rulesById.get(row.id)!)
                      : '✓'}
                  </td>
                )}
                {ai && (
                  <td style={cell}>
                    {aiById.has(row.id) ? label(aiById.get(row.id)!) : '✓'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
