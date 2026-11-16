export type ProductCategory = 
  | 'disposables'
  | 'pod-systems'
  | 'mods-tanks'
  | 'salt-nic'
  | 'freebase-liquids'
  | 'coils-accessories';

/** Una línea varía en sabor (ECO PRO) o en color (ONE). */
export type VariantKind = 'flavor' | 'color';

/**
 * Sabor o color que se puede pedir de una línea. Espejo de
 * `backend/src/types/product.types.ts`: solo llegan las activas, y una agotada
 * llega con `inStock: false` en vez de faltar.
 */
export interface ProductVariant {
  id: string;
  kind: VariantKind;
  name: string;
  /** Único dentro de su línea; es el que va en `?sabor=` de la ficha. */
  slug: string;
  /** Vacía si la variante no tiene foto propia: se usa la de la línea. */
  imageUrl: string;
  inStock: boolean;
  stock: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  brand: string;
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
   * Elegida desde la consola para el prisma 3D de la portada.
   *
   * Independiente de `featured`: aquel es merchandising del catálogo y este
   * decide qué se ve girando en la vitrina. Lo consume
   * `components/prism/faces.ts`.
   */
  showcase: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  specs: {
    puffCount?: number;
    nicotineStrength: string;
    flavorProfile?: string;
    liquidCapacity?: string;
    batteryCapacity?: string;
    resistance?: string;
    rechargeable?: boolean;
  };
  tags: string[];
  /** Variantes activas, en el orden de la consola. */
  variants: ProductVariant[];
}

export interface CategoryInfo {
  id: ProductCategory;
  name: string;
  count: number;
}
