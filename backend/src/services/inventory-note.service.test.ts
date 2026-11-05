import { describe, expect, it } from 'vitest';
import { InMemoryInventoryNoteRepository } from '../repositories/in-memory-inventory-note.repository.js';
import { InventoryNoteService } from './inventory-note.service.js';

describe('InventoryNoteService', () => {
  it('persiste, resuelve y audita cada escritura con su autor', async () => {
    const repository = new InMemoryInventoryNoteRepository();
    const service = new InventoryNoteService(repository);
    const note = await service.create({ variantId: null, text: 'Revisar conteo físico' }, 'owner-id');
    const resolved = await service.resolve(note.id, 'other-owner-id');

    expect(resolved).toMatchObject({ resolved: true, authorId: 'owner-id' });
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    expect(await service.list({ resolved: true })).toHaveLength(1);
    expect(repository.audits).toMatchObject([
      { userId: 'owner-id', action: 'inventory_note.create' },
      { userId: 'other-owner-id', action: 'inventory_note.resolve' }
    ]);
  });
});
