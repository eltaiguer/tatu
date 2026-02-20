// Category Badge with icon for Tatu

import {
  Utensils,
  Car,
  Zap,
  Tv,
  ShoppingBag,
  Heart,
  GraduationCap,
  Laptop,
  Home,
  UserRound,
  Shield,
  ArrowLeftRight,
  Receipt,
  TrendingUp,
  Ellipsis
} from 'lucide-react';
import { getCategoryDisplay } from '../utils/category-display';

interface CategoryBadgeProps {
  categoryId: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

const iconMap = {
  groceries: Utensils,
  restaurants: Utensils,
  transport: Car,
  transfer: ArrowLeftRight,
  utilities: Zap,
  entertainment: Tv,
  shopping: ShoppingBag,
  healthcare: Heart,
  education: GraduationCap,
  software: Laptop,
  automotive: Car,
  housing: Home,
  personal: UserRound,
  insurance: Shield,
  fees: Receipt,
  uncategorized: Ellipsis,
  income: TrendingUp,
};

export function CategoryBadge({ categoryId, showIcon = true, size = 'md' }: CategoryBadgeProps) {
  const category = getCategoryDisplay(categoryId);

  const Icon = iconMap[category.icon];
  const iconSize = size === 'sm' ? 12 : 14;
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${padding} ${textSize} rounded-full font-medium transition-colors`}
      style={{
        backgroundColor: `color-mix(in srgb, ${category.color} 15%, transparent)`,
        color: category.color,
      }}
    >
      {showIcon && Icon && <Icon size={iconSize} />}
      <span>{category.label}</span>
    </span>
  );
}
