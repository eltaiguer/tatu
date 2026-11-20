import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash, X } from 'lucide-react'
import { NativeSelect } from '../ui/native-select'
import { RadioGroup } from '../ui/radio-group'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Section } from '../ui/section'
import type { Transaction } from '../../models'
import { Category } from '../../models'
import { countsAsRow } from '../../services/spending/spending-rules'
import {
  getCategoryDefinitions,
  resolveCategory,
} from '../../services/categories/category-registry'
import { normalizeCategoryId } from '../../services/categories/category-aliases'
import {
  countRowsEachRuleWouldChange,
  currentUserRules,
} from '../../services/categorizer/user-rules'
import {
  addCustomPatternWithSync,
  listCustomPatterns,
  removeCustomPatternWithSync,
  testPattern,
  updateCustomPatternWithSync,
  type CustomPattern,
  type MatchType,
} from '../../services/categorizer/custom-patterns'
import { transactionStore } from '../../stores/transaction-store'
import { userErrorMessage } from '../../utils/user-error'
import {
  requireRepository,
  type Repository,
} from '../../services/repository/repository'

interface PatternRulesCardProps {
  transactions: Transaction[]
  // Applies a new rule to existing transactions; resolves with how many
  // were updated and how many failed.
  onApplyPatternToPast?: (
    pattern: CustomPattern
  ) => Promise<{ updated: number; failed: number }>
  // The signed-in user's repository: rules save through it.
  repository?: Repository | null
}

type ApplyScope = 'future_only' | 'past_and_future'

interface RuleForm {
  pattern: string
  matchType: MatchType
  category: string
  description: string
  applyScope: ApplyScope
}

const EMPTY_FORM: RuleForm = {
  pattern: '',
  matchType: 'contains',
  category: Category.Groceries,
  description: '',
  applyScope: 'future_only',
}

const plural = (n: number) => (n === 1 ? 'transacción' : 'transacciones')

// The toast after a rule was applied to past rows, shared by create, edit
// (`verb` "creada" / "guardada") — the row's own "Aplicar" has its own copy.
function toastAppliedToPast(
  verb: 'creada' | 'guardada',
  { updated, failed }: { updated: number; failed: number }
) {
  const noun = verb === 'creada' ? 'Regla creada' : 'Regla guardada'
  if (failed > 0) {
    toast.error(
      `${noun}. Se aplicó a ${updated} de ${updated + failed} ${plural(updated + failed)}; el resto no se pudo guardar.`
    )
  } else {
    toast.success(
      updated === 0
        ? `${noun} · ninguna transacción cambió`
        : `${noun} · aplicada a ${updated} ${plural(updated)}`
    )
  }
}

// "Reglas de auto-categorización": the rules list. The form opens from
// "Nueva regla" or a row's "Editar"; each row can apply its rule to the rows
// it would change now ("Aplicar a las N").
export function PatternRulesCard({
  transactions,
  onApplyPatternToPast,
  repository,
}: PatternRulesCardProps) {
  const [customPatterns, setCustomPatterns] = useState(() =>
    listCustomPatterns()
  )
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Rules with a save, delete or apply in flight: their buttons are off, so
  // an edit can't race a delete of the same rule.
  const [busyRuleIds, setBusyRuleIds] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [patternForm, setPatternForm] = useState<RuleForm>(EMPTY_FORM)
  const focusNewRuleButton = useRef(false)
  // Which form is on screen: bumped whenever one opens or closes, so a save
  // or delete that finishes late can tell the form it was started from is gone.
  const formGeneration = useRef(0)

  // Focus follows the form: into the pattern when it opens, back to
  // "Nueva regla" when it closes.
  useEffect(() => {
    if (formOpen) {
      document.getElementById('pattern-text')?.focus()
    } else if (focusNewRuleButton.current) {
      focusNewRuleButton.current = false
      document.getElementById('new-rule-button')?.focus()
    }
  }, [formOpen, editingId])

  function setBusy(id: string, busy: boolean) {
    setBusyRuleIds((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function openNewForm() {
    formGeneration.current += 1
    setEditingId(null)
    setPatternForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEditForm(rule: CustomPattern) {
    formGeneration.current += 1
    setEditingId(rule.id)
    setPatternForm({
      pattern: rule.pattern,
      matchType: rule.matchType,
      // A stored rule can hold a legacy id; the select only knows current ones.
      category: normalizeCategoryId(rule.category),
      description: rule.description ?? '',
      applyScope: 'future_only',
    })
    setFormOpen(true)
  }

  function closeForm() {
    formGeneration.current += 1
    focusNewRuleButton.current = true
    setFormOpen(false)
    setEditingId(null)
    setPatternForm(EMPTY_FORM)
  }

  async function handleSubmit() {
    const editing = editingId
    if (!patternForm.pattern.trim() || saving) return
    if (editing && busyRuleIds.has(editing)) return
    const generation = formGeneration.current
    const input = {
      pattern: patternForm.pattern,
      matchType: patternForm.matchType,
      category: patternForm.category,
      description: patternForm.description.trim() || undefined,
    }
    let saved: CustomPattern
    setSaving(true)
    if (editing) setBusy(editing, true)
    try {
      const repo = requireRepository(repository)
      saved = editing
        ? await updateCustomPatternWithSync(repo, editing, input)
        : await addCustomPatternWithSync(repo, input)
    } catch (error) {
      if (editing) setBusy(editing, false)
      toast.error(
        userErrorMessage(
          error,
          editing ? 'No se pudo guardar la regla' : 'No se pudo crear la regla'
        )
      )
      setCustomPatterns(listCustomPatterns())
      return
    } finally {
      setSaving(false)
    }

    // The rule changed: a row it categorized may now be (or stop being) a
    // transfer (#289).
    transactionStore.getState().reinfer()

    // The rule stays locked until its apply (if any) is over.
    setBusy(saved.id, true)
    try {
      const applyToPast = patternForm.applyScope === 'past_and_future'
      if (formGeneration.current === generation) closeForm()
      setCustomPatterns(listCustomPatterns())

      if (!applyToPast || !onApplyPatternToPast) {
        toast.success(editing ? 'Regla guardada' : 'Regla creada')
        return
      }
      try {
        toastAppliedToPast(
          editing ? 'guardada' : 'creada',
          await onApplyPatternToPast(saved)
        )
      } catch (error) {
        toast.error(
          `La regla se guardó, pero no se pudo aplicar a las transacciones anteriores: ${userErrorMessage(error, 'error al guardar')}`
        )
      }
    } finally {
      setBusy(saved.id, false)
    }
  }

  async function handleRemovePattern(id: string) {
    // Close the form only if it is still the one this delete was started from.
    const generation = formGeneration.current
    const wasEditing = editingId === id
    setBusy(id, true)
    try {
      await removeCustomPatternWithSync(requireRepository(repository), id)
      transactionStore.getState().reinfer()
      toast.success('Regla eliminada')
      if (wasEditing && formGeneration.current === generation) closeForm()
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudo eliminar la regla'))
    } finally {
      setBusy(id, false)
      setCustomPatterns(listCustomPatterns())
    }
  }

  async function handleApplyRule(rule: CustomPattern) {
    if (!onApplyPatternToPast) return
    const fallback = 'No se pudo aplicar la regla'
    setBusy(rule.id, true)
    try {
      const { updated, failed } = await onApplyPatternToPast(rule)
      if (failed > 0 && updated > 0) {
        toast.error(
          `Se aplicó a ${updated} de ${updated + failed} ${plural(updated + failed)}; el resto no se pudo guardar.`
        )
      } else if (failed > 0) {
        toast.error(fallback)
      } else if (updated === 0) {
        toast.success('Regla aplicada · ninguna transacción cambió')
      } else {
        toast.success(`Regla aplicada a ${updated} ${plural(updated)}`)
      }
    } catch (error) {
      toast.error(userErrorMessage(error, fallback))
    } finally {
      setBusy(rule.id, false)
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

  // Rows each rule would change now: what "Aplicar a las N" writes. It is
  // not the number above — a match can already be applied, categorized by
  // hand, or won by another rule. Uses the rules this card lists.
  const { descriptionOverrides, merchantOverrides } = currentUserRules()
  const changeCounts = useMemo(
    () =>
      countRowsEachRuleWouldChange(transactions, {
        descriptionOverrides,
        merchantOverrides,
        customPatterns,
      }),
    [transactions, customPatterns, descriptionOverrides, merchantOverrides]
  )

  const categoryOptions = getCategoryDefinitions().filter(
    (c) => c.id !== Category.Uncategorized
  )
  const currentCategoryListed = categoryOptions.some(
    (c) => c.id === patternForm.category
  )

  const label =
    'mb-[6px] block text-[12px] font-medium text-[var(--text-muted)]'

  return (
    <Section title="Reglas de auto-categorización">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-[24px] py-[20px]">
        <div className="mb-[16px] flex flex-wrap items-center justify-between gap-[10px]">
          <p className="text-[13px] text-[var(--text-muted)]">
            Creá reglas para categorizar transacciones automáticamente según el
            texto de la descripción.
          </p>
          {!formOpen && (
            <Button
              id="new-rule-button"
              variant="outline"
              onClick={openNewForm}
            >
              <Plus size={15} />
              Nueva regla
            </Button>
          )}
        </div>

        {formOpen && (
          <div className="mb-[16px] flex flex-col gap-[10px]">
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-[15px] font-semibold">
                {editingId ? 'Editar regla' : 'Nueva regla'}
              </h3>
              <button
                onClick={closeForm}
                className="grid cursor-pointer place-items-center rounded-[6px] border-none bg-none p-[4px] text-[var(--text-faint)]"
                aria-label="Cancelar"
              >
                <X size={16} />
              </button>
            </div>
            {/* Row 1: pattern + type + category */}
            <div className="flex flex-wrap items-end gap-[10px]">
              <div className="min-w-[160px] flex-auto">
                <label htmlFor="pattern-text" className={label}>
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
                <label htmlFor="pattern-match" className={label}>
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
                <label htmlFor="pattern-category" className={label}>
                  Categoría
                </label>
                <NativeSelect
                  id="pattern-category"
                  value={patternForm.category}
                  onChange={(e) =>
                    setPatternForm((p) => ({ ...p, category: e.target.value }))
                  }
                >
                  {/* An archived category stays selectable while editing. */}
                  {!currentCategoryListed && (
                    <option value={patternForm.category}>
                      {resolveCategory(patternForm.category).label}
                    </option>
                  )}
                  {categoryOptions.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            {/* Row 2: description + apply scope + save button */}
            <div className="flex flex-wrap items-end gap-[10px]">
              <div className="min-w-[160px] flex-auto">
                <label htmlFor="pattern-description" className={label}>
                  Descripción (opcional)
                </label>
                <Input
                  id="pattern-description"
                  value={patternForm.description}
                  onChange={(e) =>
                    setPatternForm((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
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
                onClick={() => {
                  void handleSubmit()
                }}
                disabled={
                  !patternForm.pattern.trim() ||
                  saving ||
                  (editingId !== null && busyRuleIds.has(editingId))
                }
                className="h-[40px]"
              >
                {!editingId && <Plus size={15} />}
                {editingId ? 'Guardar cambios' : 'Agregar regla'}
              </Button>
            </div>
          </div>
        )}

        {customPatterns.length > 0 ? (
          <div className="flex flex-col gap-[6px]">
            {customPatterns.map((cp) => {
              const catDisplay = resolveCategory(cp.category)
              const matchLabel =
                cp.matchType === 'contains'
                  ? 'contiene'
                  : cp.matchType === 'starts_with'
                    ? 'empieza con'
                    : 'exacto'
              const busy = busyRuleIds.has(cp.id)
              const toChange = changeCounts.get(cp.id) ?? 0
              return (
                <div
                  key={cp.id}
                  className="flex flex-wrap items-center justify-between gap-[10px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-[12px] py-[10px]"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-[8px] text-[13px]">
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
                  <div className="flex shrink-0 items-center gap-[6px]">
                    {toChange > 0 && onApplyPatternToPast && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          void handleApplyRule(cp)
                        }}
                        aria-label={`Aplicar regla ${cp.pattern} a ${toChange} ${plural(toChange)}`}
                      >
                        {toChange === 1
                          ? 'Aplicar a 1'
                          : `Aplicar a las ${toChange}`}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => openEditForm(cp)}
                      aria-label={`Editar regla ${cp.pattern}`}
                    >
                      <Pencil size={13} />
                      Editar
                    </Button>
                    <button
                      onClick={() => {
                        void handleRemovePattern(cp.id)
                      }}
                      disabled={busy}
                      aria-label={`Eliminar regla ${cp.pattern}`}
                      className="grid shrink-0 cursor-pointer place-items-center rounded-[6px] border-none bg-none p-[4px] text-[var(--neg)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash size={13} />
                    </button>
                  </div>
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
    </Section>
  )
}
