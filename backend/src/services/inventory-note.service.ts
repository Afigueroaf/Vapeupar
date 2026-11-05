import { recordAudit } from './audit.service.js';
import { InventoryNote, InventoryNoteRepository } from '../repositories/inventory-note.repository.js';

export class InventoryNoteError extends Error {
  constructor(public readonly code: 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'InventoryNoteError';
  }
}

export class InventoryNoteService {
  constructor(private readonly repository: InventoryNoteRepository) {}

  public list(filter: { variantId?: string; resolved?: boolean }): Promise<InventoryNote[]> {
    return this.repository.list(filter);
  }

  public async create(input: { variantId: string | null; text: string }, authorId: string): Promise<InventoryNote> {
    return this.repository.transaction(async tx => {
      const note = await tx.create({ ...input, authorId });
      await recordAudit(tx.audit, {
        userId: authorId, entity: 'inventory_note', entityId: note.id, action: 'inventory_note.create', after: note
      });
      return note;
    });
  }

  public async resolve(id: string, authorId: string): Promise<InventoryNote> {
    return this.repository.transaction(async tx => {
      const before = await tx.find(id);
      if (!before) throw new InventoryNoteError('NOT_FOUND', 'Nota de inventario no encontrada');
      if (before.resolved) return before;
      const after = await tx.resolve(id, new Date());
      if (!after) throw new InventoryNoteError('NOT_FOUND', 'Nota de inventario no encontrada');
      await recordAudit(tx.audit, {
        userId: authorId, entity: 'inventory_note', entityId: id, action: 'inventory_note.resolve',
        before: { resolved: false, resolvedAt: null }, after: { resolved: true, resolvedAt: after.resolvedAt }
      });
      return after;
    });
  }
}
