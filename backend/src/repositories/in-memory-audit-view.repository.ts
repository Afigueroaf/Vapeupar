import { randomUUID } from 'node:crypto';
import { AuditFilter, AuditPage, AuditRow, AuditViewRepository } from './audit-view.repository.js';

/** Implementación para tests. Las filas se siembran ya resueltas (con correo). */
export class InMemoryAuditViewRepository implements AuditViewRepository {
  private readonly rows: AuditRow[] = [];

  constructor(seed: Partial<AuditRow>[] = []) {
    for (const row of seed) this.seed(row);
  }

  public seed(row: Partial<AuditRow> = {}): AuditRow {
    const full: AuditRow = {
      id: row.id ?? randomUUID(),
      userId: row.userId ?? null,
      userEmail: row.userEmail ?? null,
      entity: row.entity ?? 'product',
      entityId: row.entityId ?? randomUUID(),
      action: row.action ?? 'product.update',
      before: row.before ?? null,
      after: row.after ?? null,
      createdAt: row.createdAt ?? new Date()
    };
    this.rows.push(full);
    return { ...full };
  }

  public async list(filter: AuditFilter): Promise<AuditPage> {
    const rows = this.rows
      .filter(r => (!filter.entity || r.entity === filter.entity)
        && (!filter.entityId || r.entityId === filter.entityId)
        && (!filter.action || r.action.startsWith(filter.action))
        && (!filter.userId || r.userId === filter.userId)
        && (!filter.from || r.createdAt >= filter.from)
        && (!filter.to || r.createdAt <= filter.to))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .map(row => ({ ...row }));

    return { rows: rows.slice(filter.offset, filter.offset + filter.limit), total: rows.length };
  }
}
