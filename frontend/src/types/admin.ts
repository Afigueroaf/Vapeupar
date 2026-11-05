/**
 * Contrato de `/api/admin` visto desde la consola (plan A5).
 *
 * Es el reflejo de lo que sirve el backend, con una diferencia: las fechas
 * llegan como texto ISO, porque han pasado por JSON. Se convierten a `Date`
 * solo donde hace falta formatearlas.
 */

import type { ProductCategory } from "./product";

export type AdminRole = "owner" | "operator";

/** El estado de publicacion de una linea, que la consola escribe explicito. */
export type ProductStatus = "draft" | "published";

export interface AdminIdentity {
  userId: string;
  email: string;
  role: AdminRole;
}

export type StockMovementType =
  | "inbound"
  | "sale"
  | "adjustment"
  | "shrinkage"
  | "return";

/** Fila de la tabla de inventario (`GET /api/admin/stock`). */
export interface StockRow {
  variantId: string;
  variantName: string;
  variantSlug: string;
  /** Imagen propia de la variante; una imagen de línea no reemplaza esta. */
  variantImageKey?: string | null;
  kind: "flavor" | "color";
  /** `false` retira la variante del sitio; agotada no es lo mismo que inactiva. */
  active: boolean;
  stock: number;
  productId: string;
  productName: string;
  productSlug: string;
  category: string;
  status: "draft" | "published";
  /** Pesos colombianos; nulo en borrador. */
  price: number | null;
  brandId: string;
  brandName: string;
}

export interface StockMovement {
  id: string;
  variantId: string;
  type: StockMovementType;
  /** Con signo: positivo suma, negativo resta. */
  quantity: number;
  reason: string | null;
  supplierId: string | null;
  unitCost: number | null;
  lot: string | null;
  userId: string;
  operationKey: string;
  /** ISO 8601. */
  createdAt: string;
}

export interface KardexEntry extends StockMovement {
  /** Disponible tras aplicar este movimiento. */
  balance: number;
}

export interface Kardex {
  variantId: string;
  openingBalance: number;
  entries: KardexEntry[];
  closingBalance: number;
}

export interface MovementResult {
  movement: StockMovement;
  /** Disponible tras el movimiento: la consola lo usa sin recargar la tabla. */
  stock: number;
  /** `true` si la `operationKey` ya estaba registrada: no se escribió nada. */
  replayed: boolean;
}

// ---- Catalogo: marcas y proveedores (plan A5.2) ----

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  /** Clave en el bucket, no URL: la URL la arma quien sirve la imagen. */
  logoKey: string | null;
  /** Marca aliada: sale en la landing y en la FAQ del sitio publico. */
  isPartner: boolean;
  sortOrder: number;
  active: boolean;
  /** Lineas que la referencian. Por eso una marca se retira, no se borra. */
  productCount: number;
}

export interface BrandInput {
  name: string;
  slug: string;
  logoKey?: string | null;
  isPartner?: boolean;
  sortOrder?: number;
  active?: boolean;
}

/** Fila de proveedor. El selector de ingresos solo usa `id` y `name`. */
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

/** Ficha de proveedor: lo que A5.2 pide ver de un proveedor. */
export interface SupplierDetail extends SupplierRow {
  /** Vinculo N<->N: las marcas que trae. */
  brands: { id: string; name: string }[];
  /** ISO 8601, o `null` si nunca abastecio. */
  lastInboundAt: string | null;
  /** Variantes distintas que ha abastecido alguna vez, segun el libro. */
  suppliedVariantCount: number;
}

export interface SupplierInput {
  name: string;
  taxId?: string | null;
  contactName?: string | null;
  whatsapp?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  imageKey?: string | null;
  active?: boolean;
  /** Si viaja, reemplaza la lista completa de marcas. */
  brandIds?: string[];
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Respuesta paginada tal como la arma `sendPage` en el backend. */
export interface PagedResponse<T> {
  data: T[];
  pagination: Pagination;
  meta?: Record<string, unknown>;
}

// ---- Catalogo: lineas y variantes (plan A5.3) ----

/**
 * Ficha tecnica. El backend acepta JSON libre, pero el contrato publico solo
 * toma estas claves (`src/types/product.ts`), que son las que la consola
 * ofrece como campos. Cualquier otra clave que ya existiera se conserva.
 */
export interface ProductSpecs {
  puffCount?: number;
  nicotineStrength?: string;
  flavorProfile?: string;
  liquidCapacity?: string;
  batteryCapacity?: string;
  resistance?: string;
  rechargeable?: boolean;
  [key: string]: unknown;
}

export interface AdminVariantRow {
  id: string;
  productId: string;
  kind: "flavor" | "color";
  name: string;
  slug: string;
  imageKey: string | null;
  active: boolean;
  sortOrder: number;
  /** Cache del disponible. Aqui es de solo lectura: lo mueve el inventario. */
  stock: number;
}

export interface VariantInput {
  kind: "flavor" | "color";
  name: string;
  slug: string;
  imageKey?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export type ImageUploadTarget =
  | "brand-logo"
  | "supplier-image"
  | "product-line-image"
  | "variant-image";

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  expiresIn: number;
}

/** Resultado de invalidar la caché del CDN para una clave. */
export interface CdnInvalidation {
  invalidationId: string | null;
  path: string;
}

export interface InventoryNote {
  id: string;
  variantId: string | null;
  text: string;
  resolved: boolean;
  authorId: string;
  /** Correo de quien la escribió, para que la lista diga de quién es. */
  authorEmail: string;
  /** Variante anotada y su línea; nulas en una nota general. */
  variantName: string | null;
  productName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  brandId: string;
  brandName: string;
  category: ProductCategory;
  name: string;
  description: string;
  shortDescription: string;
  specs: ProductSpecs;
  /** Pesos colombianos, entero. Nulo en borrador. */
  price: number | null;
  /** Precio tachado de la etiqueta «Oferta»: mayor que el precio. */
  compareAtPrice: number | null;
  status: ProductStatus;
  imageKey: string | null;
  featured: boolean;
  /** Elegida para el prisma 3D de la portada (pantalla «Vitrina»). */
  showcase: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  tags: string[];
  variantCount: number;
  activeVariantCount: number;
}

export interface AdminProductDetail extends AdminProductRow {
  variants: AdminVariantRow[];
}

export interface ProductInput {
  slug: string;
  brandId: string;
  category: ProductCategory;
  name: string;
  description?: string;
  shortDescription?: string;
  specs?: ProductSpecs;
  price?: number | null;
  compareAtPrice?: number | null;
  status?: ProductStatus;
  imageKey?: string | null;
  featured?: boolean;
  showcase?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  tags?: string[];
}

/** Lo que le falta a una linea para poder publicarse (`meta.readiness`). */
export interface Readiness {
  canPublish: boolean;
  missing: ReadinessGap[];
}

export type ReadinessGap = "price" | "imageKey" | "activeVariant";
