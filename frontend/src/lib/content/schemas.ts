import { z } from "zod";

/**
 * ESPEJO de `backend/src/schemas/content/` (plan A7.1, ADR-002 §5).
 *
 * El backend valida al publicar; el frontend vuelve a validar al leer y, si
 * algo no encaja o la API no responde, sirve el valor por defecto de aquí
 * (invariante 6: la caída de la API degrada el contenido, nunca tumba la
 * página).
 *
 * Hasta que exista un paquete de contratos compartido (item
 * `tipos-compartidos` del Deathnote), los dos archivos se mantienen a mano.
 * `backend/src/schemas/content/content-parity.test.ts` compara los esquemas
 * (en JSON Schema) y los valores por defecto, y falla si divergen: cambia los
 * dos a la vez.
 */

const text = (max: number, min = 1) => z.string().trim().min(min).max(max);

/** Marcador que el sitio sustituye por las marcas aliadas activas. */
export const PARTNER_BRANDS_TOKEN = "{marcas}";

export const HeroContentSchema = z.strictObject({
  label: text(32),
  tagline: text(32),
});

export const TrustBandContentSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        label: text(16),
        title: text(48),
        detail: text(80),
      }),
    )
    .length(3),
});

/** Hasta 11 editables: la pregunta legal (`LEGAL_FAQ_ITEM`) completa las 12. */
export const FAQ_MAX_ITEMS = 11;

export const FaqContentSchema = z.strictObject({
  title: text(60),
  intro: text(200),
  items: z
    .array(
      z.strictObject({
        question: text(160),
        answer: text(800),
      }),
    )
    .min(1)
    .max(FAQ_MAX_ITEMS),
});

const SocialCardSchema = z.strictObject({
  title: text(70),
  description: text(200),
});

export const SeoContentSchema = z.strictObject({
  title: text(70),
  description: text(160),
  keywords: z.array(text(40)).min(1).max(20),
  openGraph: SocialCardSchema,
  twitter: SocialCardSchema,
});

export const ContactContentSchema = z.strictObject({
  about: text(240),
  location: text(80),
  hours: z.array(text(60)).min(1).max(4),
  service: z.array(text(60)).min(1).max(6),
});

export type HeroContent = z.infer<typeof HeroContentSchema>;
export type TrustBandContent = z.infer<typeof TrustBandContentSchema>;
export type FaqContent = z.infer<typeof FaqContentSchema>;
export type SeoContent = z.infer<typeof SeoContentSchema>;
export type ContactContent = z.infer<typeof ContactContentSchema>;
export type FaqItem = FaqContent["items"][number];

// --- Pregunta legal +18: fija en código, no editable ---

/**
 * La pregunta de la cédula obligatoria (Ley 1335 de 2009) no se edita desde la
 * consola (decisión `dec-texto-legal-de-mayoria-de-edad`). `faq.items` guarda
 * solo las editables; `FAQ` (`components/faq.tsx`) inserta esta siempre en
 * `LEGAL_FAQ_INDEX`, y la consola la enseña bloqueada en ese mismo sitio.
 */
export const LEGAL_FAQ_ITEM: FaqItem = {
  question: '¿Es obligatoria la cédula de ciudadanía para recibir el pedido?',
  answer: 'Sí, de manera obligatoria y sin excepciones. Cumpliendo con la legislación colombiana (Ley 1335 de 2009), la venta de productos de vapeo y nicotina está estrictamente restringida a mayores de 18 años. Nuestro domiciliario te solicitará presentar el documento físico de identidad al momento de la entrega.'
};

/** Cuarta posición: donde estaba cuando era una pregunta más. */
export const LEGAL_FAQ_INDEX = 3;

/** Sin tildes, sin signos de puntuación, sin mayúsculas y con los espacios colapsados. */
export function comparableQuestion(question: string): string {
  return question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** `true` si la pregunta es la legal, escrita con o sin tildes, signos o mayúsculas. */
export function isLegalFaqQuestion(question: string): boolean {
  return comparableQuestion(question) === comparableQuestion(LEGAL_FAQ_ITEM.question);
}

/**
 * Quita de un valor de FAQ (aún sin validar) cualquier pregunta igual a la
 * legal: una versión publicada antes de la regla no la duplica. Lo que no
 * tenga forma de FAQ se devuelve tal cual. Mismo comportamiento que el backend
 * (lo comprueba la prueba de paridad).
 */
export function stripLegalFaqItem(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return value;
  return {
    ...value,
    items: items.filter((item) => {
      const question = (item as { question?: unknown } | null)?.question;
      return !(typeof question === "string" && isLegalFaqQuestion(question));
    }),
  };
}

/**
 * Normalización de lectura (igual que el backend): quita la legal y, si una
 * fila antigua deja más de `FAQ_MAX_ITEMS`, se queda con las primeras en vez de
 * caer al texto por defecto. Al publicar el máximo se exige.
 */
export function normalizeFaqForRead(value: unknown): unknown {
  const stripped = stripLegalFaqItem(value);
  const items = (stripped as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length <= FAQ_MAX_ITEMS) return stripped;
  console.warn(`[content] La FAQ guardada tiene ${items.length} preguntas editables; se sirven las ${FAQ_MAX_ITEMS} primeras`);
  return { ...(stripped as object), items: items.slice(0, FAQ_MAX_ITEMS) };
}

/** Las preguntas editables con la legal insertada en su sitio fijo. */
export function withLegalFaqItem(items: readonly FaqItem[]): FaqItem[] {
  const at = Math.min(LEGAL_FAQ_INDEX, items.length);
  return [...items.slice(0, at), LEGAL_FAQ_ITEM, ...items.slice(at)];
}

// --- Valores por defecto: el texto que el sitio tenía escrito a mano ---

export const HERO_DEFAULT: HeroContent = {
  label: 'SYSTEM ONLINE',
  tagline: 'Virtual Vape Shop'
};

export const TRUST_BAND_DEFAULT: TrustBandContent = {
  items: [
    { label: 'Envío', title: 'Domicilio en Valledupar', detail: 'Entrega rápida en tu puerta' },
    { label: 'Original', title: 'Productos 100% originales', detail: 'Verificables con código QR' },
    { label: 'Pago', title: 'Pago contra entrega', detail: 'Efectivo, Nequi y Daviplata' }
  ]
};

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

/** Esquema y valor por defecto de cada clave. */
export const CONTENT_SCHEMAS = {
  hero: { schema: HeroContentSchema, defaults: HERO_DEFAULT },
  "trust-band": { schema: TrustBandContentSchema, defaults: TRUST_BAND_DEFAULT },
  faq: { schema: FaqContentSchema, defaults: FAQ_DEFAULT },
  seo: { schema: SeoContentSchema, defaults: SEO_DEFAULT },
  contact: { schema: ContactContentSchema, defaults: CONTACT_DEFAULT },
} as const;

export type ContentKey = keyof typeof CONTENT_SCHEMAS;

export type ContentValue<K extends ContentKey> = z.infer<(typeof CONTENT_SCHEMAS)[K]["schema"]>;
