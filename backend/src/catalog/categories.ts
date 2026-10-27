import { ProductCategory } from '../types/product.types.js';

/**
 * Etiquetas legibles de la taxonomía, en el orden en que se listan. Única
 * declaración del backend: el enum de Zod, el conteo de `getCategories()` y el
 * orden de la respuesta salen de aquí. Su espejo en el frontend es
 * `CATEGORIES` de `product-catalog.tsx`.
 */
export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  'disposables': 'Desechables (Puffs)',
  'pod-systems': 'Pods Recargables',
  'salt-nic': 'Sales de Nicotina',
  'freebase-liquids': 'E-Líquidos Freebase',
  'mods-tanks': 'Mods y Tanques',
  'coils-accessories': 'Resistencias y Accesorios'
};

export const PRODUCT_CATEGORIES = Object.keys(CATEGORY_LABELS) as [ProductCategory, ...ProductCategory[]];
