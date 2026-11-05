import { AuditSink } from '../services/audit.service.js';

export interface InventoryNote {
  id: string;
  variantId: string | null;
  text: string;
  resolved: boolean;
  authorId: string;
  /** Correo de quien la escribió: la lista tiene que decir de quién es. */
  authorEmail: string;
  /**
   * Variante anotada y su línea, nulas en una nota general. Viajan con la
   * nota porque la consola no siempre tiene esa fila a la vista: la lista de
   * notas no respeta la paginación del inventario.
   */
  variantName: string | null;
  productName: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface InventoryNoteFilter {
  variantId?: string;
  resolved?: boolean;
}

export interface InventoryNoteTransaction {
  create(data: { variantId: string | null; text: string; authorId: string }): Promise<InventoryNote>;
  find(id: string): Promise<InventoryNote | undefined>;
  resolve(id: string, resolvedAt: Date): Promise<InventoryNote | undefined>;
  audit: AuditSink;
}

export interface InventoryNoteRepository {
  transaction<T>(work: (tx: InventoryNoteTransaction) => Promise<T>): Promise<T>;
  list(filter: InventoryNoteFilter): Promise<InventoryNote[]>;
}
