export type ProductCategory = 
  | 'disposables'
  | 'pod-systems'
  | 'mods-tanks'
  | 'salt-nic'
  | 'freebase-liquids'
  | 'coils-accessories';

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
}

export interface CategoryInfo {
  id: ProductCategory;
  name: string;
  count: number;
}
