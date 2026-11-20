import { z } from 'zod';
import { text } from './text.js';

/**
 * Datos de la tienda que se muestran en el pie (`frontend/src/components/footer.tsx`).
 *
 * El teléfono y el WhatsApp NO están aquí: vienen de variables de entorno y,
 * si faltan, el CTA se omite (`frontend/src/lib/contact.ts`). Un número
 * editable desde la consola sería un número que alguien puede cambiar sin
 * desplegar, y por ahí entra un fraude de desvío de pedidos.
 */
export const ContactContentSchema = z.strictObject({
  about: text(240),
  location: text(80),
  hours: z.array(text(60)).min(1).max(4),
  service: z.array(text(60)).min(1).max(6)
});

export type ContactContent = z.infer<typeof ContactContentSchema>;

export const CONTACT_DEFAULT: ContactContent = {
  about: 'Tu tienda especializada en Valledupar para vaporizadores desechables, pods recargables, e-líquidos premium y accesorios originales.',
  location: 'Valledupar, Cesar, Colombia',
  hours: ['Lunes a Sábado: 10:00 AM - 10:00 PM', 'Domingos: 12:00 PM - 8:00 PM'],
  service: [
    'Envíos locales express en moto',
    'Envíos a todo el departamento del Cesar',
    'Métodos: Nequi, Daviplata, Contra Entrega'
  ]
};
