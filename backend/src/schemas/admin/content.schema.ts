import { z } from 'zod';
import { jsonObject } from '../json.schema.js';
import { CONTENT_KEYS, ContentKey } from '../content/index.js';

/**
 * Contenido editable del sitio (plan A4.2, `GET/PUT /api/admin/content/:key`).
 *
 * Las claves son una lista cerrada y en inglés como el resto del contrato. El
 * cuerpo se valida aquí solo como JSON con tope de tamaño; la **forma** de cada
 * clave la exige `ContentService.publish` con los esquemas de
 * `schemas/content/` (A7.1), que es donde vive esa regla.
 */
export { CONTENT_KEYS };
export type { ContentKey };

export const ContentKeyParamSchema = z.object({
  key: z.enum(CONTENT_KEYS)
});

/** 64 kB es de sobra para la FAQ más larga y cabe en el cuerpo de 256 kB (A4.3). */
export const ContentBodySchema = z.object({
  value: jsonObject(64 * 1024)
});

export const ContentVersionParamSchema = ContentKeyParamSchema.extend({
  // Tope de `Int` en PostgreSQL: más allá, Prisma lanzaría y sería un 500.
  version: z.coerce.number().int().positive().max(2_147_483_647)
});

export const ContentVersionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10)
});
