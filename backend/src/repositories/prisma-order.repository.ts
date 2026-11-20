import { Db, PrismaDbHandle, defaultDbHandle, prismaAuditSink } from '../db/handle.js';
import { isUuid } from '../db/uuid.js';
import { Prisma } from '../generated/prisma/client.js';
import { Order } from '../types/order.types.js';
import {
  DuplicateOrderError, NewOrder, OrderFilter, OrderPatch, OrderRepository, OrderTransaction, OrderableVariant,
  RetentionCutoffs, orderTotal
} from './order.repository.js';
import { stockTransactionOps } from './prisma-stock.repository.js';

const ORDER_INCLUDE = {
  lines: { orderBy: [{ productName: 'asc' }, { variantName: 'asc' }] },
  consent: true
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** Fila de Prisma -> dominio. Exportada para sus tests. */
export function toOrder(row: OrderRow): Order {
  const lines = row.lines.map(l => ({
    id: l.id,
    variantId: l.variantId,
    productName: l.productName,
    variantName: l.variantName,
    quantity: l.quantity,
    listPrice: l.listPrice,
    unitPrice: l.unitPrice
  }));
  // Anonimizado = los tres a nulo a la vez; uno solo nulo no debería existir,
  // y si existe tampoco se expone un cliente a medias.
  const customer = row.customerName !== null && row.customerPhone !== null && row.customerNeighborhood !== null
    ? { name: row.customerName, phone: row.customerPhone, neighborhood: row.customerNeighborhood }
    : null;
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    customer,
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    total: orderTotal(lines, row.deliveryFee),
    cancelReason: row.cancelReason,
    confirmedAt: row.confirmedAt,
    deliveredAt: row.deliveredAt,
    cancelledAt: row.cancelledAt,
    anonymizedAt: row.anonymizedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines,
    consent: row.consent
      ? { policyVersion: row.consent.policyVersion, purpose: row.consent.purpose, acceptedAt: row.consent.acceptedAt }
      : null
  };
}

/** Patch del dominio -> columnas. Exportada para sus tests. */
export function toUpdateData(patch: OrderPatch): Prisma.OrderUpdateInput {
  return {
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.customer === null && { customerName: null, customerPhone: null, customerNeighborhood: null }),
    ...(patch.deliveryFee !== undefined && { deliveryFee: patch.deliveryFee }),
    ...(patch.cancelReason !== undefined && { cancelReason: patch.cancelReason }),
    ...(patch.confirmedAt && { confirmedAt: patch.confirmedAt }),
    ...(patch.deliveredAt && { deliveredAt: patch.deliveredAt }),
    ...(patch.cancelledAt && { cancelledAt: patch.cancelledAt }),
    ...(patch.anonymizedAt && { anonymizedAt: patch.anonymizedAt })
  };
}

/** Filtro de la consola -> `where`. Exportada para sus tests. */
export function toWhere(filter: Omit<OrderFilter, 'limit' | 'offset'>): Prisma.OrderWhereInput {
  const q = filter.q?.trim();
  const digits = q?.replace(/\D/g, '') ?? '';
  return {
    ...(filter.status && { status: filter.status }),
    ...((filter.from || filter.to) && { createdAt: { gte: filter.from, lte: filter.to } }),
    ...(q && {
      OR: [
        { reference: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        // Con menos de tres cifras, buscar en el teléfono devolvería casi todo.
        ...(digits.length >= 3 ? [{ customerPhone: { contains: digits } }] : [])
      ]
    })
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function orderOps(tx: Prisma.TransactionClient): Omit<OrderTransaction, 'stock' | 'audit'> {
  return {
    async insertOrder(order: NewOrder) {
      try {
        const row = await tx.order.create({
          data: {
            reference: order.reference,
            submissionKey: order.submissionKey,
            customerName: order.customer.name,
            customerPhone: order.customer.phone,
            customerNeighborhood: order.customer.neighborhood,
            subtotal: order.subtotal,
            lines: { create: order.lines },
            consent: { create: order.consent }
          },
          include: ORDER_INCLUDE
        });
        return toOrder(row);
      } catch (error) {
        // Los únicos índices únicos que pueden chocar son la referencia y la clave de envío.
        if (isUniqueViolation(error)) throw new DuplicateOrderError();
        throw error;
      }
    },

    async lockOrder(id) {
      if (!isUuid(id)) return undefined;
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked[0]) return undefined;
      const row = await tx.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
      return row ? toOrder(row) : undefined;
    },

    async updateOrder(id, patch) {
      return toOrder(await tx.order.update({ where: { id }, data: toUpdateData(patch), include: ORDER_INCLUDE }));
    },

    async setLineUnitPrice(lineId, unitPrice) {
      await tx.orderLine.update({ where: { id: lineId }, data: { unitPrice } });
    }
  };
}

async function findOne(db: Db, where: Prisma.OrderWhereUniqueInput): Promise<Order | undefined> {
  const row = await db.order.findUnique({ where, include: ORDER_INCLUDE });
  return row ? toOrder(row) : undefined;
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly db: PrismaDbHandle = defaultDbHandle) {}

  public transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(tx => work({ ...orderOps(tx), stock: stockTransactionOps(tx), audit: prismaAuditSink(tx) }));
  }

  public async findOrderableVariants(variantIds: string[]): Promise<OrderableVariant[]> {
    const ids = variantIds.filter(isUuid);
    if (ids.length === 0) return [];
    const rows = await this.db.client().variant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, name: true, active: true, stockCache: true,
        product: { select: { name: true, status: true, price: true } }
      }
    });
    return rows.map(v => ({
      variantId: v.id,
      variantName: v.name,
      productName: v.product.name,
      orderable: v.active && v.product.status === 'published',
      price: v.product.price,
      stock: v.stockCache
    }));
  }

  public findById(id: string): Promise<Order | undefined> {
    return isUuid(id) ? findOne(this.db.client(), { id }) : Promise.resolve(undefined);
  }

  public findBySubmissionKey(submissionKey: string): Promise<Order | undefined> {
    return isUuid(submissionKey) ? findOne(this.db.client(), { submissionKey }) : Promise.resolve(undefined);
  }

  public async list(filter: OrderFilter): Promise<{ rows: Order[]; total: number }> {
    const where = toWhere(filter);
    const [rows, total] = await Promise.all([
      this.db.client().order.findMany({
        where,
        include: ORDER_INCLUDE,
        // Los id son UUIDv7: desempatan en orden de inserción.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: filter.limit,
        skip: filter.offset
      }),
      this.db.client().order.count({ where })
    ]);
    return { rows: rows.map(toOrder), total };
  }

  public async listRetentionCandidates(cutoffs: RetentionCutoffs): Promise<{ id: string; status: Order['status'] }[]> {
    return this.db.client().order.findMany({
      where: {
        anonymizedAt: null,
        OR: [
          { status: 'received', createdAt: { lt: cutoffs.receivedBefore } },
          { status: 'delivered', deliveredAt: { lt: cutoffs.closedBefore } },
          { status: 'cancelled', cancelledAt: { lt: cutoffs.closedBefore } }
        ]
      },
      select: { id: true, status: true },
      orderBy: { createdAt: 'asc' }
    });
  }
}
