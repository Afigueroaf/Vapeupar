import { AuditSink, JsonValue } from '../services/audit.service.js';

/**
 * Catálogo desde la consola: marcas, proveedores, líneas y variantes
 * (plan A4.2, pantallas A5.2 y A5.3).
 *
 * Es un repositorio aparte de `ProductRepository`, que sirve el catálogo
 * público: aquel solo ve lo publicado y con precio, mientras que aquí hay que
 * ver y escribir borradores. Y es aparte de `StockRepository`, que solo escribe
 * el libro de inventario.
 *
 * Las escrituras van dentro de `transaction()` porque cada una registra su
 * auditoría en la misma transacción (ADR-002, plan A3.2): si falla el registro,
 * no queda la escritura.
 *
 * `Variant.stockCache` **no es escribible desde aquí**: su dueño es
 * `StockService`. Por eso las variantes se leen con `stock` y se escriben sin
 * él.
 */

/**
 * La categoría viaja como la publica la API (`pod-systems`), no como el enum de
 * Prisma (`pod_systems`). Es la lista cerrada de la decisión #3 del plan: las 6
 * de siempre, en una sola fuente, para que el esquema Zod de la consola no
 * pueda quedarse corto.
 */
export const API_CATEGORIES = [
  'disposables', 'pod-systems', 'mods-tanks', 'salt-nic', 'freebase-liquids', 'coils-accessories'
] as const;

export type ApiCategory = typeof API_CATEGORIES[number];

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  /** Clave en el bucket, no URL (la URL la arma quien sirve la imagen). */
  logoKey: string | null;
  isPartner: boolean;
  sortOrder: number;
  active: boolean;
  productCount: number;
}

export interface SupplierRow {
  id: string;
  name: string;
  taxId: string | null;
  contactName: string | null;
  whatsapp: string | null;
  paymentTerms: string | null;
  notes: string | null;
  imageKey: string | null;
  active: boolean;
}

/** Ficha de proveedor: lo que A5.2 muestra en la vista por proveedor. */
export interface SupplierDetail extends SupplierRow {
  brands: { id: string; name: string }[];
  /** Fecha del último ingreso que firmó, o `null` si nunca abasteció. */
  lastInboundAt: Date | null;
  /** Variantes distintas que ha abastecido alguna vez, según el libro. */
  suppliedVariantCount: number;
}

export interface AdminVariantRow {
  id: string;
  productId: string;
  kind: 'flavor' | 'color';
  name: string;
  slug: string;
  imageKey: string | null;
  active: boolean;
  sortOrder: number;
  /** Caché del disponible, de solo lectura aquí. */
  stock: number;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  brandId: string;
  brandName: string;
  category: ApiCategory;
  name: string;
  description: string;
  shortDescription: string;
  specs: JsonValue;
  /** Pesos colombianos, entero. Nulo en borrador. */
  price: number | null;
  compareAtPrice: number | null;
  status: 'draft' | 'published';
  imageKey: string | null;
  featured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  tags: string[];
  /** Para el listado, que no necesita las variantes pero sí saber cuántas hay. */
  variantCount: number;
  activeVariantCount: number;
}

export interface AdminProductDetail extends AdminProductRow {
  variants: AdminVariantRow[];
}

export interface NewBrand {
  name: string;
  slug: string;
  logoKey?: string | null;
  isPartner?: boolean;
  sortOrder?: number;
  active?: boolean;
}

export type BrandPatch = Partial<NewBrand>;

export interface NewSupplier {
  name: string;
  taxId?: string | null;
  contactName?: string | null;
  whatsapp?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  imageKey?: string | null;
  active?: boolean;
  /** Vínculo N↔N con marcas (A5.2). Si viene, reemplaza la lista completa. */
  brandIds?: string[];
}

export type SupplierPatch = Partial<NewSupplier>;

export interface NewProduct {
  slug: string;
  brandId: string;
  category: ApiCategory;
  name: string;
  description?: string;
  shortDescription?: string;
  specs?: JsonValue;
  price?: number | null;
  compareAtPrice?: number | null;
  status?: 'draft' | 'published';
  imageKey?: string | null;
  featured?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  tags?: string[];
}

export type ProductPatch = Partial<NewProduct>;

export interface NewVariant {
  productId: string;
  kind: 'flavor' | 'color';
  name: string;
  slug: string;
  imageKey?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export type VariantPatch = Partial<Omit<NewVariant, 'productId'>>;

export interface Page<T> {
  rows: T[];
  total: number;
}

interface Paging {
  limit: number;
  offset: number;
}

export interface BrandFilter extends Paging {
  q?: string;
  active?: boolean;
  isPartner?: boolean;
}

export interface SupplierFilter extends Paging {
  q?: string;
  active?: boolean;
}

export interface ProductFilter extends Paging {
  /** Busca en el nombre y en el slug de la línea. */
  q?: string;
  brandId?: string;
  category?: ApiCategory;
  status?: 'draft' | 'published';
}

/** Ya existe otra fila con ese slug. `entity` es la tabla, en singular. */
export class DuplicateSlugError extends Error {
  constructor(public readonly entity: string, public readonly slug: string) {
    super(`Ya existe un registro de ${entity} con el slug "${slug}"`);
    this.name = 'DuplicateSlugError';
  }
}

/** Una clave ajena apunta a una fila que no existe (marca, proveedor, línea). */
export class MissingReferenceError extends Error {
  constructor(public readonly field: string, public readonly id: string) {
    super(`No existe el registro referenciado en ${field}: ${id}`);
    this.name = 'MissingReferenceError';
  }
}

/**
 * Escrituras disponibles dentro de una transacción. Las lecturas que están
 * aquí son las que el servicio necesita para construir el `before` de la
 * auditoría sin que nadie escriba en medio.
 */
export interface CatalogTransaction {
  findBrand(id: string): Promise<BrandRow | undefined>;
  createBrand(data: NewBrand): Promise<BrandRow>;
  /** `undefined` si no existe. Devuelve la fila ya modificada. */
  updateBrand(id: string, patch: BrandPatch): Promise<BrandRow | undefined>;

  findSupplier(id: string): Promise<SupplierRow | undefined>;
  createSupplier(data: NewSupplier): Promise<SupplierRow>;
  updateSupplier(id: string, patch: SupplierPatch): Promise<SupplierRow | undefined>;

  findProduct(id: string): Promise<AdminProductDetail | undefined>;
  createProduct(data: NewProduct): Promise<AdminProductDetail>;
  updateProduct(id: string, patch: ProductPatch): Promise<AdminProductDetail | undefined>;

  findVariant(id: string): Promise<AdminVariantRow | undefined>;
  createVariant(data: NewVariant): Promise<AdminVariantRow>;
  updateVariant(id: string, patch: VariantPatch): Promise<AdminVariantRow | undefined>;

  audit: AuditSink;
}

export interface CatalogRepository {
  transaction<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T>;

  /** Ordenadas por `sortOrder` y nombre: el mismo orden que ve el cliente. */
  listBrands(filter: BrandFilter): Promise<Page<BrandRow>>;
  findBrand(id: string): Promise<BrandRow | undefined>;

  listSuppliers(filter: SupplierFilter): Promise<Page<SupplierRow>>;
  findSupplier(id: string): Promise<SupplierDetail | undefined>;

  /** Borradores primero, que son los que piden trabajo. Sin las variantes. */
  listProducts(filter: ProductFilter): Promise<Page<AdminProductRow>>;
  /** Con sus variantes: es la ficha completa de A5.3. */
  findProduct(id: string): Promise<AdminProductDetail | undefined>;
  /** Variante administrativa, para operaciones que necesitan derivar su línea. */
  findVariant(id: string): Promise<AdminVariantRow | undefined>;
}
