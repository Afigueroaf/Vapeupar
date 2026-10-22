export type ProductCategory = 
  | 'disposables'       // Desechables (Puffs)
  | 'pod-systems'      // Pods recargables
  | 'mods-tanks'       // Mods y tanques avanzados
  | 'salt-nic'         // Sales de nicotina
  | 'freebase-liquids' // E-líquidos base libre
  | 'coils-accessories';// Resistencias, pods de repuesto, accesorios

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
}

export interface ProductFilters {
  category?: ProductCategory;
  brand?: string;
  nicotine?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  featured?: boolean;
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
