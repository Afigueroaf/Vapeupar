import { CATEGORY_LABELS, PRODUCT_CATEGORIES } from '../catalog/categories.js';
import { ProductRepository } from '../repositories/product.repository.js';
import { PrismaProductRepository } from '../repositories/prisma-product.repository.js';
import { Product, ProductCategory, ProductFilters, PaginatedProductsResult } from '../types/product.types.js';

export class ProductService {
  constructor(private readonly repository: ProductRepository) {}

  public async getAll(filters?: ProductFilters): Promise<PaginatedProductsResult> {
    let result = await this.repository.findAll();

    if (filters) {
      if (filters.category) {
        result = result.filter(p => p.category === filters.category);
      }

      if (filters.brand) {
        const brandLower = filters.brand.toLowerCase();
        result = result.filter(p => p.brand.toLowerCase() === brandLower);
      }

      if (filters.nicotine) {
        const nicLower = filters.nicotine.toLowerCase();
        result = result.filter(p => p.specs.nicotineStrength.toLowerCase().includes(nicLower));
      }

      if (filters.featured !== undefined) {
        result = result.filter(p => p.featured === filters.featured);
      }

      if (filters.minPrice !== undefined) {
        result = result.filter(p => p.price >= filters.minPrice!);
      }

      if (filters.maxPrice !== undefined) {
        result = result.filter(p => p.price <= filters.maxPrice!);
      }

      if (filters.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(p => 
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.specs.flavorProfile && p.specs.flavorProfile.toLowerCase().includes(q)) ||
          p.tags.some(t => t.toLowerCase().includes(q))
        );
      }

      // Sorting
      if (filters.sortBy) {
        const orderMultiplier = filters.sortOrder === 'desc' ? -1 : 1;
        result.sort((a, b) => {
          if (filters.sortBy === 'price') {
            return (a.price - b.price) * orderMultiplier;
          }
          if (filters.sortBy === 'name') {
            return a.name.localeCompare(b.name) * orderMultiplier;
          }
          if (filters.sortBy === 'puffCount') {
            const puffsA = a.specs.puffCount ?? 0;
            const puffsB = b.specs.puffCount ?? 0;
            return (puffsA - puffsB) * orderMultiplier;
          }
          return 0;
        });
      }
    }

    const total = result.length;
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const limit = filters?.limit && filters.limit > 0 ? filters.limit : 20;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedItems = result.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
      totalPages
    };
  }

  public async getBySlug(slug: string): Promise<Product | undefined> {
    return this.repository.findBySlug(slug);
  }

  public async getById(id: string): Promise<Product | undefined> {
    return this.repository.findById(id);
  }

  public async getCategories(): Promise<{ id: ProductCategory; name: string; count: number }[]> {
    const counts = await this.repository.countByCategory();
    return PRODUCT_CATEGORIES.map(id => ({ id, name: CATEGORY_LABELS[id], count: counts[id] ?? 0 }));
  }
}

export const productService = new ProductService(new PrismaProductRepository());
