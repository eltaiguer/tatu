import { useMemo, useState } from 'react'
import { Category } from '../models'
import {
  addCustomCategory,
  listCustomCategories,
  removeCustomCategory,
  updateCustomCategory,
} from '../services/categories/category-store'
import {
  getCategoryDefinitions,
  getCategoryDefinition,
} from '../services/categories/category-registry'
import {
  clearMerchantCategoryOverride,
  listMerchantCategoryOverrides,
  setMerchantCategoryOverride,
} from '../services/categorizer/category-overrides'

interface CategoryManagementProps {
  onCategoriesUpdated?: () => void
}

export function CategoryManagement({
  onCategoriesUpdated,
}: CategoryManagementProps) {
  const [customCategories, setCustomCategories] = useState(
    listCustomCategories()
  )
  const [merchantRules, setMerchantRules] = useState(
    listMerchantCategoryOverrides()
  )
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#22c55e')
  const [merchantName, setMerchantName] = useState('')
  const [merchantCategory, setMerchantCategory] = useState<string>(
    Category.Groceries
  )

  const categoryOptions = getCategoryDefinitions()

  const ruleEntries = useMemo(
    () =>
      Object.entries(merchantRules).map(([key, rule]) => ({
        id: key,
        name: rule.merchantName ?? key,
        categoryId: rule.category,
        updatedAt: rule.updatedAt,
      })),
    [merchantRules]
  )

  const refreshCategories = () => {
    setCustomCategories(listCustomCategories())
    onCategoriesUpdated?.()
  }

  const refreshRules = () => {
    setMerchantRules(listMerchantCategoryOverrides())
  }

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) {
      return
    }

    addCustomCategory({
      label: newCategoryName.trim(),
      color: newCategoryColor,
    })
    setNewCategoryName('')
    refreshCategories()
  }

  const handleUpdateCategory = (
    id: string,
    updates: { label?: string; color?: string }
  ) => {
    updateCustomCategory(id, updates)
    setCustomCategories((current) =>
      current.map((category) =>
        category.id === id ? { ...category, ...updates } : category
      )
    )
    onCategoriesUpdated?.()
  }

  const handleRemoveCategory = (id: string) => {
    removeCustomCategory(id)
    setCustomCategories((current) =>
      current.filter((category) => category.id !== id)
    )
    onCategoriesUpdated?.()
  }

  const handleAddRule = () => {
    if (!merchantName.trim()) {
      return
    }

    setMerchantCategoryOverride(merchantName, merchantCategory)
    setMerchantName('')
    refreshRules()
  }

  const handleRemoveRule = (merchant: string) => {
    clearMerchantCategoryOverride(merchant)
    refreshRules()
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-sm space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-gray-400 dark:text-gray-500">
          Categories
        </p>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Category Management
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Custom categories
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Create and customize labels for repeated expenses.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="text-xs text-gray-500">
              New category name
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
              />
            </label>
            <label className="text-xs text-gray-500">
              New category color
              <input
                type="color"
                value={newCategoryColor}
                onChange={(event) => setNewCategoryColor(event.target.value)}
                className="mt-2 h-10 w-16 cursor-pointer rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1"
              />
            </label>
            <button
              type="button"
              onClick={handleAddCategory}
              className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              Add category
            </button>
          </div>

          <div className="space-y-3">
            {customCategories.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No custom categories yet.
              </p>
            ) : (
              customCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3"
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <input
                    aria-label={`Category name ${category.label}`}
                    value={category.label}
                    onChange={(event) =>
                      handleUpdateCategory(category.id, {
                        label: event.target.value,
                      })
                    }
                    className="flex-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                  />
                  <input
                    aria-label={`Category color ${category.label}`}
                    type="color"
                    value={category.color}
                    onChange={(event) =>
                      handleUpdateCategory(category.id, {
                        color: event.target.value,
                      })
                    }
                    className="h-8 w-10 cursor-pointer rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveCategory(category.id)}
                    className="text-xs font-semibold text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Merchant rules
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Override automatic categorization with custom rules.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="text-xs text-gray-500">
              Merchant name
              <input
                value={merchantName}
                onChange={(event) => setMerchantName(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
              />
            </label>
            <label className="text-xs text-gray-500">
              Rule category
              <select
                value={merchantCategory}
                onChange={(event) => setMerchantCategory(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
              >
                {categoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleAddRule}
              className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              Add rule
            </button>
          </div>

          <div className="space-y-3">
            {ruleEntries.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No merchant overrides yet.
              </p>
            ) : (
              ruleEntries.map((rule) => {
                const definition = getCategoryDefinition(rule.categoryId)
                return (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-600 dark:text-gray-300"
                  >
                    <span className="font-semibold text-gray-800 dark:text-gray-100">
                      {rule.name}
                    </span>
                    <span className="flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: definition.color }}
                        aria-hidden="true"
                      />
                      {definition.label}
                    </span>
                    <span className="text-gray-400">
                      {new Date(rule.updatedAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(rule.name)}
                      className="ml-auto text-xs font-semibold text-red-500 hover:text-red-700"
                      aria-label={`Remove ${rule.name}`}
                    >
                      Remove
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
