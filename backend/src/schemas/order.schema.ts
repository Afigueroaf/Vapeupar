import { z } from 'zod';

/**
 * Contrato de `POST /api/orders` (ADR-003). Estricto en todos los niveles: un
 * campo que no está aquí es 400, y **no hay campo de precio**: el servidor lo
 * toma del catálogo.
 */

/**
 * Versión del texto de la política de tratamiento de datos que el cliente
 * acepta. El texto es un BORRADOR PENDIENTE DE REVISIÓN LEGAL (ADR-003 §4).
 * Cambiar el texto obliga a subir esta versión; el sitio envía la que mostró y
 * el servidor rechaza cualquier otra.
 */
export const DATA_POLICY_VERSION = 'borrador-2026-11-20';

/**
 * Una versión que empieza por «borrador» no ha pasado la revisión legal: con
 * ella no se registran pedidos aunque `ORDERS_ENABLED` esté encendido (`app.ts`).
 */
export function isDraftPolicyVersion(version: string): boolean {
  return version.startsWith('borrador');
}

/** Finalidad autorizada que queda en `order_consents`. */
export const DATA_PURPOSE = 'pedido';

/** Igual que `MAX_PER_LINE` de `frontend/src/lib/cart.ts`. */
export const MAX_QUANTITY_PER_LINE = 10;
export const MAX_LINES = 20;

/** Espacios repetidos fuera, y los caracteres de control nunca llegan a la base. */
const text = (min: number, max: number, pattern: RegExp, message: string) =>
  z.string()
    .transform(v => v.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, `Mínimo ${min} caracteres`).max(max, `Máximo ${max} caracteres`).regex(pattern, message));

const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const NEIGHBORHOOD = /^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'’#°º-]*$/u;

/**
 * Móvil colombiano: 10 cifras que empiezan por 3, con o sin +57, con espacios,
 * guiones, puntos o paréntesis. Se guarda como `+573XXXXXXXXX`.
 */
export function normalizeColombianMobile(input: string): string | undefined {
  const compact = input.replace(/[\s\-.()]/g, '');
  const match = /^(?:\+?57)?(3\d{9})$/.exec(compact);
  return match ? `+57${match[1]}` : undefined;
}

const Phone = z.string().max(30).transform((value, ctx) => {
  const phone = normalizeColombianMobile(value);
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Escribe un celular colombiano de 10 cifras (3XX XXX XXXX)' });
    return z.NEVER;
  }
  return phone;
});

const Line = z.strictObject({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE)
});

export const PublicOrderBodySchema = z.strictObject({
  /** UUID que el navegador genera una vez por envío: un reintento devuelve el mismo pedido. */
  submissionKey: z.uuid(),
  customer: z.strictObject({
    name: text(2, 80, NAME, 'El nombre solo admite letras, espacios, puntos, apóstrofos y guiones'),
    phone: Phone,
    neighborhood: text(2, 80, NEIGHBORHOOD, 'El barrio solo admite letras, números y . , # -')
  }),
  consent: z.strictObject({
    accepted: z.literal(true, 'Hace falta autorizar el tratamiento de los datos'),
    policyVersion: z.literal(DATA_POLICY_VERSION, 'La política de datos cambió: recarga la página')
  }),
  lines: z.array(Line).min(1, 'El pedido está vacío').max(MAX_LINES, `Máximo ${MAX_LINES} líneas`)
    .refine(lines => new Set(lines.map(l => l.variantId)).size === lines.length, 'Una variante aparece dos veces')
});

export type PublicOrderBody = z.output<typeof PublicOrderBodySchema>;
