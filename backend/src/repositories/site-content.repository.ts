import { AuditSink, JsonValue } from '../services/audit.service.js';

/**
 * Contenido editable del sitio, versionado por clave (plan A4.2, fase A7).
 *
 * La tabla es de solo inserción en la práctica: publicar no sobrescribe, añade
 * una versión. Así el texto anterior sigue ahí para volver atrás, y `AuditLog`
 * guarda además quién lo cambió.
 */
export interface ContentVersion {
  key: string;
  value: JsonValue;
  /** Correlativo por clave, empezando en 1. */
  version: number;
  /** Nulo mientras no se publique; hoy siempre se publica al guardar. */
  publishedAt: Date | null;
  userId: string;
  createdAt: Date;
}

export interface NewContentVersion {
  key: string;
  value: JsonValue;
  version: number;
  publishedAt: Date | null;
  userId: string;
}

/** Dos publicaciones simultáneas pelearon por el mismo número de versión. */
export class ContentVersionConflictError extends Error {
  constructor(public readonly key: string, public readonly version: number) {
    super(`La versión ${version} de "${key}" ya existe; vuelve a intentarlo`);
    this.name = 'ContentVersionConflictError';
  }
}

export interface ContentTransaction {
  /** La versión más alta de la clave, o `undefined` si nunca se publicó. */
  findLatest(key: string): Promise<ContentVersion | undefined>;
  /** Lanza `ContentVersionConflictError` si ese número ya está tomado. */
  insert(entry: NewContentVersion): Promise<ContentVersion>;
  audit: AuditSink;
}

export interface SiteContentRepository {
  transaction<T>(work: (tx: ContentTransaction) => Promise<T>): Promise<T>;
  findLatest(key: string): Promise<ContentVersion | undefined>;
  /** De la más reciente a la más antigua. */
  listVersions(key: string, limit: number): Promise<ContentVersion[]>;
}
