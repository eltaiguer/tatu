import { describe, it, expect } from 'vitest'
import { Category, CATEGORY_LABELS, CATEGORY_ICONS } from './category'

describe('Category System', () => {
  describe('Category enum', () => {
    it('should have Groceries category', () => {
      expect(Category.Groceries).toBe('groceries')
    })

    it('should have Restaurants category', () => {
      expect(Category.Restaurants).toBe('restaurants')
    })

    it('should have Transport category', () => {
      expect(Category.Transport).toBe('transport')
    })

    it('should have Utilities category', () => {
      expect(Category.Utilities).toBe('utilities')
    })

    it('should have Healthcare category', () => {
      expect(Category.Healthcare).toBe('healthcare')
    })

    it('should have Shopping category', () => {
      expect(Category.Shopping).toBe('shopping')
    })

    it('should have Entertainment category', () => {
      expect(Category.Entertainment).toBe('entertainment')
    })

    it('should have Software category', () => {
      expect(Category.Software).toBe('software')
    })

    it('should have Income category', () => {
      expect(Category.Income).toBe('income')
    })

    it('should have Transfer category', () => {
      expect(Category.Transfer).toBe('transfer')
    })

    it('should have Fees category', () => {
      expect(Category.Fees).toBe('fees')
    })

    it('should have Insurance category', () => {
      expect(Category.Insurance).toBe('insurance')
    })

    it('should have Education category', () => {
      expect(Category.Education).toBe('education')
    })

    it('should have Automotive category', () => {
      expect(Category.Automotive).toBe('automotive')
    })

    it('should have Housing category', () => {
      expect(Category.Housing).toBe('housing')
    })

    it('should have Personal category', () => {
      expect(Category.Personal).toBe('personal')
    })

    it('should have Uncategorized as default', () => {
      expect(Category.Uncategorized).toBe('uncategorized')
    })
  })

  describe('CATEGORY_LABELS', () => {
    it('should have labels for all categories', () => {
      const categories = Object.values(Category)
      categories.forEach((category) => {
        expect(CATEGORY_LABELS[category]).toBeDefined()
        expect(CATEGORY_LABELS[category].length).toBeGreaterThan(0)
      })
    })

    it('should have user-friendly label for Groceries', () => {
      expect(CATEGORY_LABELS[Category.Groceries]).toBe('Alimentación')
    })

    it('should have user-friendly label for Restaurants', () => {
      expect(CATEGORY_LABELS[Category.Restaurants]).toBe('Restaurantes')
    })

    it('should have user-friendly label for Software', () => {
      expect(CATEGORY_LABELS[Category.Software]).toBe('Software y suscripciones')
    })

    it('should have user-friendly label for Uncategorized', () => {
      expect(CATEGORY_LABELS[Category.Uncategorized]).toBe('Sin categoría')
    })
  })

  describe('CATEGORY_ICONS', () => {
    it('should have icons for all categories', () => {
      const categories = Object.values(Category)
      categories.forEach((category) => {
        expect(CATEGORY_ICONS[category]).toBeDefined()
        expect(CATEGORY_ICONS[category].length).toBeGreaterThan(0)
      })
    })

    it('should have appropriate icon for Groceries', () => {
      expect(CATEGORY_ICONS[Category.Groceries]).toBe('🛒')
    })

    it('should have appropriate icon for Restaurants', () => {
      expect(CATEGORY_ICONS[Category.Restaurants]).toBe('🍽️')
    })

    it('should have appropriate icon for Transport', () => {
      expect(CATEGORY_ICONS[Category.Transport]).toBe('🚗')
    })

    it('should have appropriate icon for Income', () => {
      expect(CATEGORY_ICONS[Category.Income]).toBe('💰')
    })

    it('should have appropriate icon for Software', () => {
      expect(CATEGORY_ICONS[Category.Software]).toBe('💻')
    })

    it('should have appropriate icon for Uncategorized', () => {
      expect(CATEGORY_ICONS[Category.Uncategorized]).toBe('❓')
    })
  })

  describe('Category helpers', () => {
    it('should identify expense categories', () => {
      const expenseCategories = [
        Category.Groceries,
        Category.Restaurants,
        Category.Utilities,
        Category.Healthcare,
        Category.Shopping,
      ]

      expenseCategories.forEach((category) => {
        expect(category).not.toBe(Category.Income)
        expect(category).not.toBe(Category.Transfer)
      })
    })

    it('should identify income category', () => {
      expect(Category.Income).toBe('income')
    })

    it('should identify transfer category', () => {
      expect(Category.Transfer).toBe('transfer')
    })
  })
})
