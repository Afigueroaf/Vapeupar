/**
 * Etiquetas de la caché de datos de Next (plan A7.3).
 *
 * Cada lectura del sitio público va etiquetada con una de estas, y el backend
 * las invalida con `POST /internal/revalidate` después de cada escritura que
 * cambia lo que ve el visitante. Viven en un módulo propio porque las usan
 * `lib/api.ts`, `lib/content.ts` y la ruta interna, y `content.ts` ya importa
 * de `api.ts`.
 *
 * El backend lleva la misma lista en `site-revalidation.service.ts`; una prueba
 * del backend comprueba que coinciden.
 */

/** Catálogo: marcas, líneas, variantes y stock. */
export const CATALOG_TAG = "catalogo";

/** Contenido editable: textos de portada, FAQ, banda de confianza… */
export const CONTENT_TAG = "contenido";

/** Las únicas etiquetas que acepta la ruta de revalidación. */
export const SITE_TAGS = [CATALOG_TAG, CONTENT_TAG] as const;

export type SiteTag = (typeof SITE_TAGS)[number];
