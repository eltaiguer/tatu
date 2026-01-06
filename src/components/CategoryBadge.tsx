// Category Badge with icon for Tatu

import {
  Utensils,
  Car,
  Zap,
  Tv,
  ShoppingBag,
  Heart,
  GraduationCap,
  TrendingUp,
  Ellipsis
} from 'lucide-react';
import { categories } from '../utils/figma-data';

interface CategoryBadgeProps {
  categoryId: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

const iconMap = {
  food: Utensils,
  transport: Car,
  utilities: Zap,
  entertainment: Tv,
  shopping: ShoppingBag,
  health: Heart,
  education: GraduationCap,
  income: TrendingUp,
  other: Ellipsis,
};

export function CategoryBadge({ categoryId, showIcon = true, size = 'md' }: CategoryBadgeProps) {
  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;

  const Icon = iconMap[categoryId as keyof typeof iconMap];
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
      <span>{category.name}</span>
    </span>
  );
}
