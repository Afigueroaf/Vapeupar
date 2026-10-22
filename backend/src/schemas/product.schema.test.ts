import { describe, it, expect } from 'vitest';
import { ProductQuerySchema, ProductSlugSchema } from './product.schema.js';

describe('ProductSchema - Validation Tests', () => {
  describe('ProductQuerySchema', () => {
    it('should validate valid query parameters', () => {
      const query = {
        category: 'disposables',
        brand: 'Lost Mary',
        minPrice: '50000',
        maxPrice: '80000',
        search: 'sandia',
        page: '1',
        limit: '10',
        sortBy: 'price',
        sortOrder: 'asc'
      };

      const result = ProductQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.category).toBe('disposables');
        expect(result.data.minPrice).toBe(50000);
        expect(result.data.maxPrice).toBe(80000);
        expect(result.data.limit).toBe(10);
      }
    });

    it('should reject invalid category', () => {
      const query = { category: 'invalid-cat' };
      const result = ProductQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it('should reject when minPrice > maxPrice', () => {
      const query = { minPrice: '100000', maxPrice: '50000' };
      const result = ProductQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toContain('El precio mínimo no puede ser mayor');
      }
    });

    it('should reject negative prices', () => {
      const query = { minPrice: '-100' };
      const result = ProductQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });

    it('should enforce limit cap of 50', () => {
      const query = { limit: '100' };
      const result = ProductQuerySchema.safeParse(query);
      expect(result.success).toBe(false);
    });
  });

  describe('ProductSlugSchema', () => {
    it('should accept valid kebab-case slugs', () => {
      const result = ProductSlugSchema.safeParse({ slug: 'lost-mary-mo10000-watermelon-ice' });
      expect(result.success).toBe(true);
    });

    it('should reject slugs with special characters, spaces or SQL injection syntax', () => {
      expect(ProductSlugSchema.safeParse({ slug: 'slug with spaces' }).success).toBe(false);
      expect(ProductSlugSchema.safeParse({ slug: "slug' OR '1'='1" }).success).toBe(false);
      expect(ProductSlugSchema.safeParse({ slug: '<script>' }).success).toBe(false);
    });
  });
});
