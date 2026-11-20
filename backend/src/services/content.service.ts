import { Author, JsonValue, recordAudit } from './audit.service.js';
import {
  ContentVersion, ContentVersionConflictError, SiteContentRepository
} from '../repositories/site-content.repository.js';
import { PrismaSiteContentRepository } from '../repositories/prisma-site-content.repository.js';
import { ContentBodySchema } from '../schemas/admin/content.schema.js';
import {
  CONTENT_SCHEMAS, ContentKey, PARTNER_BRANDS_TOKEN, stripLegalFaqItem
} from '../schemas/content/index.js';

/**
 * Contenido editable del sitio (plan A4.2, fase A7).
 *
 * Publicar no sobrescribe: añade una versión. El texto anterior queda
 * disponible para volver atrás y la auditoría guarda quién lo cambió, que es
 * uno de los cuatro casos en los que el registro es obligatorio (A3.2).
 *
 * Cada clave tiene su esquema (`schemas/content/`, A7.1): publicar un valor
 * que no lo cumple es `VALIDATION`, y lo que se guarda es el valor ya
 * normalizado (textos recortados). El frontend vuelve a validar al leer y cae
 * al texto por defecto si algo no encaja (A7.2), así que ni una fila antigua
 * mal formada deja la página sin texto.
 *
 * La pregunta legal +18 de la FAQ no se guarda: vive en código
 * (`LEGAL_FAQ_ITEM`). Si un valor la trae —una versión antigua que se
 * restaura, una fila de antes de la regla—, se quita al publicar y al leer.
 */

export type ContentErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT';

/** Campo culpable de un `VALIDATION`, con la ruta desde el cuerpo (`value.items.0.question`). */
export interface ContentFieldError {
  field: string;
  message: string;
}

export class ContentError extends Error {
  constructor(
    public readonly code: ContentErrorCode,
    message: string,
    /** En un `VALIDATION`: cada campo inválido, para que la consola lo señale. */
    public readonly fields?: ContentFieldError[]
  ) {
    super(message);
    this.name = 'ContentError';
  }
}

/**
 * Lo que sirve la API pública. `source` dice si es texto publicado o el valor
 * por defecto en código, que es lo que se sirve mientras la clave no se publica.
 */
export interface PublicContent {
  key: ContentKey;
  value: JsonValue;
  source: 'published' | 'default';
  version: number | null;
  publishedAt: Date | null;
}

type Issue = { path: PropertyKey[]; message: string };

function issueFields(issues: Issue[], prefix: string): ContentFieldError[] {
  return issues.map(issue => ({
    field: [prefix, ...issue.path.map(String)].filter(Boolean).join('.') || 'cuerpo',
    message: issue.message
  }));
}

function validationError(issues: Issue[], prefix: string): ContentError {
  const fields = issueFields(issues, prefix);
  return new ContentError('VALIDATION', fields.map(f => `${f.field}: ${f.message}`).join('; '), fields);
}

/** Lo que se quita antes de validar: hoy, solo la pregunta legal de la FAQ. */
function normalize(key: ContentKey, value: unknown): unknown {
  return key === 'faq' ? stripLegalFaqItem(value) : value;
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

  /**
   * Lectura pública: la última versión si cumple el esquema de su clave, y si
   * no —nunca se publicó, o es una fila anterior a A7.1 que no encaja—, el
   * valor por defecto. Nunca lanza por el contenido; solo si la base falla.
   */
  public async getPublic(key: ContentKey): Promise<PublicContent> {
    const latest = await this.repository.findLatest(key);
    if (latest) {
      const parsed = CONTENT_SCHEMAS[key].schema.safeParse(normalize(key, latest.value));
      if (parsed.success) {
        return {
          key,
          value: parsed.data as JsonValue,
          source: 'published',
          version: latest.version,
          publishedAt: latest.publishedAt
        };
      }
      console.warn(`[content] La versión ${latest.version} de "${key}" no cumple su esquema; se sirve el valor por defecto`);
    }
    return { key, value: CONTENT_SCHEMAS[key].defaults as JsonValue, source: 'default', version: null, publishedAt: null };
  }

  public listVersions(key: ContentKey, limit: number): Promise<ContentVersion[]> {
    return this.repository.listVersions(key, limit);
  }

  public async publish(key: ContentKey, input: unknown, author: Author): Promise<ContentVersion> {
    const body = ContentBodySchema.safeParse(input);
    if (!body.success) throw validationError(body.error.issues, '');
    return this.commit(key, body.data.value, author, 'content.publish');
  }

  /**
   * «Restaurar» de la consola (A5.4): vuelve a publicar el valor de la versión
   * `version` como una versión **nueva**. El historial nunca se reescribe: la
   * N+1 lleva el valor de la N y la auditoría dice de cuál salió.
   *
   * El valor pasa por el esquema vigente, igual que al publicar: una versión de
   * antes de A7.1 que ya no encaja no se puede restaurar (`VALIDATION`).
   */
  public async restore(key: ContentKey, version: number, author: Author): Promise<ContentVersion> {
    const source = await this.repository.findVersion(key, version);
    if (!source) {
      throw new ContentError('NOT_FOUND', `La clave "${key}" no tiene versión ${version}`);
    }
    return this.commit(key, source.value, author, 'content.restore', { restoredFrom: version });
  }

  private async commit(
    key: ContentKey,
    raw: unknown,
    author: Author,
    action: 'content.publish' | 'content.restore',
    extra: { restoredFrom?: number } = {}
  ): Promise<ContentVersion> {
    const shaped = CONTENT_SCHEMAS[key].schema.safeParse(normalize(key, raw));
    if (!shaped.success) throw validationError(shaped.error.issues, 'value');
    const value = shaped.data as JsonValue;
    // El sitio solo sustituye el marcador de marcas aliadas en la FAQ; en otra
    // clave saldría literal en la página.
    if (key !== 'faq' && JSON.stringify(value).includes(PARTNER_BRANDS_TOKEN)) {
      const message = `el marcador ${PARTNER_BRANDS_TOKEN} solo se admite en la FAQ`;
      throw new ContentError('VALIDATION', `value: ${message}`, [{ field: 'value', message }]);
    }

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
          action,
          before: latest ? { version: latest.version, value: latest.value } : undefined,
          after: { version: version.version, value: version.value, ...extra }
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

export type ContentWriter = Pick<ContentService, 'get' | 'publish' | 'restore' | 'listVersions'>;
export type ContentReader = Pick<ContentService, 'getPublic'>;

export const contentService = new ContentService(new PrismaSiteContentRepository());
