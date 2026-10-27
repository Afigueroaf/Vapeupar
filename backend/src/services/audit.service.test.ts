import { describe, it, expect } from 'vitest';
import { AuditRecord, recordAudit } from './audit.service.js';

function sink() {
  const records: AuditRecord[] = [];
  return { records, write: async (r: AuditRecord) => { records.push(r); } };
}

describe('recordAudit', () => {
  it('convierte antes y después a JSON', async () => {
    const s = sink();
    await recordAudit(s, {
      userId: 'u1',
      entity: 'product',
      entityId: 'p1',
      action: 'product.price',
      before: { price: 90000, at: new Date('2026-10-26T00:00:00Z'), gone: undefined },
      after: { price: 95000 }
    });
    expect(s.records[0]).toEqual({
      userId: 'u1',
      entity: 'product',
      entityId: 'p1',
      action: 'product.price',
      before: { price: 90000, at: '2026-10-26T00:00:00.000Z' },
      after: { price: 95000 }
    });
  });

  it('deja before ausente en una creación', async () => {
    const s = sink();
    await recordAudit(s, { userId: null, entity: 'brand', entityId: 'b1', action: 'brand.create', after: { name: 'X' } });
    expect(s.records[0]?.before).toBeUndefined();
  });

  it('rechaza una entrada sin entidad o acción', async () => {
    await expect(recordAudit(sink(), { userId: 'u1', entity: '', entityId: 'x', action: 'a' })).rejects.toThrow();
    await expect(recordAudit(sink(), { userId: 'u1', entity: 'e', entityId: 'x', action: '' })).rejects.toThrow();
  });
});
