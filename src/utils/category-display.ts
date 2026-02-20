import { Category, CATEGORY_COLORS } from '../models';
import { categories as legacyCategories } from './figma-data';

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
  | 'uncategorized';

export interface CategoryDisplay {
  id: string;
  label: string;
  color: string;
  icon: CategoryIconName;
}

const MODERN_META: Record<
  Category,
  { label: string; icon: CategoryIconName; color: string }
> = {
  [Category.Groceries]: {
    label: 'Alimentacion',
    icon: 'groceries',
    color: CATEGORY_COLORS[Category.Groceries],
  },
  [Category.Restaurants]: {
    label: 'Restaurantes',
    icon: 'restaurants',
    color: CATEGORY_COLORS[Category.Restaurants],
  },
  [Category.Transport]: {
    label: 'Transporte',
    icon: 'transport',
    color: CATEGORY_COLORS[Category.Transport],
  },
  [Category.Utilities]: {
    label: 'Servicios',
    icon: 'utilities',
    color: CATEGORY_COLORS[Category.Utilities],
  },
  [Category.Healthcare]: {
    label: 'Salud',
    icon: 'healthcare',
    color: CATEGORY_COLORS[Category.Healthcare],
  },
  [Category.Shopping]: {
    label: 'Compras',
    icon: 'shopping',
    color: CATEGORY_COLORS[Category.Shopping],
  },
  [Category.Entertainment]: {
    label: 'Entretenimiento',
    icon: 'entertainment',
    color: CATEGORY_COLORS[Category.Entertainment],
  },
  [Category.Software]: {
    label: 'Software',
    icon: 'software',
    color: CATEGORY_COLORS[Category.Software],
  },
  [Category.Education]: {
    label: 'Educacion',
    icon: 'education',
    color: CATEGORY_COLORS[Category.Education],
  },
  [Category.Automotive]: {
    label: 'Automotor',
    icon: 'automotive',
    color: CATEGORY_COLORS[Category.Automotive],
  },
  [Category.Housing]: {
    label: 'Vivienda',
    icon: 'housing',
    color: CATEGORY_COLORS[Category.Housing],
  },
  [Category.Personal]: {
    label: 'Personal',
    icon: 'personal',
    color: CATEGORY_COLORS[Category.Personal],
  },
  [Category.Insurance]: {
    label: 'Seguros',
    icon: 'insurance',
    color: CATEGORY_COLORS[Category.Insurance],
  },
  [Category.Income]: {
    label: 'Ingresos',
    icon: 'income',
    color: CATEGORY_COLORS[Category.Income],
  },
  [Category.Transfer]: {
    label: 'Transferencias',
    icon: 'transfer',
    color: CATEGORY_COLORS[Category.Transfer],
  },
  [Category.Fees]: {
    label: 'Comisiones',
    icon: 'fees',
    color: CATEGORY_COLORS[Category.Fees],
  },
  [Category.Uncategorized]: {
    label: 'Sin categoria',
    icon: 'uncategorized',
    color: CATEGORY_COLORS[Category.Uncategorized],
  },
};

const ID_ALIASES: Record<string, Category> = {
  food: Category.Groceries,
  restaurant: Category.Restaurants,
  restaurants: Category.Restaurants,
  health: Category.Healthcare,
  salary: Category.Income,
  other: Category.Uncategorized,
};

function isModernCategory(id: string): id is Category {
  return Object.values(Category).includes(id as Category);
}

export function getCategoryDisplay(categoryId?: string | null): CategoryDisplay {
  const normalizedId = (categoryId || Category.Uncategorized).toLowerCase();

  const modernId = ID_ALIASES[normalizedId] || normalizedId;
  if (isModernCategory(modernId)) {
    const meta = MODERN_META[modernId];
    return {
      id: modernId,
      label: meta.label,
      color: meta.color,
      icon: meta.icon,
    };
  }

  const legacy = legacyCategories.find((category) => category.id === normalizedId);
  if (legacy) {
    return {
      id: legacy.id,
      label: legacy.name,
      color: legacy.color,
      icon: ID_ALIASES[legacy.id] ? MODERN_META[ID_ALIASES[legacy.id]].icon : 'uncategorized',
    };
  }

  return {
    id: Category.Uncategorized,
    label: MODERN_META[Category.Uncategorized].label,
    color: MODERN_META[Category.Uncategorized].color,
    icon: MODERN_META[Category.Uncategorized].icon,
  };
}
