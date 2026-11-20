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

/** Hasta 11 editables: la pregunta legal (`LEGAL_FAQ_ITEM`) completa las 12 del diseño. */
export const FAQ_MAX_ITEMS = 11;

export const FaqContentSchema = z.strictObject({
  title: text(60),
  intro: text(200),
  items: z.array(FaqItemSchema).min(1).max(FAQ_MAX_ITEMS)
});

export type FaqContent = z.infer<typeof FaqContentSchema>;
export type FaqItem = z.infer<typeof FaqItemSchema>;

/**
 * La pregunta legal +18 (Ley 1335 de 2009) NO es contenido editable
 * (decisión `dec-texto-legal-de-mayoria-de-edad`): vive aquí, el sitio la
 * pinta siempre en la posición `LEGAL_FAQ_INDEX` y la consola la muestra
 * bloqueada. Un borrado accidental desde la consola no puede quitar del sitio
 * el aviso de mayoría de edad; cambiarla exige revisión de código.
 *
 * `faq.items` guarda solo las preguntas editables. Una versión publicada antes
 * de esta regla que todavía la lleve dentro no la duplica: `stripLegalFaqItem`
 * la quita al publicar y al leer.
 */
export const LEGAL_FAQ_ITEM: FaqItem = {
  question: '¿Es obligatoria la cédula de ciudadanía para recibir el pedido?',
  answer: 'Sí, de manera obligatoria y sin excepciones. Cumpliendo con la legislación colombiana (Ley 1335 de 2009), la venta de productos de vapeo y nicotina está estrictamente restringida a mayores de 18 años. Nuestro domiciliario te solicitará presentar el documento físico de identidad al momento de la entrega.'
};

/**
 * Cuarta posición: donde estaba cuando era una pregunta más. La inserta el
 * sitio (`withLegalFaqItem` en el espejo del frontend); aquí se declara para
 * que la prueba de paridad la compare.
 */
export const LEGAL_FAQ_INDEX = 3;

/**
 * Forma comparable de una pregunta: sin tildes, sin signos de puntuación, sin
 * mayúsculas y con los espacios colapsados. «Es obligatoria la cedula...» es la
 * misma pregunta que «¿Es obligatoria la cédula...?».
 */
export function comparableQuestion(question: string): string {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** `true` si la pregunta es la legal, escrita de cualquiera de esas formas. */
export function isLegalFaqQuestion(question: string): boolean {
  return comparableQuestion(question) === comparableQuestion(LEGAL_FAQ_ITEM.question);
}

/**
 * Quita de un valor de FAQ (aún sin validar) cualquier pregunta igual a la
 * legal. Lo que no tenga forma de FAQ se devuelve tal cual, para que el
 * esquema lo rechace con su mensaje.
 */
export function stripLegalFaqItem(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return value;
  return {
    ...value,
    items: items.filter(item => {
      const question = (item as { question?: unknown } | null)?.question;
      return !(typeof question === 'string' && isLegalFaqQuestion(question));
    })
  };
}

/**
 * Normalización **de lectura**: quita la pregunta legal y, si aun así quedan
 * más de `FAQ_MAX_ITEMS` —una fila de antes de la regla, cuando el máximo era
 * 12 sin contar la legal aparte—, se queda con las primeras en vez de
 * rechazarla entera y caer al texto por defecto. Al publicar no se recorta: el
 * máximo se exige.
 */
export function normalizeFaqForRead(value: unknown): unknown {
  const stripped = stripLegalFaqItem(value);
  const items = (stripped as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length <= FAQ_MAX_ITEMS) return stripped;
  console.warn(`[content] La FAQ guardada tiene ${items.length} preguntas editables; se sirven las ${FAQ_MAX_ITEMS} primeras`);
  return { ...(stripped as object), items: items.slice(0, FAQ_MAX_ITEMS) };
}

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
      question: '¿Tienen garantía los dispositivos?',
      answer: 'Sí. Los vaporizadores desechables cuentan con garantía de encendido al momento de la entrega (si presentara falla de fábrica se cambia de inmediato). Los Pods recargables cuentan con garantía de 30 días sobre defectos electrónicos en el dispositivo.'
    }
  ]
};
