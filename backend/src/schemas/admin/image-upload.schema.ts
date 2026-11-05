import { z } from 'zod';

/**
 * Clave a invalidar en el CDN. Minúsculas, barras y punto: el formato que
 * genera `imageKey`. El comodín queda fuera por el juego de caracteres, y el
 * servicio vuelve a comprobar el prefijo.
 */
export const ImageInvalidateBodySchema = z.object({
  key: z.string().trim().min(1).max(255).regex(/^[a-z0-9][a-z0-9/._-]*$/, 'Clave de imagen inválida')
});

export const ImageUploadBodySchema = z.object({
  target: z.enum(['brand-logo', 'supplier-image', 'product-line-image', 'variant-image']),
  entityId: z.uuid(),
  contentType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  size: z.number().int().positive().max(5 * 1024 * 1024)
});
