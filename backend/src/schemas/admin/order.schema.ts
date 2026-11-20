import { z } from 'zod';
import { ORDER_STATUSES } from '../../types/order.types.js';
import { MAX_LINES } from '../order.schema.js';

/** Pedidos en la consola (ADR-003). */

export const OrderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  /** Referencia, nombre o teléfono del cliente. */
  q: z.string().trim().max(100).optional().transform(v => (v ? v : undefined)),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20)
}).refine(q => !q.from || !q.to || q.from <= q.to, { message: 'La fecha inicial no puede ser posterior a la final', path: ['from'] });

export const OrderIdSchema = z.object({ id: z.uuid() });

/** Pesos: un tope holgado que solo frena errores de tecleo (un cero de más). */
const pesos = z.number().int().nonnegative().max(10_000_000);

export const ConfirmOrderBodySchema = z.strictObject({
  /** Domicilio cobrado; 0 si se recoge o va incluido. */
  deliveryFee: z.number().int().nonnegative().max(1_000_000),
  /**
   * Precio cobrado por línea cuando no es el de catálogo (descuento). Solo el
   * owner puede cobrar otro precio; lo comprueba el servicio.
   */
  lines: z.array(z.strictObject({ variantId: z.uuid(), unitPrice: pesos })).max(MAX_LINES).optional()
    .refine(lines => !lines || new Set(lines.map(l => l.variantId)).size === lines.length, 'Una variante aparece dos veces')
});

export const CancelOrderBodySchema = z.strictObject({
  reason: z.string().trim().max(300).optional().transform(v => (v ? v : undefined))
});

/** Transiciones sin datos: cuerpo vacío o ausente. */
export const EmptyBodySchema = z.strictObject({});
