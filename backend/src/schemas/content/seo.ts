import { z } from 'zod';
import { text } from './text.js';

/**
 * Metadatos de la portada (`frontend/src/app/layout.tsx`).
 *
 * Los topes siguen lo que muestran los buscadores sin cortar: ~70 caracteres
 * de título y ~160 de descripción.
 */
const SocialCardSchema = z.strictObject({
  title: text(70),
  description: text(200)
});

export const SeoContentSchema = z.strictObject({
  title: text(70),
  description: text(160),
  keywords: z.array(text(40)).min(1).max(20),
  openGraph: SocialCardSchema,
  twitter: SocialCardSchema
});

export type SeoContent = z.infer<typeof SeoContentSchema>;

export const SEO_DEFAULT: SeoContent = {
  title: 'Vapeupar | Tienda de Vaporizadores & Catálogo en Valledupar',
  description: 'Catálogo exclusivo de vaporizadores desechables, pods recargables, sales de nicotina y accesorios en Valledupar. Envíos express contra entrega en moto.',
  keywords: [
    'vape valledupar',
    'vaporizadores valledupar',
    'pods desechables valledupar',
    'sales de nicotina colombia'
  ],
  openGraph: {
    title: 'Vapeupar | Tienda de Vaporizadores en Valledupar',
    description: 'Vaporizadores 100% auténticos, pods y sales de nicotina con entrega inmediata en Valledupar. Pide directamente por WhatsApp.'
  },
  twitter: {
    title: 'Vapeupar | Vaporizadores en Valledupar',
    description: 'Catálogo de vaporizadores con envíos inmediatos contra entrega en Valledupar.'
  }
};
