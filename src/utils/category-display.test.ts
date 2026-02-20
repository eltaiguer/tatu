import { describe, expect, it } from 'vitest';
import { Category } from '../models';
import { getCategoryDisplay } from './category-display';

describe('getCategoryDisplay', () => {
  it('maps modern category ids', () => {
    const result = getCategoryDisplay('groceries');

    expect(result.id).toBe('groceries');
    expect(result.label).toBe('Alimentación');
    expect(result.icon).toBe('groceries');
  });

  it('maps legacy aliases to modern categories', () => {
    const result = getCategoryDisplay('food');

    expect(result.id).toBe('groceries');
    expect(result.label).toBe('Alimentación');
    expect(result.icon).toBe('groceries');
  });

  it('falls back to uncategorized for unknown ids', () => {
    const result = getCategoryDisplay('non-existent-category');

    expect(result.id).toBe('uncategorized');
    expect(result.label).toBe('Sin categoría');
    expect(result.icon).toBe('uncategorized');
  });

  it('has label and icon for every built-in category', () => {
    Object.values(Category).forEach((category) => {
      const result = getCategoryDisplay(category);
      expect(result.label.length).toBeGreaterThan(0);
      expect(result.icon.length).toBeGreaterThan(0);
    });
  });
});
