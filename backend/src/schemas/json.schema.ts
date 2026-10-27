import { z } from 'zod';
import { JsonValue } from '../services/audit.service.js';

/**
 * JSON genérico validado. Lo usan las dos columnas `Json` que se editan desde
 * la consola: `Product.specs` y `SiteContent.value`.
 *
 * No describe la forma del contenido a propósito. Los esquemas por clave son
 * A7.1 y los de `specs` los aplica `prisma-product.repository.ts` al servir el
 * catálogo público, que descarta lo que no encaja en vez de fallar. Aquí solo se
 * garantiza que es JSON de verdad y que no es desproporcionado.
 */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(z.string().max(100), JsonValueSchema)
]));

/**
 * Objeto JSON con un tope de tamaño serializado, en bytes. El cuerpo de
 * `/api/admin` admite 256 kB (A4.3); esto limita lo que llega a una columna.
 */
export function jsonObject(maxBytes: number) {
  return z.record(z.string().max(100), JsonValueSchema)
    .refine(
      value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= maxBytes,
      `El contenido supera el máximo de ${Math.round(maxBytes / 1024)} kB`
    );
}
