import { z } from 'zod';
import { CONTACT_DEFAULT, ContactContentSchema } from './contact.js';
import { FAQ_DEFAULT, FaqContentSchema } from './faq.js';
import { HERO_DEFAULT, HeroContentSchema } from './hero.js';
import { SEO_DEFAULT, SeoContentSchema } from './seo.js';
import { TRUST_BAND_DEFAULT, TrustBandContentSchema } from './trust-band.js';

/**
 * Esquemas del contenido editable del sitio (plan A7.1, ADR-002 §5).
 *
 * Uno por clave, con su valor por defecto, que es el texto que el sitio tenía
 * escrito a mano y también el respaldo cuando la API no responde o la clave
 * nunca se publicó (invariante 6).
 *
 * ESPEJO EN EL FRONTEND: `frontend/src/lib/content/schemas.ts`. Hasta que haya
 * un paquete de contratos compartido, los dos se mantienen a mano y
 * `content-parity.test.ts` falla si divergen en forma o en valores por defecto.
 */
export const CONTENT_SCHEMAS = {
  hero: { schema: HeroContentSchema, defaults: HERO_DEFAULT },
  'trust-band': { schema: TrustBandContentSchema, defaults: TRUST_BAND_DEFAULT },
  faq: { schema: FaqContentSchema, defaults: FAQ_DEFAULT },
  seo: { schema: SeoContentSchema, defaults: SEO_DEFAULT },
  contact: { schema: ContactContentSchema, defaults: CONTACT_DEFAULT }
} as const;

export type ContentKey = keyof typeof CONTENT_SCHEMAS;

/** Lista cerrada de claves, como tupla para `z.enum`. */
export const CONTENT_KEYS = ['hero', 'trust-band', 'faq', 'seo', 'contact'] as const satisfies readonly ContentKey[];

// Si alguien añade un esquema y olvida la clave (o al revés), esto no compila.
type MissingKey = Exclude<ContentKey, typeof CONTENT_KEYS[number]>;
const _allKeysListed: MissingKey extends never ? true : never = true;
void _allKeysListed;

export type ContentValue<K extends ContentKey> = z.infer<typeof CONTENT_SCHEMAS[K]['schema']>;

export {
  FAQ_MAX_ITEMS, LEGAL_FAQ_INDEX, LEGAL_FAQ_ITEM, PARTNER_BRANDS_TOKEN, comparableQuestion, isLegalFaqQuestion,
  normalizeFaqForRead, stripLegalFaqItem
} from './faq.js';
