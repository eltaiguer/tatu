import { Category, CATEGORY_COLORS, CATEGORY_LABELS } from '../models';
import {
  getCategoryDefinition,
  ID_ALIASES,
} from '../services/categories/category-registry';

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
  | 'internal_transfer'
  | 'external_transfer'
  | 'fees'
  | 'uncategorized';

export interface CategoryDisplay {
  id: string;
  label: string;
  color: string;
  icon: CategoryIconName;
}

const MODERN_META: Record<Category, { icon: CategoryIconName }> = {
  [Category.Groceries]: { icon: 'groceries' },
  [Category.Restaurants]: { icon: 'restaurants' },
  [Category.Transport]: { icon: 'transport' },
  [Category.Utilities]: { icon: 'utilities' },
  [Category.Healthcare]: { icon: 'healthcare' },
  [Category.Shopping]: { icon: 'shopping' },
  [Category.Entertainment]: { icon: 'entertainment' },
  [Category.Software]: { icon: 'software' },
  [Category.Education]: { icon: 'education' },
  [Category.Automotive]: { icon: 'automotive' },
  [Category.Housing]: { icon: 'housing' },
  [Category.Personal]: { icon: 'personal' },
  [Category.Insurance]: { icon: 'insurance' },
  [Category.Income]: { icon: 'income' },
  [Category.InternalTransfer]: { icon: 'internal_transfer' },
  [Category.ExternalTransfer]: { icon: 'external_transfer' },
  [Category.Fees]: { icon: 'fees' },
  [Category.Uncategorized]: { icon: 'uncategorized' },
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
    const def = getCategoryDefinition(modernId);
    return {
      id: modernId,
      label: def.label,
      color: def.color,
      icon: MODERN_META[modernId].icon,
    };
  }

  return {
    id: normalizedId,
    label: humanizeCategoryId(normalizedId),
    color: CATEGORY_COLORS[Category.Uncategorized],
    icon: MODERN_META[Category.Uncategorized].icon,
  };
}
