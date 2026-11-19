/**
 * Avisa al frontend de que algo publicado cambió (plan A7.3, ADR-002 §7).
 *
 * Después de cada escritura de la consola que cambia lo que ve el visitante
 * —catálogo, contenido o stock— el backend hace `POST /internal/revalidate`
 * al Next que corre en la misma máquina, y el cambio se ve al recargar sin
 * esperar los 60 s del ISR. Ese ISR sigue ahí como red de seguridad, por eso
 * aquí nada lanza: si el frontend está apagado, lento o rechaza el secreto, la
 * escritura ya está hecha y la respuesta a la consola no cambia; queda un
 * aviso en el log y `false`, que la ruta devuelve como `meta.revalidated`.
 *
 * Sin `REVALIDATE_SECRET` no se hace nada (tests, local sin frontend, primer
 * despliegue antes de que exista el secreto) y también devuelve `false`.
 */

/** Las mismas que `frontend/src/lib/cache-tags.ts` (lo comprueba una prueba). */
export const SITE_TAGS = ['catalogo', 'contenido'] as const;
export type SiteTag = (typeof SITE_TAGS)[number];

/** `true` si el frontend confirmó la revalidación. Nunca lanza. */
export type SiteRevalidator = (tags: SiteTag[]) => Promise<boolean>;

/** Next escucha en loopback (`vapeupar-frontend.service`). */
export const DEFAULT_REVALIDATE_URL = 'http://127.0.0.1:3000/internal/revalidate';

/** Tope de espera: la respuesta a la consola espera, como mucho, esto. */
export const REVALIDATE_TIMEOUT_MS = 3000;

export interface SiteRevalidatorOptions {
  secret?: string;
  url?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  warn?: (message: string) => void;
}

export function createSiteRevalidator(options: SiteRevalidatorOptions): SiteRevalidator {
  const {
    secret,
    url = DEFAULT_REVALIDATE_URL,
    fetch: doFetch = fetch,
    timeoutMs = REVALIDATE_TIMEOUT_MS,
    warn = (message: string) => console.warn(message)
  } = options;

  return async (tags) => {
    if (!secret || !url || tags.length === 0) return false;
    try {
      const response = await doFetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [...new Set(tags)] }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        warn(`[revalidación] el frontend respondió ${response.status} para ${tags.join(', ')}; se verá en ≤60 s`);
        return false;
      }
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.name === 'TimeoutError' ? 'sin respuesta' : error.message : String(error);
      warn(`[revalidación] no se pudo avisar al frontend (${reason}) para ${tags.join(', ')}; se verá en ≤60 s`);
      return false;
    }
  };
}

/**
 * El revalidador del proceso. Lee el entorno en cada llamada y no al importar,
 * como `getCognitoConfig`: `dotenv` se carga después de los imports.
 */
export const notifySite: SiteRevalidator = (tags) =>
  createSiteRevalidator({
    secret: process.env.REVALIDATE_SECRET,
    url: process.env.REVALIDATE_URL || DEFAULT_REVALIDATE_URL
  })(tags);
