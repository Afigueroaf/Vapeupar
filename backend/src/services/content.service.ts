import { Author, recordAudit } from './audit.service.js';
import {
  ContentVersion, ContentVersionConflictError, SiteContentRepository
} from '../repositories/site-content.repository.js';
import { PrismaSiteContentRepository } from '../repositories/prisma-site-content.repository.js';
import { ContentBodySchema, ContentKey } from '../schemas/admin/content.schema.js';

/**
 * Contenido editable del sitio (plan A4.2, fase A7).
 *
 * Publicar no sobrescribe: añade una versión. El texto anterior queda
 * disponible para volver atrás y la auditoría guarda quién lo cambió, que es
 * uno de los cuatro casos en los que el registro es obligatorio (A3.2).
 *
 * La **forma** del valor de cada clave es A7.1. Aquí solo se exige que sea un
 * objeto JSON con tope de tamaño: el frontend valida contra su propio esquema y
 * cae a los textos por defecto si algo no encaja (A7.2), así que un valor mal
 * formado no deja la página sin texto.
 */

export type ContentErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT';

export class ContentError extends Error {
  constructor(public readonly code: ContentErrorCode, message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

export class ContentService {
  constructor(
    private readonly repository: SiteContentRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Última versión de la clave. Lanza `NOT_FOUND` si nunca se publicó. */
  public async get(key: ContentKey): Promise<ContentVersion> {
    const version = await this.repository.findLatest(key);
    if (!version) {
      throw new ContentError('NOT_FOUND', `La clave "${key}" no tiene contenido publicado todavía`);
    }
    return version;
  }

  public listVersions(key: ContentKey, limit: number): Promise<ContentVersion[]> {
    return this.repository.listVersions(key, limit);
  }

  public async publish(key: ContentKey, input: unknown, author: Author): Promise<ContentVersion> {
    const parsed = ContentBodySchema.safeParse(input);
    if (!parsed.success) {
      throw new ContentError(
        'VALIDATION',
        parsed.error.issues.map(issue => `${issue.path.join('.') || 'cuerpo'}: ${issue.message}`).join('; ')
      );
    }
    const { value } = parsed.data;

    try {
      return await this.repository.transaction(async tx => {
        const latest = await tx.findLatest(key);
        const version = await tx.insert({
          key,
          value,
          version: (latest?.version ?? 0) + 1,
          publishedAt: this.now(),
          userId: author.userId
        });

        await recordAudit(tx.audit, {
          userId: author.userId,
          // La entidad es la clave, no un UUID: `audit_logs.entity_id` es texto.
          entity: 'content',
          entityId: key,
          action: 'content.publish',
          before: latest ? { version: latest.version, value: latest.value } : undefined,
          after: { version: version.version, value: version.value }
        });
        return version;
      });
    } catch (error) {
      // Dos publicaciones a la vez pelearon por el mismo número de versión.
      if (error instanceof ContentVersionConflictError) {
        throw new ContentError('CONFLICT', error.message);
      }
      throw error;
    }
  }
}

export type ContentWriter = Pick<ContentService, 'get' | 'publish' | 'listVersions'>;

export const contentService = new ContentService(new PrismaSiteContentRepository());
