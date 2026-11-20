import { z } from 'zod';
import { text } from './text.js';

/**
 * Preguntas frecuentes (`frontend/src/components/faq.tsx`).
 *
 * Las marcas aliadas NO se escriben a mano (ADR-002 §5): una respuesta puede
 * llevar el marcador `{marcas}` y el sitio lo sustituye por las marcas con
 * `isPartner` activas, sacadas de `GET /api/brands/partners`. Así el texto no se
 * queda nombrando marcas que ya no se venden.
 */
export const PARTNER_BRANDS_TOKEN = '{marcas}';

export const FaqItemSchema = z.strictObject({
  question: text(160),
  answer: text(800)
});

export const FaqContentSchema = z.strictObject({
  title: text(60),
  intro: text(200),
  items: z.array(FaqItemSchema).min(1).max(12)
});

export type FaqContent = z.infer<typeof FaqContentSchema>;

export const FAQ_DEFAULT: FaqContent = {
  title: 'Preguntas frecuentes',
  intro: 'Todo lo que necesitas saber sobre compras, domicilios y garantías en Vapeupar.',
  items: [
    {
      question: '¿Cómo funcionan las entregas a domicilio en Valledupar?',
      answer: 'Realizamos envíos en moto express a cualquier barrio de Valledupar en un plazo promedio de 30 a 60 minutos desde la confirmación de tu pedido por WhatsApp. También realizamos despachos a municipios cercanos del Cesar y a nivel nacional.'
    },
    {
      question: '¿Cuáles son los métodos de pago disponibles?',
      answer: 'Aceptamos pago contra entrega (efectivo al recibir), transferencias por Nequi, Daviplata y Bancolombia a la Mano. No tienes que pagar nada por adelantado para domicilios locales si prefieres contra entrega.'
    },
    {
      question: '¿Cómo sé que los vaporizadores son 100% originales?',
      answer: `Todos nuestros productos provienen directamente de distribuidores autorizados de ${PARTNER_BRANDS_TOKEN}. Cada caja incluye un sello de seguridad con código QR raspable que puedes escanear en el sitio oficial del fabricante para verificar su autenticidad.`
    },
    {
      question: '¿Es obligatoria la cédula de ciudadanía para recibir el pedido?',
      answer: 'Sí, de manera obligatoria y sin excepciones. Cumpliendo con la legislación colombiana (Ley 1335 de 2009), la venta de productos de vapeo y nicotina está estrictamente restringida a mayores de 18 años. Nuestro domiciliario te solicitará presentar el documento físico de identidad al momento de la entrega.'
    },
    {
      question: '¿Tienen garantía los dispositivos?',
      answer: 'Sí. Los vaporizadores desechables cuentan con garantía de encendido al momento de la entrega (si presentara falla de fábrica se cambia de inmediato). Los Pods recargables cuentan con garantía de 30 días sobre defectos electrónicos en el dispositivo.'
    }
  ]
};
