/**
 * Lectura del inventario para la consola (plan A4.2, pantalla A5.1).
 *
 * Es un repositorio aparte del libro: `StockRepository` existe para escribir
 * movimientos con garantías transaccionales, mientras que esto solo arma la
 * tabla que se mira. Mezclarlos obligaría a la capa que escribe a cargar con
 * filtros y paginación que no necesita.
 */
export interface StockRow {
  variantId: string;
  variantName: string;
  variantSlug: string;
  variantImageKey?: string | null;
  kind: 'flavor' | 'color';
  /** `false` retira la variante del sitio; agotada no es lo mismo que inactiva. */
  active: boolean;
  /** Caché del disponible, que es lo que la consola muestra. */
  stock: number;
  productId: string;
  productName: string;
  productSlug: string;
  /** Tal como la publica la API (`pod-systems`), no el enum de Prisma. */
  category: string;
  status: 'draft' | 'published';
  /** Pesos colombianos; nulo en borrador. */
  price: number | null;
  brandId: string;
  brandName: string;
}

export interface StockFilter {
  /** Busca en el nombre de la variante y en el de la línea. */
  q?: string;
  brandId?: string;
  /** Solo variantes en o por debajo del umbral. */
  lowStock?: boolean;
  threshold: number;
  limit: number;
  offset: number;
}

export interface StockPage {
  rows: StockRow[];
  total: number;
}

export interface StockViewRepository {
  /** Ordenado por disponible ascendente: lo más urgente, primero. */
  list(filter: StockFilter): Promise<StockPage>;
  /** Publicadas, con stock positivo y sin imagen propia de variante. */
  listMissingVariantImages(): Promise<StockRow[]>;
}
