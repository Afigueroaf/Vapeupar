import { Author, recordAudit } from './audit.service.js';
import { ContentVersionConflictError, SiteContentRepository } from '../repositories/site-content.repository.js';
import { PrismaSiteContentRepository } from '../repositories/prisma-site-content.repository.js';
import { DEFAULT_LOW_STOCK_THRESHOLD } from '../schemas/admin/stock.schema.js';

/**
 * Ajustes de la consola (decisión #5 del plan: umbral de bajo stock global y
 * configurable).
 *
 * Se guardan en `site_content` con claves `setting.*`, fuera de la lista
 * cerrada de contenido público (`CONTENT_KEYS`), así que ni la API de
 * contenido ni el sitio los ven. Se reutiliza esa tabla a propósito: cada
 * cambio es una versión nueva con autor y fecha, el rol de la aplicación solo
 * puede insertar en ella y el cambio queda además en `AuditLog`. No hace falta
 * tabla ni migración nueva.
 */

export const LOW_STOCK_KEY = 'setting.low-stock-threshold';
/** Tope razonable: más allá, «bajo stock» dejaría de significar algo. */
export const MAX_LOW_STOCK_THRESHOLD = 100000;

export class SettingsError extends Error {
  constructor(public readonly code: 'VALIDATION' | 'CONFLICT', message: string) {
    super(message);
    this.name = 'SettingsError';
  }
}

function readThreshold(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const threshold = (value as { threshold?: unknown }).threshold;
  return Number.isInteger(threshold) && (threshold as number) >= 0 ? (threshold as number) : undefined;
}

export class SettingsService {
  constructor(
    private readonly repository: SiteContentRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** El umbral vigente; el valor por defecto si nunca se configuró. */
  public async getLowStockThreshold(): Promise<number> {
    const latest = await this.repository.findLatest(LOW_STOCK_KEY);
    return readThreshold(latest?.value) ?? DEFAULT_LOW_STOCK_THRESHOLD;
  }

  public async setLowStockThreshold(threshold: number, author: Author): Promise<number> {
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > MAX_LOW_STOCK_THRESHOLD) {
      throw new SettingsError('VALIDATION', `El umbral debe ser un entero entre 0 y ${MAX_LOW_STOCK_THRESHOLD}`);
    }
    try {
      return await this.repository.transaction(async tx => {
        const latest = await tx.findLatest(LOW_STOCK_KEY);
        const before = readThreshold(latest?.value) ?? DEFAULT_LOW_STOCK_THRESHOLD;
        if (latest && before === threshold) return threshold;

        await tx.insert({
          key: LOW_STOCK_KEY,
          value: { threshold },
          version: (latest?.version ?? 0) + 1,
          publishedAt: this.now(),
          userId: author.userId
        });
        await recordAudit(tx.audit, {
          userId: author.userId,
          entity: 'setting',
          entityId: LOW_STOCK_KEY,
          action: 'setting.update',
          before: { threshold: before },
          after: { threshold }
        });
        return threshold;
      });
    } catch (error) {
      if (error instanceof ContentVersionConflictError) {
        throw new SettingsError('CONFLICT', 'Otro cambio del umbral se guardó a la vez; vuelve a intentarlo');
      }
      throw error;
    }
  }
}

export type SettingsReader = Pick<SettingsService, 'getLowStockThreshold' | 'setLowStockThreshold'>;

export const settingsService = new SettingsService(new PrismaSiteContentRepository());
