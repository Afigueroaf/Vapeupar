import { AuditRecord } from '../services/audit.service.js';
import {
  ContentTransaction, ContentVersion, ContentVersionConflictError, NewContentVersion, SiteContentRepository
} from './site-content.repository.js';

/**
 * Implementación para tests. Mantiene el índice único `[key, version]`, que es
 * lo que impide que dos publicaciones simultáneas se pisen.
 */
export class InMemorySiteContentRepository implements SiteContentRepository {
  private rows: ContentVersion[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private auditRows: AuditRecord[] = [];

  public get audits(): readonly AuditRecord[] {
    return this.auditRows;
  }

  /** @param now reloj inyectable, para fijar `createdAt` en los tests. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  public seed(version: ContentVersion): void {
    this.rows.push({ ...version });
  }

  public transaction<T>(work: (tx: ContentTransaction) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      // Borrador completo, auditoría incluida: si el trabajo lanza, no queda
      // ni la versión ni su registro.
      const draft = this.rows.map(row => ({ ...row }));
      const draftAudits = [...this.auditRows];
      const result = await work({
        findLatest: async key => {
          const row = draft.filter(r => r.key === key).sort((a, b) => b.version - a.version)[0];
          return row ? { ...row } : undefined;
        },

        insert: async (entry: NewContentVersion) => {
          if (draft.some(r => r.key === entry.key && r.version === entry.version)) {
            throw new ContentVersionConflictError(entry.key, entry.version);
          }
          const row: ContentVersion = { ...entry, createdAt: this.now() };
          draft.push(row);
          return { ...row };
        },

        audit: {
          write: async record => {
            draftAudits.push(record);
          }
        }
      });
      this.rows = draft;
      this.auditRows = draftAudits;
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  public async findLatest(key: string): Promise<ContentVersion | undefined> {
    const row = this.rows.filter(r => r.key === key).sort((a, b) => b.version - a.version)[0];
    return row ? { ...row } : undefined;
  }

  public async listVersions(key: string, limit: number): Promise<ContentVersion[]> {
    return this.rows
      .filter(r => r.key === key)
      .sort((a, b) => b.version - a.version)
      .slice(0, limit)
      .map(row => ({ ...row }));
  }
}
