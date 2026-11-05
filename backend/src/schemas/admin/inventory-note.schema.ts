import { z } from 'zod';

const optionalBoolean = z.preprocess(
  value => value === 'true' ? true : value === 'false' ? false : value,
  z.boolean().optional()
);

export const InventoryNoteQuerySchema = z.object({ variantId: z.uuid().optional(), resolved: optionalBoolean });
export const InventoryNoteBodySchema = z.object({ variantId: z.uuid().nullable().optional(), text: z.string().trim().min(1).max(4000) });
export const InventoryNoteIdSchema = z.object({ id: z.uuid() });
