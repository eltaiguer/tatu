import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryBadge } from './CategoryBadge';
import { Category } from '../models';
import { getCategoryDisplay } from '../utils/category-display';
import { addCustomCategory } from '../services/categories/category-store';

describe('CategoryBadge', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders readable label for modern categories', () => {
    render(<CategoryBadge categoryId="groceries" />);

    expect(screen.getByText('Alimentación')).toBeInTheDocument();
  });

  it('renders readable label for legacy category aliases', () => {
    render(<CategoryBadge categoryId="food" />);

    expect(screen.getByText('Alimentación')).toBeInTheDocument();
  });

  it('falls back to uncategorized label for unknown categories', () => {
    render(<CategoryBadge categoryId="unknown-category" />);

    expect(screen.getByText('Unknown category')).toBeInTheDocument();
  });

  it('renders all built-in categories with a label', () => {
    Object.values(Category).forEach((category) => {
      const { label } = getCategoryDisplay(category);
      const { unmount } = render(<CategoryBadge categoryId={category} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });

  it('renders custom category icon and color', () => {
    const custom = addCustomCategory({
      label: 'Coffee',
      color: '#123456',
      icon: '☕',
    });

    render(<CategoryBadge categoryId={custom.id} />);

    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('☕')).toBeInTheDocument();
  });
});
