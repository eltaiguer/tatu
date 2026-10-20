import { useMemo, useState } from 'react'
import { Button } from '../ui/button'
import type { Transaction } from '../../models'
import type { AiConfig } from '../../services/ai/ai-config'
import {
  BATCH_SIZE as CLAUDE_BATCH_SIZE,
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
  type LabelledRow,
} from '../../services/categorizer/eval/agreement'

interface Props {
  transactions: Transaction[]
  claudeApiKey: string
  aiModel: string
}

/** Newest labelled rows every engine is scored on: two Claude batches at most. */
const SAMPLE_CAP = 300
const MAX_MISMATCHES = 40

type RunState = 'idle' | 'running' | 'done' | 'error'

/** One engine's run: its report, which rows it answered, and how it went. */
interface EngineRun {
  report: AgreementReport | null
  answered: Set<string>
  partial: boolean
  state: RunState
  error: string | null
}

const idle = (): EngineRun => ({
  report: null,
  answered: new Set(),
  partial: false,
  state: 'idle',
  error: null,
})

/** What an engine returns for a sample: a category per row it answered. */
type Classify = (
  sample: LabelledRow[]
) => Promise<{ predictions: Map<string, string>; partialFailure?: string }>

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

function label(id: string): string {
  return getCategoryDefinition(id).label
}

function toInputs(sample: LabelledRow[]): AiEnrichmentInput[] {
  return sample.map((row) => ({
    id: row.id,
    description: row.description,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    source: row.source,
  }))
}

const cell = { padding: '4px 8px', verticalAlign: 'top' as const }
const head = {
  ...cell,
  color: 'var(--text-muted)',
  fontWeight: 600,
  textAlign: 'left' as const,
}
const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  marginTop: 12,
}

/**
 * [Dev] How often each engine lands on the category the user chose. The
 * user's rows at confidence 1 are the labels; every engine is scored on the
 * same newest rows, without the user rules those rows created, as a fresh
 * import would see them (services/categorizer/eval/agreement.ts). A run
 * whose transport failed for some rows is scored on the rows it answered
 * and marked partial, never on phantom mismatches.
 */
export function CategorizerEval({
  transactions,
  claudeApiKey,
  aiModel,
}: Props) {
  const rows = useMemo(() => labelledRows(transactions), [transactions])
  const sample = useMemo(() => rows.slice(0, SAMPLE_CAP), [rows])
  const claudeCalls = Math.ceil(sample.length / CLAUDE_BATCH_SIZE)

  const [rules, setRules] = useState<EngineRun>(idle)
  const [claude, setClaude] = useState<EngineRun>(idle)

  async function runEngine(set: (run: EngineRun) => void, classify: Classify) {
    set({ ...idle(), state: 'running' })
    try {
      const { predictions, partialFailure } = await classify(sample)
      // Only rows the engine answered are scored; a transport failure must
      // not read as the engine being wrong.
      const answered = partialFailure
        ? sample.filter((row) => predictions.has(row.id))
        : sample
      set({
        report: scoreAgreement(answered, predictions),
        answered: new Set(answered.map((row) => row.id)),
        partial: !!partialFailure,
        state: 'done',
        error: partialFailure ?? null,
      })
    } catch (e) {
      set({
        ...idle(),
        state: 'error',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const handleRules = () =>
    runEngine(setRules, async (s) => ({ predictions: rulePredictions(s) }))

  const handleClaude = () =>
    runEngine(setClaude, async (s) => {
      const config: AiConfig = {
        apiKey: claudeApiKey,
        enabled: true,
        model: aiModel,
      }
      // No correction examples and no custom patterns: the labels came
      // from those, so handing them to the model would score its memory.
      const { results, partialFailure } = await enrichTransactionsWithAi(
        toInputs(s),
        config,
        {
          descriptionExamples: [],
          categoryExamples: [],
          customCategories: listCustomCategories(),
          customPatterns: [],
        }
      )
      return {
        predictions: new Map([...results].map(([id, r]) => [id, r.category])),
        partialFailure,
      }
    })

  const engines: Array<{ key: string; name: string; run: EngineRun }> = [
    { key: 'rules', name: 'Reglas', run: rules },
    { key: 'ai', name: `Claude (${aiModel})`, run: claude },
  ]
  const shown = engines.filter((e) => e.run.report)
  const mismatchIds = new Set(
    shown.flatMap((e) => e.run.report!.mismatches.map((m) => m.id))
  )
  const mismatchRows = sample.filter((row) => mismatchIds.has(row.id))
  const predictedBy = (engine: EngineRun, id: string): string => {
    if (!engine.answered.has(id)) return '—'
    const miss = engine.report!.mismatches.find((m) => m.id === id)
    return miss ? label(miss.predicted) : '✓'
  }
  const errors = engines.filter((e) => e.run.error)

  return (
    <div style={{ fontSize: 13 }}>
      <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>
        {rows.length} transacciones categorizadas por vos (confianza 1) son la
        referencia
        {rows.length > sample.length
          ? `; se evalúan las ${sample.length} más recientes`
          : ''}
        . Las reglas y la IA se evalúan sin tus overrides ni reglas
        personalizadas, como en una importación nueva.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          type="button"
          variant="outline"
          onClick={handleRules}
          disabled={sample.length === 0 || rules.state === 'running'}
        >
          Evaluar reglas
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleClaude}
          disabled={
            !claudeApiKey || sample.length === 0 || claude.state === 'running'
          }
        >
          {claude.state === 'running'
            ? 'Evaluando IA...'
            : `Evaluar IA (${sample.length} filas, ${claudeCalls} ${claudeCalls === 1 ? 'llamada' : 'llamadas'})`}
        </Button>
      </div>
      {errors.map((e) => (
        <p
          key={e.key}
          style={{ color: 'var(--destructive)', margin: '8px 0 0' }}
        >
          {e.name}: {e.run.error}
        </p>
      ))}

      {shown.length > 0 && (
        <table style={tableStyle}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={head}>Motor</th>
              <th style={head}>Coincide</th>
              <th style={head}>Acuerdo</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.key} data-testid={`eval-${e.key}`}>
                <td style={cell}>{e.name}</td>
                <td style={cell} className="amt">
                  {e.run.report!.agreed} de {e.run.report!.total}
                  {e.run.partial
                    ? ` (parcial: ${e.run.answered.size} de ${sample.length} respondidas)`
                    : ''}
                </td>
                <td style={cell} className="amt">
                  {percent(e.run.report!.agreement)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rules.report && rules.report.byLabel.length > 0 && (
        <table style={tableStyle}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={head}>Categoría</th>
              <th style={head}>Filas</th>
              {shown.map((e) => (
                <th key={e.key} style={head}>
                  {e.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.report.byLabel.map((entry) => (
              <tr key={entry.label}>
                <td style={cell}>{label(entry.label)}</td>
                <td style={cell} className="amt">
                  {entry.total}
                </td>
                {shown.map((e) => {
                  const own = e.run.report!.byLabel.find(
                    (b) => b.label === entry.label
                  )
                  return (
                    <td key={e.key} style={cell} className="amt">
                      {own ? percent(own.agreed / own.total) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mismatchRows.length > 0 && (
        <>
          <table data-testid="eval-mismatches" style={tableStyle}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={head}>Transacción</th>
                <th style={head}>Vos</th>
                {shown.map((e) => (
                  <th key={e.key} style={head}>
                    {e.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mismatchRows.slice(0, MAX_MISMATCHES).map((row) => (
                <tr key={row.id} data-row={row.id}>
                  <td style={cell}>{row.description}</td>
                  <td style={cell}>{label(row.label)}</td>
                  {shown.map((e) => (
                    <td key={e.key} style={cell}>
                      {predictedBy(e.run, row.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {mismatchRows.length > MAX_MISMATCHES && (
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)' }}>
              Mostrando {MAX_MISMATCHES} de {mismatchRows.length} desacuerdos.
            </p>
          )}
        </>
      )}
    </div>
  )
}
