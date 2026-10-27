import { z } from 'zod';
import { jsonObject } from '../json.schema.js';

/**
 * Contenido editable del sitio (plan A4.2, `GET/PUT /api/admin/content/:key`).
 *
 * Las claves son una lista cerrada, la de A7.1, y en inglés como el resto del
 * contrato de la API. **La forma del valor de cada clave todavía no se valida
 * aquí**: eso es A7.1, que creará `backend/src/schemas/content/` con un esquema
 * por clave. Hasta entonces esta ruta acepta cualquier objeto JSON con tope de
 * tamaño, y el frontend hace `safeParse` contra su propio esquema con los
 * textos por defecto como respaldo (A7.2), así que un valor mal formado no
 * puede dejar la página sin texto.
 */
export const CONTENT_KEYS = ['hero', 'trust-band', 'faq', 'seo', 'contact'] as const;

export type ContentKey = typeof CONTENT_KEYS[number];

export const ContentKeyParamSchema = z.object({
  key: z.enum(CONTENT_KEYS)
});

/** 64 kB es de sobra para la FAQ más larga y cabe en el cuerpo de 256 kB (A4.3). */
export const ContentBodySchema = z.object({
  value: jsonObject(64 * 1024)
});

export const ContentVersionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10)
});
