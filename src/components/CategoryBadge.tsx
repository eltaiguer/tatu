import { getCategoryDefinition } from '../services/categories/category-registry';

interface CategoryBadgeProps {
  categoryId: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function CategoryBadge({ categoryId, showIcon = true, size = 'md' }: CategoryBadgeProps) {
  const definition = getCategoryDefinition(categoryId);

  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${padding} ${textSize} rounded-full font-medium transition-colors`}
      style={{
        backgroundColor: `color-mix(in srgb, ${definition.color} 15%, transparent)`,
        color: definition.color,
      }}
    >
      {showIcon && definition.icon && (
        <span aria-hidden="true" className="leading-none">
          {definition.icon}
        </span>
      )}
      <span>{definition.label}</span>
    </span>
  );
}
