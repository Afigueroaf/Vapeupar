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
