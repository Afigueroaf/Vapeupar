import { PrismaDbHandle, defaultDbHandle, prismaAuditSink } from '../db/handle.js';
import { isUuid } from '../db/uuid.js';
import { Prisma } from '../generated/prisma/client.js';
import { InventoryNote, InventoryNoteFilter, InventoryNoteRepository, InventoryNoteTransaction } from './inventory-note.repository.js';

/**
 * El autor y la variante salen de las relaciones: nada de eso se guarda
 * copiado en la nota, y así un cambio de nombre no deja textos viejos.
 */
const withRelations = {
  author: { select: { email: true } },
  variant: { select: { name: true, product: { select: { name: true } } } }
} as const;

function toNote(row: {
  id: string; variantId: string | null; text: string; resolved: boolean; authorId: string;
  createdAt: Date; updatedAt: Date; resolvedAt: Date | null; author: { email: string };
  variant: { name: string; product: { name: string } } | null;
}): InventoryNote {
  const { author, variant, ...note } = row;
  return {
    ...note,
    authorEmail: author.email,
    variantName: variant?.name ?? null,
    productName: variant?.product.name ?? null
  };
}

export class PrismaInventoryNoteRepository implements InventoryNoteRepository {
  constructor(private readonly db: PrismaDbHandle = defaultDbHandle) {}

  public transaction<T>(work: (tx: InventoryNoteTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(tx => work({
      create: async data => toNote(await tx.inventoryNote.create({ data, include: withRelations })),
      find: async id => {
        if (!isUuid(id)) return undefined;
        const row = await tx.inventoryNote.findUnique({ where: { id }, include: withRelations });
        return row ? toNote(row) : undefined;
      },
      resolve: async (id, resolvedAt) => {
        if (!isUuid(id)) return undefined;
        try {
          return toNote(await tx.inventoryNote.update({
            where: { id }, data: { resolved: true, resolvedAt }, include: withRelations
          }));
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return undefined;
          throw error;
        }
      },
      audit: prismaAuditSink(tx)
    }));
  }

  public async list(filter: InventoryNoteFilter): Promise<InventoryNote[]> {
    const rows = await this.db.client().inventoryNote.findMany({
      where: {
        ...(filter.variantId && { variantId: filter.variantId }),
        ...(filter.resolved !== undefined && { resolved: filter.resolved })
      },
      include: withRelations,
      orderBy: [{ resolved: 'asc' }, { createdAt: 'desc' }]
    });
    return rows.map(toNote);
  }
}
