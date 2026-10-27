import { z } from 'zod';
import { recordAudit } from './audit.service.js';
import { DuplicateOperationKeyError, NewStockMovement, StockRepository } from '../repositories/stock.repository.js';
import { PrismaStockRepository } from '../repositories/prisma-stock.repository.js';
import { Kardex, LowStockVariant, StockMovement, StockMovementType } from '../types/stock.types.js';

/**
 * Único punto del sistema autorizado a escribir movimientos de inventario y
 * `Variant.stockCache` (ADR-002 §2, plan A3.1). El libro es la autoridad; la
 * caché se mantiene en la misma transacción y `reconcile()` la repara.
 */

export type StockErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'OPERATION_KEY_CONFLICT';

/** Error de dominio; la capa HTTP (A4) lo traduce a 400 / 404 / 409. */
export class StockError extends Error {
  constructor(public readonly code: StockErrorCode, message: string) {
    super(message);
    this.name = 'StockError';
  }
}

/** Signo que impone cada tipo. `adjustment` lleva el suyo propio. */
const SIGN: Record<Exclude<StockMovementType, 'adjustment'>, 1 | -1> = {
  inbound: 1,
  return: 1,
  sale: -1,
  shrinkage: -1
};

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform(v => (v ? v : undefined));

const RecordMovementSchema = z.object({
  variantId: z.string().trim().min(1),
  type: z.enum(['inbound', 'sale', 'adjustment', 'shrinkage', 'return']),
  /** Magnitud positiva, salvo en `adjustment`, que admite signo. */
  quantity: z.number().int().refine(q => q !== 0, 'La cantidad no puede ser cero'),
  reason: optionalText(500),
  supplierId: optionalText(64),
  unitCost: z.number().int().nonnegative().optional(),
  lot: optionalText(100),
  userId: z.string().trim().min(1),
  operationKey: z.string().trim().min(8).max(100)
}).superRefine((input, ctx) => {
  if (input.type === 'adjustment') {
    if (!input.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Un ajuste exige motivo' });
    }
  } else if (input.quantity < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quantity'],
      message: 'La cantidad va en positivo: el tipo de movimiento define el signo'
    });
  }
  if (input.type !== 'inbound' && (input.unitCost !== undefined || input.supplierId !== undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [input.unitCost !== undefined ? 'unitCost' : 'supplierId'],
      message: 'Proveedor y costo unitario solo aplican a ingresos'
    });
  }
});

export type RecordMovementInput = z.input<typeof RecordMovementSchema>;

export interface RecordMovementResult {
  movement: StockMovement;
  /** Disponible tras el movimiento. */
  stock: number;
  /** `true` si la `operationKey` ya estaba registrada con los mismos datos: no se escribió nada. */
  replayed: boolean;
}

/** Mismos datos = reintento legítimo. La clave identifica la operación, no solo la petición. */
function sameOperation(existing: StockMovement, candidate: NewStockMovement): boolean {
  return existing.variantId === candidate.variantId
    && existing.type === candidate.type
    && existing.quantity === candidate.quantity
    && existing.reason === candidate.reason
    && existing.supplierId === candidate.supplierId
    && existing.unitCost === candidate.unitCost
    && existing.lot === candidate.lot
    && existing.userId === candidate.userId;
}

function conflict(operationKey: string): StockError {
  return new StockError(
    'OPERATION_KEY_CONFLICT',
    `La operationKey "${operationKey}" ya se usó para otra operación`
  );
}

export class StockService {
  constructor(private readonly repository: StockRepository) {}

  public async recordMovement(input: RecordMovementInput): Promise<RecordMovementResult> {
    const parsed = RecordMovementSchema.safeParse(input);
    if (!parsed.success) {
      throw new StockError('VALIDATION', parsed.error.errors.map(e => e.message).join('; '));
    }
    const data = parsed.data;
    const candidate: NewStockMovement = {
      variantId: data.variantId,
      type: data.type,
      quantity: data.type === 'adjustment' ? data.quantity : data.quantity * SIGN[data.type],
      reason: data.reason ?? null,
      supplierId: data.supplierId ?? null,
      unitCost: data.unitCost ?? null,
      lot: data.lot ?? null,
      userId: data.userId,
      operationKey: data.operationKey
    };

    try {
      return await this.repository.transaction(async tx => {
        // El bloqueo va primero: serializa las operaciones sobre la variante, de
        // modo que un reintento concurrente ve el movimiento del primero.
        const variant = await tx.lockVariant(candidate.variantId);
        if (!variant) {
          throw new StockError('NOT_FOUND', 'Variante no encontrada');
        }

        const existing = await tx.findMovementByKey(candidate.operationKey);
        if (existing) {
          if (!sameOperation(existing, candidate)) throw conflict(candidate.operationKey);
          return { movement: existing, stock: variant.stockCache, replayed: true };
        }

        const stock = variant.stockCache + candidate.quantity;
        // Un conteo físico puede revelar que el disponible registrado era falso,
        // así que solo el ajuste (que ya exige motivo) puede dejarlo en negativo.
        if (stock < 0 && candidate.type !== 'adjustment') {
          throw new StockError(
            'INSUFFICIENT_STOCK',
            `Stock insuficiente: disponible ${variant.stockCache}, se intentan restar ${-candidate.quantity}`
          );
        }

        const movement = await tx.insertMovement(candidate);
        await tx.setStockCache(candidate.variantId, stock);
        await recordAudit(tx.audit, {
          userId: candidate.userId,
          entity: 'variant',
          entityId: candidate.variantId,
          action: `stock.${candidate.type}`,
          before: { stock: variant.stockCache },
          after: { stock, movementId: movement.id, quantity: movement.quantity }
        });
        return { movement, stock, replayed: false };
      });
    } catch (error) {
      // Misma clave registrada en paralelo sobre otra variante: el bloqueo no la
      // serializa y la detecta el índice único.
      if (error instanceof DuplicateOperationKeyError) throw conflict(error.operationKey);
      throw error;
    }
  }

  /** Disponible según la caché. Para el valor del libro, `reconcile()`. */
  public async getAvailable(variantId: string): Promise<number> {
    const stock = await this.repository.getStockCache(variantId);
    if (stock === undefined) throw new StockError('NOT_FOUND', 'Variante no encontrada');
    return stock;
  }

  public async getKardex(variantId: string, range: { from?: Date; to?: Date } = {}): Promise<Kardex> {
    if (range.from && range.to && range.from > range.to) {
      throw new StockError('VALIDATION', 'La fecha inicial no puede ser posterior a la final');
    }
    await this.getAvailable(variantId);

    const openingBalance = range.from ? await this.repository.sumLedger(variantId, range.from) : 0;
    const movements = await this.repository.listMovements(variantId, range);
    let balance = openingBalance;
    const entries = movements.map(m => {
      balance += m.quantity;
      return { ...m, balance };
    });
    return { variantId, openingBalance, entries, closingBalance: balance };
  }

  /**
   * Recalcula `stockCache` desde el libro. `userId` nulo cuando lo ejecuta un
   * comando de mantenimiento. Solo audita si había descuadre.
   */
  public async reconcile(variantId: string, userId: string | null = null): Promise<{ before: number; after: number }> {
    return this.repository.transaction(async tx => {
      const variant = await tx.lockVariant(variantId);
      if (!variant) throw new StockError('NOT_FOUND', 'Variante no encontrada');

      const ledger = await tx.sumLedger(variantId);
      if (ledger !== variant.stockCache) {
        await tx.setStockCache(variantId, ledger);
        await recordAudit(tx.audit, {
          userId,
          entity: 'variant',
          entityId: variantId,
          action: 'stock.reconcile',
          before: { stock: variant.stockCache },
          after: { stock: ledger }
        });
      }
      return { before: variant.stockCache, after: ledger };
    });
  }

  /**
   * Variantes activas en o por debajo del umbral. El umbral lo pasa quien
   * llama: global o por variante sigue abierto (decisión #5 del plan).
   */
  public async findLowStock(threshold: number): Promise<LowStockVariant[]> {
    if (!Number.isInteger(threshold) || threshold < 0) {
      throw new StockError('VALIDATION', 'El umbral debe ser un entero no negativo');
    }
    return this.repository.findLowStock(threshold);
  }
}

export const stockService = new StockService(new PrismaStockRepository());
