import { MOCK_PRODUCTS } from '../data/mock-products.js';
import { Product, ProductCategory, ProductFilters } from '../types/product.types.js';

export class ProductService {
  private products: Product[] = [...MOCK_PRODUCTS];

  public getAll(filters?: ProductFilters): Product[] {
    let result = [...this.products];

    if (!filters) return result;

    if (filters.category) {
      result = result.filter(p => p.category === filters.category);
    }

    if (filters.brand) {
      const brandLower = filters.brand.toLowerCase();
      result = result.filter(p => p.brand.toLowerCase() === brandLower);
    }

    if (filters.featured !== undefined) {
      result = result.filter(p => p.featured === filters.featured);
    }

    if (filters.minPrice !== undefined) {
      result = result.filter(p => p.price >= (filters.minPrice ?? 0));
    }

    if (filters.maxPrice !== undefined) {
      result = result.filter(p => p.price <= (filters.maxPrice ?? Infinity));
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    return result;
  }

  public getBySlug(slug: string): Product | undefined {
    return this.products.find(p => p.slug === slug);
  }

  public getById(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
  }

  public getCategories(): { id: ProductCategory; name: string; count: number }[] {
    const counts: Record<ProductCategory, number> = {
      'disposables': 0,
      'pod-systems': 0,
      'mods-tanks': 0,
      'salt-nic': 0,
      'freebase-liquids': 0,
      'coils-accessories': 0
    };

    for (const p of this.products) {
      if (counts[p.category] !== undefined) {
        counts[p.category]++;
      }
    }

    return [
      { id: 'disposables', name: 'Desechables (Puffs)', count: counts['disposables'] },
      { id: 'pod-systems', name: 'Pods Recargables', count: counts['pod-systems'] },
      { id: 'salt-nic', name: 'Sales de Nicotina', count: counts['salt-nic'] },
      { id: 'freebase-liquids', name: 'E-Líquidos Freebase', count: counts['freebase-liquids'] },
      { id: 'mods-tanks', name: 'Mods y Tanques', count: counts['mods-tanks'] },
      { id: 'coils-accessories', name: 'Resistencias y Accesorios', count: counts['coils-accessories'] }
    ];
  }
}

export const productService = new ProductService();
