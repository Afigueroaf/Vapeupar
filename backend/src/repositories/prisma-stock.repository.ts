import { getPrisma } from '../db/prisma.js';
import { isUuid } from '../db/uuid.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AuditRecord } from '../services/audit.service.js';
import { LowStockVariant, StockMovement } from '../types/stock.types.js';
import { DuplicateOperationKeyError, NewStockMovement, StockRepository, StockTransaction } from './stock.repository.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Cómo obtener el cliente y abrir transacciones. Por defecto, el cliente
 * global; un script de verificación puede pasar una transacción externa que
 * luego revierte, porque el libro es de solo inserción y no admite limpieza.
 */
export interface PrismaDbHandle {
  client(): Db;
  transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

const defaultHandle: PrismaDbHandle = {
  client: () => getPrisma(),
  transaction: work => getPrisma().$transaction(work)
};

type MovementRow = Prisma.StockMovementGetPayload<object>;

function toMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    variantId: row.variantId,
    type: row.type,
    quantity: row.quantity,
    reason: row.reason,
    supplierId: row.supplierId,
    unitCost: row.unitCost,
    lot: row.lot,
    userId: row.userId,
    operationKey: row.operationKey,
    createdAt: row.createdAt
  };
}

async function sumLedger(db: Db, variantId: string, before?: Date): Promise<number> {
  const result = await db.stockMovement.aggregate({
    where: { variantId, ...(before && { createdAt: { lt: before } }) },
    _sum: { quantity: true }
  });
  return result._sum.quantity ?? 0;
}

function transactionOps(tx: Prisma.TransactionClient): StockTransaction {
  return {
    async lockVariant(variantId) {
      if (!isUuid(variantId)) return undefined;
      const rows = await tx.$queryRaw<{ stock_cache: number }[]>`
        SELECT stock_cache FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      return rows[0] ? { stockCache: rows[0].stock_cache } : undefined;
    },

    async findMovementByKey(operationKey) {
      const row = await tx.stockMovement.findUnique({ where: { operationKey } });
      return row ? toMovement(row) : undefined;
    },

    async insertMovement(movement: NewStockMovement) {
      try {
        return toMovement(await tx.stockMovement.create({ data: movement }));
      } catch (error) {
        // El único índice único que puede chocar al insertar es operation_key.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new DuplicateOperationKeyError(movement.operationKey);
        }
        throw error;
      }
    },

    async setStockCache(variantId, stockCache) {
      await tx.variant.update({ where: { id: variantId }, data: { stockCache } });
    },

    sumLedger: variantId => sumLedger(tx, variantId),

    audit: {
      async write(record: AuditRecord) {
        await tx.auditLog.create({
          data: {
            userId: record.userId,
            entity: record.entity,
            entityId: record.entityId,
            action: record.action,
            // `undefined` deja la columna en NULL.
            before: record.before as Prisma.InputJsonValue | undefined,
            after: record.after as Prisma.InputJsonValue | undefined
          }
        });
      }
    }
  };
}

export class PrismaStockRepository implements StockRepository {
  constructor(private readonly db: PrismaDbHandle = defaultHandle) {}

  public transaction<T>(work: (tx: StockTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(tx => work(transactionOps(tx)));
  }

  public async getStockCache(variantId: string): Promise<number | undefined> {
    if (!isUuid(variantId)) return undefined;
    const variant = await this.db.client().variant.findUnique({
      where: { id: variantId },
      select: { stockCache: true }
    });
    return variant?.stockCache;
  }

  public sumLedger(variantId: string, before?: Date): Promise<number> {
    return sumLedger(this.db.client(), variantId, before);
  }

  public async listMovements(variantId: string, range: { from?: Date; to?: Date }): Promise<StockMovement[]> {
    const rows = await this.db.client().stockMovement.findMany({
      where: {
        variantId,
        ...((range.from || range.to) && { createdAt: { gte: range.from, lte: range.to } })
      },
      // Los id son UUIDv7: desempatan en orden de inserción dentro del mismo milisegundo.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    return rows.map(toMovement);
  }

  public async findLowStock(threshold: number): Promise<LowStockVariant[]> {
    const variants = await this.db.client().variant.findMany({
      where: { active: true, stockCache: { lte: threshold } },
      select: { id: true, name: true, stockCache: true, product: { select: { id: true, name: true } } },
      orderBy: [{ stockCache: 'asc' }, { name: 'asc' }]
    });
    return variants.map(v => ({
      variantId: v.id,
      variantName: v.name,
      productId: v.product.id,
      productName: v.product.name,
      stock: v.stockCache
    }));
  }
}
