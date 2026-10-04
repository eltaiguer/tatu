import { useMemo, useState } from 'react'
import { NativeSelect } from './ui/native-select'
import { RadioGroup } from './ui/radio-group'
import { PageHeader } from './ui/page-header'
import { toast } from 'sonner'
import { userErrorMessage } from '../utils/user-error'
import { Plus, Pencil, Trash, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Checkbox } from './ui/checkbox'
import type { Currency, Transaction, TransactionsFilter } from '../models'
import { Category, isSplitParentTx } from '../models'
import {
  getCategoryDefinition,
  getCategoryDefinitions,
} from '../services/categories/category-registry'
import {
  addCustomCategoryWithSync,
  removeCustomCategoryWithSync,
  updateCustomCategoryWithSync,
  upsertBuiltinOverrideWithSync,
  DEFAULT_CATEGORY_COLOR,
} from '../services/categories/category-store'
import { getCategoryDisplay } from '../utils/category-display'
import { formatCurrency } from '../utils/formatting'
import { buildCategorySpendingConverted } from '../services/charts/chart-data'
import { normalizeCategoryId } from '../services/categories/category-aliases'
import {
  addCustomPatternWithSync,
  listCustomPatterns,
  removeCustomPatternWithSync,
  testPattern,
  type CustomPattern,
  type MatchType,
} from '../services/categorizer/custom-patterns'

interface CategoriesProps {
  transactions: Transaction[]
  homeCurrency?: Currency
  fxRate?: number
  onNavigateToTransactions?: (filter: TransactionsFilter) => void
  // Applies a new rule to existing transactions; resolves with how many
  // were updated and how many failed.
  onApplyPatternToPast?: (
    pattern: CustomPattern
  ) => Promise<{ updated: number; failed: number }>
}

function getCategoryTransactionCount(
  transactions: Transaction[],
  categoryId: string
): number {
  return transactions.filter((tx) => {
    if (isSplitParentTx(tx)) return false
    const txCat = getCategoryDisplay(tx.category).id
    const defCat = getCategoryDisplay(categoryId).id
    return txCat === defCat
  }).length
}

export function Categories({
  transactions,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onNavigateToTransactions,
  onApplyPatternToPast,
}: CategoriesProps) {
  const [categoriesVersion, setCategoriesVersion] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    id: '',
    label: '',
    color: DEFAULT_CATEGORY_COLOR,
    icon: '🏷️',
    isIgnored: false,
  })

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

  const categoryDefinitions = getCategoryDefinitions()
  const isEditing = form.id.length > 0

  function resetForm() {
    setForm({
      id: '',
      label: '',
      color: DEFAULT_CATEGORY_COLOR,
      icon: '🏷️',
      isIgnored: false,
    })
    setShowForm(false)
  }

  function openNewForm() {
    setForm({
      id: '',
      label: '',
      color: DEFAULT_CATEGORY_COLOR,
      icon: '🏷️',
      isIgnored: false,
    })
    setShowForm(true)
  }

  function startEdit(categoryId: string) {
    const cat = categoryDefinitions.find((c) => c.id === categoryId)
    if (!cat) return
    setForm({
      id: cat.id,
      label: cat.label,
      color: cat.color,
      icon: cat.icon || '🏷️',
      isIgnored: cat.isIgnored ?? false,
    })
    setShowForm(true)
  }

  // Every change reports success only after it reached the server; on
  // failure the store helpers have already undone it locally, and the
  // re-render in `finally` shows that restored state.
  async function handleSave() {
    if (!form.label.trim()) return
    const label = form.label.trim()
    try {
      if (isEditing) {
        const cat = categoryDefinitions.find((c) => c.id === form.id)
        if (cat?.isCustom) {
          await updateCustomCategoryWithSync(form.id, {
            label,
            color: form.color,
            icon: form.icon.trim() || '🏷️',
            isIgnored: form.isIgnored,
          })
        } else {
          await upsertBuiltinOverrideWithSync(form.id, {
            label,
            color: form.color,
            icon: form.icon.trim() || undefined,
            isIgnored: form.isIgnored,
          })
        }
        toast.success(`Categoría "${label}" guardada`)
      } else {
        await addCustomCategoryWithSync({
          label,
          color: form.color,
          icon: form.icon.trim() || '🏷️',
          isIgnored: form.isIgnored,
        })
        toast.success(`Categoría "${label}" creada`)
      }
      resetForm()
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudo guardar la categoría'))
    } finally {
      setCategoriesVersion((v) => v + 1)
    }
  }

  async function handleDelete(categoryId: string) {
    const label = getCategoryDisplay(categoryId).label
    try {
      await removeCustomCategoryWithSync(categoryId)
      if (form.id === categoryId) resetForm()
      toast.success(`Categoría "${label}" eliminada`)
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudo eliminar la categoría'))
    } finally {
      setCategoriesVersion((v) => v + 1)
    }
  }

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
            (tx) => !isSplitParentTx(tx) && testPattern(tx.description, rule)
          ).length,
        ])
      ),
    [transactions, customPatterns]
  )

  // Spend per category: the same expense rows (and the same function)
  // Resumen sums, so a card's amount, its count and the rows its link opens
  // agree.
  const spending = useMemo(
    () =>
      new Map(
        buildCategorySpendingConverted(transactions, homeCurrency, fxRate).map(
          (row) => [row.category, row]
        )
      ),
    // categoriesVersion: ignoring/un-ignoring a category here changes which
    // rows count, without changing `transactions`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, homeCurrency, fxRate, categoriesVersion]
  )
  const definedIds = new Set(
    categoryDefinitions.map((cat) => normalizeCategoryId(cat.id))
  )
  // Transactions can keep a category whose definition was deleted; Resumen
  // still counts them, so they get a card too (no edit/delete).
  const orphanCards = Array.from(spending.keys())
    .filter((id) => !definedIds.has(id))
    .map((id) => {
      const display = getCategoryDisplay(id)
      return {
        id,
        label: display.label,
        color: display.color,
        icon: '🏷️',
        isIgnored: false,
        isCustom: false,
        isOrphan: true,
      }
    })
  const categoryCards = [
    ...categoryDefinitions.map((cat) => ({ ...cat, isOrphan: false })),
    ...orphanCards,
  ].sort((a, b) => {
    // Spending first (largest first), then the rest by name; ignored last.
    if (Boolean(a.isIgnored) !== Boolean(b.isIgnored)) {
      return a.isIgnored ? 1 : -1
    }
    const spendA = spending.get(normalizeCategoryId(a.id))?.total ?? 0
    const spendB = spending.get(normalizeCategoryId(b.id))?.total ?? 0
    if (spendA !== spendB) return spendB - spendA
    return a.label.localeCompare(b.label, 'es')
  })

  return (
    <div>
      {/* Page header */}
      <PageHeader
        className="mb-7"
        title="Categorías y reglas"
        subtitle="Personalizá cómo Tatú clasifica tus movimientos"
        actions={
          <Button
            onClick={openNewForm}
            style={{
              background: 'var(--brand)',
              color: 'var(--primary-foreground)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '9px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Nueva categoría
          </Button>
        }
      />

      {/* New / Edit category form */}
      {showForm && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>
              {isEditing ? 'Editar categoría' : 'Nueva categoría'}
            </h3>
            <button
              onClick={resetForm}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-faint)',
                display: 'grid',
                placeItems: 'center',
                padding: 4,
                borderRadius: 6,
              }}
              aria-label="Cancelar"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px] gap-3 mb-4">
            <div>
              <label
                htmlFor="cat-label"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 6,
                  color: 'var(--text-muted)',
                }}
              >
                Nombre
              </label>
              <Input
                id="cat-label"
                aria-label="Nombre de categoría"
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="Ej. Café"
              />
            </div>
            <div>
              <label
                htmlFor="cat-color"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 6,
                  color: 'var(--text-muted)',
                }}
              >
                Color
              </label>
              <Input
                id="cat-color"
                aria-label="Color de categoría"
                type="color"
                value={form.color}
                onChange={(e) =>
                  setForm((f) => ({ ...f, color: e.target.value }))
                }
                className="h-10"
              />
            </div>
            <div>
              <label
                htmlFor="cat-icon"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 6,
                  color: 'var(--text-muted)',
                }}
              >
                Icono
              </label>
              <Input
                id="cat-icon"
                aria-label="Icono de categoría"
                value={form.icon}
                onChange={(e) =>
                  setForm((f) => ({ ...f, icon: e.target.value }))
                }
                placeholder="🏷️"
                maxLength={2}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            <label
              htmlFor="cat-ignored"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <Checkbox
                id="cat-ignored"
                checked={form.isIgnored}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, isIgnored: checked === true }))
                }
              />
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  Ignorar en totales
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-faint)',
                    marginLeft: 6,
                  }}
                >
                  Las transacciones de esta categoría no suman en gastos ni
                  ingresos
                </span>
              </div>
            </label>
            <Button
              onClick={() => void handleSave()}
              disabled={!form.label.trim()}
              aria-label={isEditing ? 'Guardar cambios' : 'Guardar categoría'}
            >
              {isEditing ? 'Guardar cambios' : 'Guardar categoría'}
            </Button>
          </div>
        </div>
      )}

      {/* Category grid */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          marginBottom: 24,
        }}
      >
        <h3
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 16,
            color: 'var(--text)',
          }}
        >
          Tus categorías
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {categoryCards.map((cat) => {
            const count = getCategoryTransactionCount(transactions, cat.id)
            const spend = cat.isIgnored
              ? undefined
              : spending.get(normalizeCategoryId(cat.id))
            return (
              <div
                key={cat.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  position: 'relative',
                }}
              >
                {/* Icon tile */}
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: cat.color + '22',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {cat.icon}
                </span>

                {/* Name + count */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {cat.label}
                    {cat.isOrphan && (
                      <span
                        title="Categoría eliminada que todavía tiene transacciones"
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: 'var(--text-faint)',
                          background: 'var(--border)',
                          borderRadius: 4,
                          padding: '1px 5px',
                          flexShrink: 0,
                        }}
                      >
                        sin definir
                      </span>
                    )}
                    {cat.isIgnored && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: 'var(--text-faint)',
                          background: 'var(--border)',
                          borderRadius: 4,
                          padding: '1px 5px',
                          flexShrink: 0,
                        }}
                      >
                        ignorada
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-faint)',
                      marginTop: 1,
                    }}
                  >
                    {spend && spend.total > 0 ? (
                      onNavigateToTransactions ? (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToTransactions({
                              categories: [normalizeCategoryId(cat.id)],
                              type: 'debit',
                            })
                          }
                          aria-label={`Ver los gastos en ${cat.label}`}
                          className="font-mono text-[12px] font-medium text-[color:var(--text)] underline-offset-2 hover:underline"
                        >
                          {formatCurrency(spend.total, homeCurrency)} ·{' '}
                          {spend.count} {spend.count === 1 ? 'gasto' : 'gastos'}
                        </button>
                      ) : (
                        <span className="font-mono text-[12px] text-[color:var(--text)]">
                          {formatCurrency(spend.total, homeCurrency)} ·{' '}
                          {spend.count} {spend.count === 1 ? 'gasto' : 'gastos'}
                        </span>
                      )
                    ) : (
                      <>
                        {count} {count === 1 ? 'movimiento' : 'movimientos'}
                        {!cat.isIgnored && count > 0 && ' · sin gastos'}
                      </>
                    )}
                    {cat.id === Category.Uncategorized &&
                      count > 0 &&
                      onNavigateToTransactions && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={() =>
                              onNavigateToTransactions({
                                categories: [Category.Uncategorized],
                              })
                            }
                            className="text-[11px] font-medium text-[color:var(--brand-text)] underline-offset-2 hover:underline"
                          >
                            Revisar {count}
                          </button>
                        </>
                      )}
                  </div>
                </div>

                {/* Edit (all) / delete (custom only) */}
                <div
                  style={{
                    display: cat.isOrphan ? 'none' : 'flex',
                    gap: 4,
                  }}
                >
                  <button
                    onClick={() => startEdit(cat.id)}
                    aria-label={`Editar categoría ${cat.label}`}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-faint)',
                      display: 'grid',
                      placeItems: 'center',
                      padding: 4,
                      borderRadius: 6,
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  {cat.isCustom && (
                    <button
                      onClick={() => void handleDelete(cat.id)}
                      aria-label={`Eliminar categoría ${cat.label}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--neg)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pattern rules */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          Reglas de auto-categorización
        </h3>
        <p
          style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}
        >
          Creá reglas para categorizar transacciones automáticamente según el
          texto de la descripción.
        </p>

        {/* Add pattern form */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {/* Row 1: pattern + type + category */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'flex-end',
            }}
          >
            <div style={{ flex: '1 1 auto', minWidth: 160 }}>
              <label
                htmlFor="pattern-text"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 6,
                  color: 'var(--text-muted)',
                }}
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
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 6,
                  color: 'var(--text-muted)',
                }}
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
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 6,
                  color: 'var(--text-muted)',
                }}
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
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'flex-end',
            }}
          >
            <div style={{ flex: '1 1 auto', minWidth: 160 }}>
              <label
                htmlFor="pattern-description"
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 6,
                  color: 'var(--text-muted)',
                }}
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
              style={{ height: 40 }}
            >
              <Plus size={15} />
              Agregar regla
            </Button>
          </div>
        </div>

        {customPatterns.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    background: 'var(--bg)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                      fontSize: 13,
                    }}
                  >
                    <Badge variant="outline">{matchLabel}</Badge>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      &quot;{cp.pattern}&quot;
                    </span>
                    <span style={{ color: 'var(--text-faint)' }}>→</span>
                    <Badge
                      style={{
                        backgroundColor: catDisplay.color + '20',
                        color: 'var(--text)',
                        border: 'none',
                      }}
                    >
                      {catDisplay.icon} {catDisplay.label}
                    </Badge>
                    {cp.description && (
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--text-faint)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        · &quot;{cp.description}&quot;
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
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
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--neg)',
                      display: 'grid',
                      placeItems: 'center',
                      padding: 4,
                      borderRadius: 6,
                      flexShrink: 0,
                    }}
                  >
                    <Trash size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-faint)',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            No hay reglas personalizadas. Creá una para categorizar
            automáticamente tus transacciones.
          </p>
        )}
      </div>
    </div>
  )
}
