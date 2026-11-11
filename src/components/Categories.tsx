import { useMemo, useState } from 'react'
import { PageHeader } from './ui/page-header'
import { toast } from 'sonner'
import { userErrorMessage } from '../utils/user-error'
import { Plus } from 'lucide-react'
import { Button } from './ui/button'
import { Section } from './ui/section'
import type { Currency, Transaction, TransactionsFilter } from '../models'
import { getCategoryDefinitions } from '../services/categories/category-registry'
import {
  addCustomCategoryWithSync,
  removeCustomCategoryWithSync,
  setCategoryHouseholdWithSync,
  updateCustomCategoryWithSync,
  upsertBuiltinOverrideWithSync,
} from '../services/categories/category-store'
import { getCategoryTransactionCount } from '../services/categories/category-counts'
import { resolveCategory } from '../services/categories/category-registry'
import { buildCategorySpendingConverted } from '../services/charts/chart-data'
import { normalizeCategoryId } from '../services/categories/category-aliases'
import {
  canHaveHouseholdDefault,
  categoryHouseholdChoice,
  currentHouseholdRules,
  isCategoryHousehold,
} from '../services/household/household'
import { isWorkspaceOwner } from '../stores/workspace-state'
import type { CustomPattern } from '../services/categorizer/custom-patterns'
import {
  CategoryForm,
  EMPTY_FORM,
  type CategoryFormState,
} from './categories/CategoryForm'
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
  // Tiles whose household flip is being saved (their toggle is disabled).
  const [savingHousehold, setSavingHousehold] = useState<ReadonlySet<string>>(
    new Set()
  )
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM)

  const categoryDefinitions = getCategoryDefinitions()
  // Read on render (the household rules value, of which the category defaults
  // are the part Categorías edits): memoized, never cached in state.
  const householdRules = currentHouseholdRules()
  const isEditing = form.id.length > 0
  // A new category can always have one; an edited one unless it is Sin
  // categoría or Ingresos.
  const canHaveHousehold = !isEditing || canHaveHouseholdDefault(form.id)

  function resetForm() {
    setForm(EMPTY_FORM)
    setShowForm(false)
  }

  function openNewForm() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function startEdit(categoryId: string) {
    const cat = categoryDefinitions.find((c) => c.id === categoryId)
    if (!cat) return
    const household = isCategoryHousehold(cat.id, householdRules)
    setForm({
      id: cat.id,
      label: cat.label,
      color: cat.color,
      icon: cat.icon || '🏷️',
      isIgnored: cat.isIgnored ?? false,
      isHousehold: household,
      initialIsHousehold: household,
    })
    setShowForm(true)
  }

  // Every change reports success only after it reached the server; on
  // failure the store helpers have already undone it locally, and the
  // re-render in `finally` shows that restored state.
  async function handleSave() {
    if (!form.label.trim()) return
    const label = form.label.trim()
    // One rule: the default is sent only when the box differs from what the
    // form opened with; otherwise undefined leaves the stored value alone.
    const householdChanged =
      canHaveHousehold && form.isHousehold !== form.initialIsHousehold
    const household =
      householdChanged && isEditing
        ? categoryHouseholdChoice(form.id, form.isHousehold)
        : undefined
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
              isHousehold: household,
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
              isHousehold: household,
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
          isHousehold: householdChanged && form.isHousehold ? true : undefined,
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

  // One click flips the category's household default and saves it. Going to
  // the app's own default stores nothing (null), so it keeps following it.
  async function handleToggleHousehold(categoryId: string) {
    const label = resolveCategory(categoryId).label
    const next = !isCategoryHousehold(categoryId, currentHouseholdRules())
    setSavingHousehold((ids) => new Set(ids).add(categoryId))
    try {
      const repo = requireRepository(repository)
      await setCategoryHouseholdWithSync(
        repo,
        categoryId,
        categoryHouseholdChoice(categoryId, next)
      )
      // Another user may have signed in while the write was in flight.
      if (!isWorkspaceOwner(repo.userId)) return
      // The open form's box shows what is stored, unless the user changed it.
      setForm((f) =>
        f.id === categoryId && f.isHousehold === f.initialIsHousehold
          ? { ...f, isHousehold: next, initialIsHousehold: next }
          : f
      )
      toast.success(
        next
          ? `${label}: ahora es gasto del hogar`
          : `${label}: ya no es gasto del hogar`
      )
    } catch (error) {
      toast.error(userErrorMessage(error, 'No se pudo guardar el cambio'))
    } finally {
      setSavingHousehold((ids) => {
        const rest = new Set(ids)
        rest.delete(categoryId)
        return rest
      })
      setCategoriesVersion((v) => v + 1)
    }
  }

  async function handleDelete(categoryId: string) {
    const label = resolveCategory(categoryId).label
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
  // Transactions can keep a category whose definition was deleted; Resumen
  // still counts them, so they get a card too (no edit/delete), drawn the
  // way every other surface draws that id.
  const orphanCards = Array.from(spending.keys())
    .map((id) => resolveCategory(id))
    .filter((category) => !category.known)
    .map((category) => ({ ...category, isOrphan: true }))
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
    <div className="space-y-8">
      {/* Page header */}
      <PageHeader
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
      {showForm && (
        <CategoryForm
          form={form}
          setForm={setForm}
          isEditing={isEditing}
          canHaveHousehold={canHaveHousehold}
          saveDisabled={savingHousehold.has(form.id)}
          onCancel={resetForm}
          onSave={() => void handleSave()}
        />
      )}

      {/* Category grid: tiles straight on the page, no wrapping card */}
      <Section title="Tus categorías">
        <p className="text-[13px] text-[var(--text-faint)]">
          La casita marca los gastos del hogar. Podés cambiarlo en cada
          transacción.
        </p>
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
              household={isCategoryHousehold(cat.id, householdRules)}
              householdSaving={savingHousehold.has(cat.id)}
              onToggleHousehold={
                cat.isOrphan || !canHaveHouseholdDefault(cat.id)
                  ? undefined
                  : (id) => void handleToggleHousehold(id)
              }
              onNavigateToTransactions={onNavigateToTransactions}
              onEdit={startEdit}
              onDelete={(id) => void handleDelete(id)}
            />
          ))}
        </div>
      </Section>

      {/* Pattern rules */}
      <PatternRulesCard
        transactions={transactions}
        onApplyPatternToPast={onApplyPatternToPast}
        repository={repository}
      />
    </div>
  )
}
