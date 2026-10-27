import { Product, ProductCategory } from '../types/product.types.js';

/**
 * Acceso al catálogo público. Solo devuelve productos visibles en el sitio
 * (publicados y con precio); los borradores no existen para este contrato.
 * Filtros, orden y paginación son lógica de `ProductService`, no de aquí.
 */
export interface ProductRepository {
  findAll(): Promise<Product[]>;
  findBySlug(slug: string): Promise<Product | undefined>;
  findById(id: string): Promise<Product | undefined>;
  /** Categorías sin productos pueden faltar en el resultado. */
  countByCategory(): Promise<Partial<Record<ProductCategory, number>>>;
}
