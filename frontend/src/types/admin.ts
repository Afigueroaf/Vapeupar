/**
 * Contrato de `/api/admin` visto desde la consola (plan A5).
 *
 * Es el reflejo de lo que sirve el backend, con una diferencia: las fechas
 * llegan como texto ISO, porque han pasado por JSON. Se convierten a `Date`
 * solo donde hace falta formatearlas.
 */

export type AdminRole = "owner" | "operator";

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

export interface SupplierRow {
  id: string;
  name: string;
  active: boolean;
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
