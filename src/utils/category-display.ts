import { Category, CATEGORY_COLORS, CATEGORY_LABELS } from '../models';
import { ID_ALIASES } from '../services/categories/category-registry';
import { listCustomCategories } from '../services/categories/category-store';

export type CategoryIconName =
  | 'groceries'
  | 'restaurants'
  | 'transport'
  | 'utilities'
  | 'healthcare'
  | 'shopping'
  | 'entertainment'
  | 'software'
  | 'education'
  | 'automotive'
  | 'housing'
  | 'personal'
  | 'insurance'
  | 'income'
  | 'transfer'
  | 'fees'
  | 'ignored'
  | 'uncategorized';

export interface CategoryDisplay {
  id: string;
  label: string;
  color: string;
  icon: CategoryIconName;
}

const MODERN_META: Record<Category, { icon: CategoryIconName; color: string }> =
  {
    [Category.Groceries]: {
      icon: 'groceries',
      color: CATEGORY_COLORS[Category.Groceries],
    },
    [Category.Restaurants]: {
      icon: 'restaurants',
      color: CATEGORY_COLORS[Category.Restaurants],
    },
    [Category.Transport]: {
      icon: 'transport',
      color: CATEGORY_COLORS[Category.Transport],
    },
    [Category.Utilities]: {
      icon: 'utilities',
      color: CATEGORY_COLORS[Category.Utilities],
    },
    [Category.Healthcare]: {
      icon: 'healthcare',
      color: CATEGORY_COLORS[Category.Healthcare],
    },
    [Category.Shopping]: {
      icon: 'shopping',
      color: CATEGORY_COLORS[Category.Shopping],
    },
    [Category.Entertainment]: {
      icon: 'entertainment',
      color: CATEGORY_COLORS[Category.Entertainment],
    },
    [Category.Software]: {
      icon: 'software',
      color: CATEGORY_COLORS[Category.Software],
    },
    [Category.Education]: {
      icon: 'education',
      color: CATEGORY_COLORS[Category.Education],
    },
    [Category.Automotive]: {
      icon: 'automotive',
      color: CATEGORY_COLORS[Category.Automotive],
    },
    [Category.Housing]: {
      icon: 'housing',
      color: CATEGORY_COLORS[Category.Housing],
    },
    [Category.Personal]: {
      icon: 'personal',
      color: CATEGORY_COLORS[Category.Personal],
    },
    [Category.Insurance]: {
      icon: 'insurance',
      color: CATEGORY_COLORS[Category.Insurance],
    },
    [Category.Income]: {
      icon: 'income',
      color: CATEGORY_COLORS[Category.Income],
    },
    [Category.Transfer]: {
      icon: 'transfer',
      color: CATEGORY_COLORS[Category.Transfer],
    },
    [Category.Fees]: {
      icon: 'fees',
      color: CATEGORY_COLORS[Category.Fees],
    },
    [Category.Ignored]: {
      icon: 'ignored',
      color: CATEGORY_COLORS[Category.Ignored],
    },
    [Category.Uncategorized]: {
      icon: 'uncategorized',
      color: CATEGORY_COLORS[Category.Uncategorized],
    },
  };

function isModernCategory(id: string): id is Category {
  return Object.values(Category).includes(id as Category);
}

function humanizeCategoryId(categoryId: string): string {
  const words = categoryId
    .trim()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

  if (words.length === 0) {
    return CATEGORY_LABELS[Category.Uncategorized];
  }

  const humanized = words.join(' ');
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}

export function getCategoryDisplay(categoryId?: string | null): CategoryDisplay {
  const normalizedId = (categoryId || Category.Uncategorized).toLowerCase();

  const modernId = ID_ALIASES[normalizedId] ?? normalizedId;
  if (isModernCategory(modernId)) {
    const meta = MODERN_META[modernId];
    const override = listCustomCategories().find((c) => c.id === modernId);
    return {
      id: modernId,
      label: override?.label ?? CATEGORY_LABELS[modernId],
      color: override?.color ?? meta.color,
      icon: meta.icon,
    };
  }

  return {
    id: normalizedId,
    label: humanizeCategoryId(normalizedId),
    color: MODERN_META[Category.Uncategorized].color,
    icon: MODERN_META[Category.Uncategorized].icon,
  };
}
