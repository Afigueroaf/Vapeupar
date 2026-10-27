import { JsonValue } from '../services/audit.service.js';

/**
 * Lectura de `audit_logs` para la consola (plan A4.2, `GET /api/admin/audit`).
 *
 * Es solo lectura a propósito: quien escribe auditoría es el `AuditSink` que
 * cada repositorio entrega dentro de su transacción, y la tabla no admite
 * modificación ni borrado para el rol de la aplicación.
 */
export interface AuditRow {
  id: string;
  /** Nulo en procesos sin usuario (comandos de mantenimiento). */
  userId: string | null;
  /** Correo del autor, resuelto para no obligar a la consola a otra consulta. */
  userEmail: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: JsonValue | null;
  after: JsonValue | null;
  createdAt: Date;
}

export interface AuditFilter {
  entity?: string;
  entityId?: string;
  /** Prefijo o verbo completo: `product` encuentra `product.publish`. */
  action?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface AuditPage {
  rows: AuditRow[];
  total: number;
}

export interface AuditViewRepository {
  /** De la más reciente a la más antigua: lo último que pasó, primero. */
  list(filter: AuditFilter): Promise<AuditPage>;
}
