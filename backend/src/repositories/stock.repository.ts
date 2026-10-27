import { AuditSink } from '../services/audit.service.js';
import { LowStockVariant, StockMovement } from '../types/stock.types.js';

export type NewStockMovement = Omit<StockMovement, 'id' | 'createdAt'>;

/** Otra operación ya registró un movimiento con la misma `operationKey`. */
export class DuplicateOperationKeyError extends Error {
  constructor(public readonly operationKey: string) {
    super(`La operationKey "${operationKey}" ya está registrada`);
    this.name = 'DuplicateOperationKeyError';
  }
}

/**
 * Operaciones disponibles dentro de una transacción. Todo lo que se escribe en
 * ella se confirma junto o no se confirma.
 */
export interface StockTransaction {
  /** Bloquea la variante hasta el fin de la transacción. `undefined` si no existe. */
  lockVariant(variantId: string): Promise<{ stockCache: number } | undefined>;
  findMovementByKey(operationKey: string): Promise<StockMovement | undefined>;
  /** Lanza `DuplicateOperationKeyError` si la clave ya existe. */
  insertMovement(movement: NewStockMovement): Promise<StockMovement>;
  setStockCache(variantId: string, stockCache: number): Promise<void>;
  sumLedger(variantId: string): Promise<number>;
  audit: AuditSink;
}

/** Acceso al libro de inventario. Solo `StockService` lo usa. */
export interface StockRepository {
  transaction<T>(work: (tx: StockTransaction) => Promise<T>): Promise<T>;
  /** `undefined` si la variante no existe. */
  getStockCache(variantId: string): Promise<number | undefined>;
  /** Suma del libro; con `before`, solo los movimientos anteriores a esa fecha. */
  sumLedger(variantId: string, before?: Date): Promise<number>;
  /** En orden cronológico, con ambos extremos incluidos. */
  listMovements(variantId: string, range: { from?: Date; to?: Date }): Promise<StockMovement[]>;
  /** Variantes activas con `stockCache <= threshold`, de menor a mayor stock. */
  findLowStock(threshold: number): Promise<LowStockVariant[]>;
}
