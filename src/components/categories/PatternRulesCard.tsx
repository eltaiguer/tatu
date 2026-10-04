import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash } from 'lucide-react'
import { NativeSelect } from '../ui/native-select'
import { RadioGroup } from '../ui/radio-group'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import type { Transaction } from '../../models'
import { Category } from '../../models'
import { countsAsRow } from '../../services/spending/spending-rules'
import {
  getCategoryDefinition,
  getCategoryDefinitions,
} from '../../services/categories/category-registry'
import {
  addCustomPatternWithSync,
  listCustomPatterns,
  removeCustomPatternWithSync,
  testPattern,
  type CustomPattern,
  type MatchType,
} from '../../services/categorizer/custom-patterns'
import { userErrorMessage } from '../../utils/user-error'

interface PatternRulesCardProps {
  transactions: Transaction[]
  // Applies a new rule to existing transactions; resolves with how many
  // were updated and how many failed.
  onApplyPatternToPast?: (
    pattern: CustomPattern
  ) => Promise<{ updated: number; failed: number }>
}

// "Reglas de auto-categorización": the add-rule form and the list of the
// user's custom rules.
export function PatternRulesCard({
  transactions,
  onApplyPatternToPast,
}: PatternRulesCardProps) {
  const [customPatterns, setCustomPatterns] = useState(() =>
    listCustomPatterns()
  )
  const [patternForm, setPatternForm] = useState({
    pattern: '',
    matchType: 'contains' as MatchType,
    category: Category.Groceries as string,
    description: '',
    applyScope: 'future_only' as 'future_only' | 'past_and_future',
  })

  async function handleAddPattern() {
    if (!patternForm.pattern.trim()) return
    let created: CustomPattern
    try {
      created = await addCustomPatternWithSync({
        pattern: patternForm.pattern,
        matchType: patternForm.matchType,
        category: patternForm.category,
        description: patternForm.description.trim() || undefined,
      })
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudo crear la regla'))
      setCustomPatterns(listCustomPatterns())
      return
    }

    setPatternForm({
      pattern: '',
      matchType: 'contains',
      category: Category.Groceries,
      description: '',
      applyScope: 'future_only',
    })
    setCustomPatterns(listCustomPatterns())

    if (patternForm.applyScope !== 'past_and_future' || !onApplyPatternToPast) {
      toast.success('Regla creada')
      return
    }
    try {
      const { updated, failed } = await onApplyPatternToPast(created)
      if (failed > 0) {
        toast.error(
          `Regla creada. Se aplicó a ${updated} de ${updated + failed} transacciones; el resto no se pudo guardar.`
        )
      } else {
        toast.success(
          updated === 0
            ? 'Regla creada · ninguna transacción anterior coincide'
            : `Regla creada · aplicada a ${updated} ${updated === 1 ? 'transacción' : 'transacciones'}`
        )
      }
    } catch (error) {
      toast.error(
        `La regla se guardó, pero no se pudo aplicar a las transacciones anteriores: ${userErrorMessage(error, 'error al guardar')}`
      )
    }
  }

  async function handleRemovePattern(id: string) {
    try {
      await removeCustomPatternWithSync(id)
      toast.success('Regla eliminada')
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudo eliminar la regla'))
    } finally {
      setCustomPatterns(listCustomPatterns())
    }
  }

  // Rows each rule's pattern matches, counted like any list of movements in
  // the app (split parts in, split parents out). It says what the pattern
  // matches, not which rows it categorized — overlapping rules, manual edits
  // and future-only rules make those differ. Memoized: typing in the rule
  // form must not rescan every transaction per rule.
  const matchCounts = useMemo(
    () =>
      new Map(
        customPatterns.map((rule) => [
          rule.id,
          transactions.filter(
            (tx) => countsAsRow(tx) && testPattern(tx.description, rule)
          ).length,
        ])
      ),
    [transactions, customPatterns]
  )

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-[24px] py-[20px]">
      <h3 className="mb-[4px] text-[15px] font-semibold">
        Reglas de auto-categorización
      </h3>
      <p className="mb-[16px] text-[13px] text-[var(--text-muted)]">
        Creá reglas para categorizar transacciones automáticamente según el
        texto de la descripción.
      </p>

      {/* Add pattern form */}
      <div className="mb-[16px] flex flex-col gap-[10px]">
        {/* Row 1: pattern + type + category */}
        <div className="flex flex-wrap items-end gap-[10px]">
          <div className="min-w-[160px] flex-auto">
            <label
              htmlFor="pattern-text"
              className="mb-[6px] block text-[12px] font-medium text-[var(--text-muted)]"
            >
              Patrón
            </label>
            <Input
              id="pattern-text"
              value={patternForm.pattern}
              onChange={(e) =>
                setPatternForm((p) => ({ ...p, pattern: e.target.value }))
              }
              placeholder='Ej. "farmacia"'
            />
          </div>
          <div>
            <label
              htmlFor="pattern-match"
              className="mb-[6px] block text-[12px] font-medium text-[var(--text-muted)]"
            >
              Tipo
            </label>
            <NativeSelect
              id="pattern-match"
              value={patternForm.matchType}
              onChange={(e) =>
                setPatternForm((p) => ({
                  ...p,
                  matchType: e.target.value as MatchType,
                }))
              }
            >
              <option value="contains">Contiene</option>
              <option value="starts_with">Empieza con</option>
              <option value="exact">Exacto</option>
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="pattern-category"
              className="mb-[6px] block text-[12px] font-medium text-[var(--text-muted)]"
            >
              Categoría
            </label>
            <NativeSelect
              id="pattern-category"
              value={patternForm.category}
              onChange={(e) =>
                setPatternForm((p) => ({ ...p, category: e.target.value }))
              }
            >
              {getCategoryDefinitions()
                .filter((c) => c.id !== Category.Uncategorized)
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
            </NativeSelect>
          </div>
        </div>

        {/* Row 2: description + apply scope + add button */}
        <div className="flex flex-wrap items-end gap-[10px]">
          <div className="min-w-[160px] flex-auto">
            <label
              htmlFor="pattern-description"
              className="mb-[6px] block text-[12px] font-medium text-[var(--text-muted)]"
            >
              Descripción (opcional)
            </label>
            <Input
              id="pattern-description"
              value={patternForm.description}
              onChange={(e) =>
                setPatternForm((p) => ({ ...p, description: e.target.value }))
              }
              placeholder='Ej. "Farmacia Del Sol"'
            />
          </div>
          <RadioGroup
            variant="segmented"
            legend="Aplicar a"
            name="pattern-apply-scope"
            value={patternForm.applyScope}
            onChange={(applyScope) =>
              setPatternForm((p) => ({ ...p, applyScope }))
            }
            options={[
              { value: 'future_only', label: 'Solo futuras' },
              { value: 'past_and_future', label: 'Pasadas y futuras' },
            ]}
          />
          <Button
            onClick={handleAddPattern}
            disabled={!patternForm.pattern.trim()}
            className="h-[40px]"
          >
            <Plus size={15} />
            Agregar regla
          </Button>
        </div>
      </div>

      {customPatterns.length > 0 ? (
        <div className="flex flex-col gap-[6px]">
          {customPatterns.map((cp) => {
            const catDisplay = getCategoryDefinition(cp.category)
            const matchLabel =
              cp.matchType === 'contains'
                ? 'contiene'
                : cp.matchType === 'starts_with'
                  ? 'empieza con'
                  : 'exacto'
            return (
              <div
                key={cp.id}
                className="flex items-center justify-between gap-[10px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-[12px] py-[10px]"
              >
                <div className="flex min-w-0 items-center gap-[8px] text-[13px]">
                  <Badge variant="outline">{matchLabel}</Badge>
                  <span className="overflow-hidden font-[family-name:var(--font-mono)] text-[12px] text-ellipsis whitespace-nowrap">
                    &quot;{cp.pattern}&quot;
                  </span>
                  <span className="text-[var(--text-faint)]">→</span>
                  <Badge
                    className="border-none text-[color:var(--text)]"
                    style={{ backgroundColor: catDisplay.color + '20' }}
                  >
                    {catDisplay.icon} {catDisplay.label}
                  </Badge>
                  {cp.description && (
                    <span className="overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-[var(--text-faint)]">
                      · &quot;{cp.description}&quot;
                    </span>
                  )}
                  <span className="text-[12px] whitespace-nowrap text-[var(--text-muted)]">
                    · {matchCounts.get(cp.id) ?? 0}{' '}
                    {matchCounts.get(cp.id) === 1
                      ? 'transacción coincide'
                      : 'transacciones coinciden'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    void handleRemovePattern(cp.id)
                  }}
                  aria-label={`Eliminar regla ${cp.pattern}`}
                  className="grid shrink-0 cursor-pointer place-items-center rounded-[6px] border-none bg-none p-[4px] text-[var(--neg)]"
                >
                  <Trash size={13} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="py-[16px] text-center text-[13px] text-[var(--text-faint)]">
          No hay reglas personalizadas. Creá una para categorizar
          automáticamente tus transacciones.
        </p>
      )}
    </div>
  )
}
