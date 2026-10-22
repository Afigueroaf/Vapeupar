import { describe, it, expect } from 'vitest';
import { productService } from './product.service.js';

describe('ProductService Unit Tests', () => {
  it('should return all products paginated with defaults', () => {
    const result = productService.getAll();
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBe(6);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('should filter products by category', () => {
    const result = productService.getAll({ category: 'disposables' });
    expect(result.items.every(p => p.category === 'disposables')).toBe(true);
    expect(result.total).toBe(2);
  });

  it('should filter products by nicotine strength', () => {
    const result = productService.getAll({ nicotine: '50mg' });
    expect(result.items.every(p => p.specs.nicotineStrength.includes('50mg'))).toBe(true);
  });

  it('should filter by search query matching flavor or name', () => {
    const result = productService.getAll({ search: 'mango' });
    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toContain('Nasty Juice');
  });

  it('should sort products by price ascending', () => {
    const result = productService.getAll({ sortBy: 'price', sortOrder: 'asc' });
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(result.items[i]!.price).toBeLessThanOrEqual(result.items[i + 1]!.price);
    }
  });

  it('should sort products by price descending', () => {
    const result = productService.getAll({ sortBy: 'price', sortOrder: 'desc' });
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(result.items[i]!.price).toBeGreaterThanOrEqual(result.items[i + 1]!.price);
    }
  });

  it('should paginate results correctly with small limit', () => {
    const page1 = productService.getAll({ limit: 2, page: 1 });
    const page2 = productService.getAll({ limit: 2, page: 2 });

    expect(page1.items.length).toBe(2);
    expect(page2.items.length).toBe(2);
    expect(page1.totalPages).toBe(3);
    expect(page1.items[0]?.id).not.toBe(page2.items[0]?.id);
  });

  it('should find product by slug', () => {
    const product = productService.getBySlug('lost-mary-mo10000-watermelon-ice');
    expect(product).toBeDefined();
    expect(product?.name).toContain('Lost Mary');
  });

  it('should find product by id', () => {
    const product = productService.getById('prod-002');
    expect(product).toBeDefined();
    expect(product?.name).toContain('Geekvape');
  });

  it('should return categories with counts', () => {
    const categories = productService.getCategories();
    expect(categories.length).toBe(6);
    const disposables = categories.find(c => c.id === 'disposables');
    expect(disposables?.count).toBe(2);
  });
});
