/** Tipos del libro de inventario (enum `StockMovementType` de Prisma). */
export type StockMovementType =
  | 'inbound'    // ingreso de mercancía (suma)
  | 'sale'       // venta (resta)
  | 'adjustment' // ajuste por conteo físico (signo explícito, exige motivo)
  | 'shrinkage'  // merma (resta)
  | 'return';    // devolución de cliente (suma)

export interface StockMovement {
  id: string;
  variantId: string;
  type: StockMovementType;
  /** Con signo: positivo suma, negativo resta. */
  quantity: number;
  reason: string | null;
  supplierId: string | null;
  /** Costo unitario en pesos, solo en ingresos. */
  unitCost: number | null;
  lot: string | null;
  userId: string;
  operationKey: string;
  createdAt: Date;
}

export interface KardexEntry extends StockMovement {
  /** Disponible tras aplicar este movimiento. */
  balance: number;
}

export interface Kardex {
  variantId: string;
  /** Disponible antes del primer movimiento del rango. */
  openingBalance: number;
  entries: KardexEntry[];
  closingBalance: number;
}

export interface LowStockVariant {
  variantId: string;
  variantName: string;
  productId: string;
  productName: string;
  stock: number;
}
