export type ProductCategory = 
  | 'disposables'       // Desechables (Puffs)
  | 'pod-systems'      // Pods recargables
  | 'mods-tanks'       // Mods y tanques avanzados
  | 'salt-nic'         // Sales de nicotina
  | 'freebase-liquids' // E-líquidos base libre
  | 'coils-accessories';// Resistencias, pods de repuesto, accesorios

/** Una línea varía en sabor (ECO PRO) o en color (ONE). */
export type VariantKind = 'flavor' | 'color';

/**
 * Sabor o color que se puede pedir de una línea.
 *
 * Solo las variantes activas: una inactiva está retirada del sitio, mientras
 * que una agotada sigue aquí con `inStock: false` para que el cliente vea que
 * existe y pueda preguntar por ella. El precio es de la línea, no de la
 * variante (ADR-002 §3).
 */
export interface ProductVariant {
  id: string;
  kind: VariantKind;
  name: string;
  /** Único dentro de su línea, no en todo el catálogo. */
  slug: string;
  /** Vacía si la variante no tiene foto propia: se usa la de la línea. */
  imageUrl: string;
  inStock: boolean;
  /** Disponible según la caché del libro de inventario, nunca negativo. */
  stock: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string;
  /**
   * Slug de la marca: identificador estable para filtrar. El nombre puede
   * cambiar desde la consola (o repetirse con otra grafía); el slug es único.
   */
  brandSlug: string;
  category: ProductCategory;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice?: number;
  inStock: boolean;
  stock: number;
  imageUrl: string;
  galleryUrls?: string[];
  featured: boolean;
  /**
   * Elegida para el prisma 3D de la portada.
   *
   * El cliente la usa para repartir las caras de la vitrina; es independiente
   * de `featured`, que es merchandising del catálogo.
   */
  showcase: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  // Atributos específicos del mundo del vapeo
  specs: {
    puffCount?: number;          // ej: 10000 puffs
    nicotineStrength: string;    // ej: "50mg (5%)", "20mg (2%)", "0mg"
    flavorProfile?: string;      // ej: "Sandía Helada", "Mango Fresa", "Menta Polar"
    liquidCapacity?: string;     // ej: "18ml"
    batteryCapacity?: string;    // ej: "650mAh USB-C"
    resistance?: string;         // ej: "1.2 ohm Mesh"
    rechargeable?: boolean;      // Batería recargable en desechables
  };
  tags: string[];
  /** Variantes activas, en el orden de la consola (`sortOrder`, luego nombre). */
  variants: ProductVariant[];
}

export interface ProductFilters {
  category?: ProductCategory;
  brand?: string;
  nicotine?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  featured?: boolean;
  showcase?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'name' | 'puffCount';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProductsResult {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
