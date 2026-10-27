import { Product, ProductCategory } from '../types/product.types.js';
import { ProductRepository } from './product.repository.js';

/** Repositorio sobre un arreglo fijo: fixtures de tests. */
export class InMemoryProductRepository implements ProductRepository {
  private readonly products: readonly Product[];

  constructor(products: readonly Product[]) {
    this.products = products;
  }

  public async findAll(): Promise<Product[]> {
    return [...this.products];
  }

  public async findBySlug(slug: string): Promise<Product | undefined> {
    return this.products.find(p => p.slug === slug);
  }

  public async findById(id: string): Promise<Product | undefined> {
    return this.products.find(p => p.id === id);
  }

  public async countByCategory(): Promise<Partial<Record<ProductCategory, number>>> {
    const counts: Partial<Record<ProductCategory, number>> = {};
    for (const p of this.products) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }
}
