import { z } from 'zod';

/**
 * Consulta del registro de auditoría (plan A4.2, `GET /api/admin/audit`).
 * El plan los nombra `entidad` y `desde`; se usan los nombres en inglés del
 * resto del contrato, como en A3 y A4.
 */
export const AuditQuerySchema = z.object({
  /** Entidad en singular, como la escribe el servicio: `product`, `variant`. */
  entity: z.string().trim().max(40).optional(),
  entityId: z.uuid().optional(),
  /** Prefijo o verbo completo: `product` encuentra `product.publish`. */
  action: z.string().trim().max(60).optional(),
  userId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50)
});
