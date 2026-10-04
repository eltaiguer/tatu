import { useMemo, useState } from 'react'
import { PageHeader } from './ui/page-header'
import { toast } from 'sonner'
import { userErrorMessage } from '../utils/user-error'
import { Plus } from 'lucide-react'
import { Button } from './ui/button'
import type { Currency, Transaction, TransactionsFilter } from '../models'
import { getCategoryDefinitions } from '../services/categories/category-registry'
import {
  addCustomCategoryWithSync,
  removeCustomCategoryWithSync,
  updateCustomCategoryWithSync,
  upsertBuiltinOverrideWithSync,
  DEFAULT_CATEGORY_COLOR,
} from '../services/categories/category-store'
import { getCategoryTransactionCount } from '../services/categories/category-counts'
import { getCategoryDisplay } from '../utils/category-display'
import { buildCategorySpendingConverted } from '../services/charts/chart-data'
import { normalizeCategoryId } from '../services/categories/category-aliases'
import type { CustomPattern } from '../services/categorizer/custom-patterns'
import { CategoryForm, type CategoryFormState } from './categories/CategoryForm'
import { CategoryCard } from './categories/CategoryCard'
import { PatternRulesCard } from './categories/PatternRulesCard'
import {
  requireRepository,
  type Repository,
} from '../services/repository/repository'

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
  // The signed-in user's repository: rules and categories save through it.
  repository?: Repository | null
}

export function Categories({
  transactions,
  homeCurrency = 'USD',
  fxRate = 40.5,
  onNavigateToTransactions,
  onApplyPatternToPast,
  repository,
}: CategoriesProps) {
  const [categoriesVersion, setCategoriesVersion] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CategoryFormState>({
    id: '',
    label: '',
    color: DEFAULT_CATEGORY_COLOR,
    icon: '🏷️',
    isIgnored: false,
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
          await updateCustomCategoryWithSync(
            requireRepository(repository),
            form.id,
            {
              label,
              color: form.color,
              icon: form.icon.trim() || '🏷️',
              isIgnored: form.isIgnored,
            }
          )
        } else {
          await upsertBuiltinOverrideWithSync(
            requireRepository(repository),
            form.id,
            {
              label,
              color: form.color,
              icon: form.icon.trim() || undefined,
              isIgnored: form.isIgnored,
            }
          )
        }
        toast.success(`Categoría "${label}" guardada`)
      } else {
        await addCustomCategoryWithSync(requireRepository(repository), {
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
      await removeCustomCategoryWithSync(
        requireRepository(repository),
        categoryId
      )
      if (form.id === categoryId) resetForm()
      toast.success(`Categoría "${label}" eliminada`)
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudo eliminar la categoría'))
    } finally {
      setCategoriesVersion((v) => v + 1)
    }
  }

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
            className="flex cursor-pointer items-center gap-[6px] rounded-[var(--radius-md)] border-none bg-[var(--brand)] px-[16px] py-[9px] text-[14px] leading-[20px] font-semibold text-[var(--primary-foreground)] hover:bg-[var(--brand)] has-[>svg]:px-[16px]"
          >
            <Plus size={15} strokeWidth={2.5} />
            Nueva categoría
          </Button>
        }
      />

      {/* New / Edit category form */}
      {/* New / Edit category form */}
      {showForm && (
        <CategoryForm
          form={form}
          setForm={setForm}
          isEditing={isEditing}
          onCancel={resetForm}
          onSave={() => void handleSave()}
        />
      )}

      {/* Category grid */}
      <div className="mb-[24px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-[24px] py-[20px]">
        <h3 className="mb-[16px] text-[15px] font-semibold text-[var(--text)]">
          Tus categorías
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {categoryCards.map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              count={getCategoryTransactionCount(transactions, cat.id)}
              spend={
                cat.isIgnored
                  ? undefined
                  : spending.get(normalizeCategoryId(cat.id))
              }
              homeCurrency={homeCurrency}
              onNavigateToTransactions={onNavigateToTransactions}
              onEdit={startEdit}
              onDelete={(id) => void handleDelete(id)}
            />
          ))}
        </div>
      </div>

      {/* Pattern rules */}
      <PatternRulesCard
        transactions={transactions}
        onApplyPatternToPast={onApplyPatternToPast}
        repository={repository}
      />
    </div>
  )
}
