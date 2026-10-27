import { PrismaDbHandle, defaultDbHandle } from '../db/handle.js';
import { Prisma } from '../generated/prisma/client.js';
import { JsonValue } from '../services/audit.service.js';
import { AuditFilter, AuditPage, AuditRow, AuditViewRepository } from './audit-view.repository.js';

const INCLUDE = { user: { select: { email: true } } } satisfies Prisma.AuditLogInclude;

type Row = Prisma.AuditLogGetPayload<{ include: typeof INCLUDE }>;

function toRow(row: Row): AuditRow {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: row.user?.email ?? null,
    entity: row.entity,
    entityId: row.entityId,
    action: row.action,
    before: row.before as JsonValue | null,
    after: row.after as JsonValue | null,
    createdAt: row.createdAt
  };
}

export class PrismaAuditViewRepository implements AuditViewRepository {
  constructor(private readonly db: PrismaDbHandle = defaultDbHandle) {}

  public async list(filter: AuditFilter): Promise<AuditPage> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.entity && { entity: filter.entity }),
      ...(filter.entityId && { entityId: filter.entityId }),
      // Prefijo: `product` encuentra `product.publish` y `product.price`.
      ...(filter.action && { action: { startsWith: filter.action } }),
      ...(filter.userId && { userId: filter.userId }),
      ...((filter.from || filter.to) && { createdAt: { gte: filter.from, lte: filter.to } })
    };

    // Total y página en la misma transacción de lectura, abierta por el handle.
    return this.db.transaction(async tx => {
      const rows = await tx.auditLog.findMany({
        where,
        include: INCLUDE,
        // Los id son UUIDv7: desempatan en orden de inserción.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: filter.offset,
        take: filter.limit
      });
      return { rows: rows.map(toRow), total: await tx.auditLog.count({ where }) };
    });
  }
}
