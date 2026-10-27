import { z } from 'zod';

/** Umbral de «bajo stock» por defecto. La decisión #5 del plan (global o por
 *  variante) sigue abierta, así que la ruta lo acepta por parámetro y el
 *  servicio nunca lo asume: esto es solo el valor que usa la consola si no pide
 *  otro. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export const StockQuerySchema = z.object({
  /** Busca en el nombre de la variante y en el de la línea. */
  q: z.string().trim().max(100).optional(),
  brandId: z.uuid().optional(),
  lowStock: z.preprocess(val => (val === 'true' || val === true ? true : val === 'false' || val === false ? false : val),
    z.boolean().default(false)),
  threshold: z.coerce.number().int().nonnegative().max(100000).default(DEFAULT_LOW_STOCK_THRESHOLD),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20)
});

/**
 * Cuerpo de un movimiento. **`userId` no está aquí a propósito**: lo pone la
 * sesión en la ruta, nunca el cliente, para que nadie pueda firmar un
 * movimiento con el nombre de otro.
 *
 * Las reglas de negocio (signo por tipo, ajuste con motivo, proveedor y costo
 * solo en ingresos) las valida `StockService`, que es su dueño; aquí solo se
 * comprueba la forma.
 */
export const MovementBodySchema = z.object({
  variantId: z.uuid(),
  type: z.enum(['inbound', 'sale', 'adjustment', 'shrinkage', 'return']),
  quantity: z.number().int(),
  reason: z.string().trim().max(500).optional(),
  supplierId: z.uuid().optional(),
  unitCost: z.number().int().nonnegative().optional(),
  lot: z.string().trim().max(100).optional(),
  /** La genera el cliente, una por formulario abierto; permite reintentar. */
  operationKey: z.string().trim().min(8).max(100)
});

export const VariantIdSchema = z.object({
  variantId: z.uuid()
});

export const KardexQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});
