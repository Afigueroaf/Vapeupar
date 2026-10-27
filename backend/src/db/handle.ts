import { getPrisma } from './prisma.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { AuditRecord, AuditSink } from '../services/audit.service.js';

/** Cliente o transacción: lo que acepta una consulta que sirve para ambos. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Cómo obtener el cliente y abrir transacciones. Por defecto, el cliente
 * global; un script de verificación puede pasar una transacción externa que
 * luego revierte, porque el libro de inventario es de solo inserción y no
 * admite limpieza.
 */
export interface PrismaDbHandle {
  client(): Db;
  transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

export const defaultDbHandle: PrismaDbHandle = {
  client: () => getPrisma(),
  transaction: work => getPrisma().$transaction(work)
};

/**
 * Destino de auditoría atado a una transacción: la fila de `audit_logs` se
 * confirma con la escritura que la provocó o no se confirma (plan A3.2).
 */
export function prismaAuditSink(tx: Prisma.TransactionClient): AuditSink {
  return {
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
  };
}
