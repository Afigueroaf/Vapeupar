import { randomUUID } from 'node:crypto';
import { AuditRecord } from '../services/audit.service.js';
import { InventoryNote, InventoryNoteFilter, InventoryNoteRepository, InventoryNoteTransaction } from './inventory-note.repository.js';

/** Lo justo del catálogo para poner nombre a la variante anotada. */
interface NoteCatalogLookup {
  findVariant(id: string): Promise<{ name: string; productId: string } | undefined>;
  findProduct(id: string): Promise<{ name: string } | undefined>;
}

export class InMemoryInventoryNoteRepository implements InventoryNoteRepository {
  private notes = new Map<string, InventoryNote>();
  public readonly audits: AuditRecord[] = [];

  /**
   * En Prisma el autor y la variante salen de relaciones; aquí se resuelven
   * con lo que reciba la prueba. Lo que no esté se nota en vez de inventarse.
   */
  constructor(
    private readonly users: { id: string; email: string }[] = [],
    private readonly catalog?: NoteCatalogLookup
  ) {}

  private emailOf(authorId: string): string {
    return this.users.find(user => user.id === authorId)?.email ?? 'desconocido';
  }

  /** Mismo resultado que el `include` de Prisma: nombres o nulos. */
  private async labels(variantId: string | null): Promise<Pick<InventoryNote, 'variantName' | 'productName'>> {
    if (!variantId || !this.catalog) return { variantName: null, productName: null };
    const variant = await this.catalog.findVariant(variantId);
    if (!variant) return { variantName: null, productName: null };
    const product = await this.catalog.findProduct(variant.productId);
    return { variantName: variant.name, productName: product?.name ?? null };
  }

  public async transaction<T>(work: (tx: InventoryNoteTransaction) => Promise<T>): Promise<T> {
    const draft = new Map([...this.notes].map(([id, note]) => [id, { ...note }]));
    const auditStart = this.audits.length;
    try {
      const result = await work({
        create: async data => {
          const now = new Date();
          const note: InventoryNote = {
            id: randomUUID(), ...data, authorEmail: this.emailOf(data.authorId),
            ...(await this.labels(data.variantId)),
            resolved: false, createdAt: now, updatedAt: now, resolvedAt: null
          };
          draft.set(note.id, note);
          return { ...note };
        },
        find: async id => {
          const note = draft.get(id);
          return note ? { ...note } : undefined;
        },
        resolve: async (id, resolvedAt) => {
          const note = draft.get(id);
          if (!note) return undefined;
          const updated = { ...note, resolved: true, resolvedAt, updatedAt: resolvedAt };
          draft.set(id, updated);
          return { ...updated };
        },
        audit: { write: async record => { this.audits.push(record); } }
      });
      this.notes = draft;
      return result;
    } catch (error) {
      this.audits.splice(auditStart);
      throw error;
    }
  }

  public async list(filter: InventoryNoteFilter): Promise<InventoryNote[]> {
    return [...this.notes.values()]
      .filter(note => (filter.variantId === undefined || note.variantId === filter.variantId)
        && (filter.resolved === undefined || note.resolved === filter.resolved))
      .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.createdAt.getTime() - a.createdAt.getTime())
      .map(note => ({ ...note }));
  }
}
