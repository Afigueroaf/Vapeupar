/**
 * Lógica pura de la puerta +18 (`components/age-verification-modal.tsx`).
 *
 * Vive aparte del componente para poder probarla sin React ni navegador. El
 * componente sigue leyendo `localStorage` y la fecha actual; aquí solo se
 * decide, con esos dos datos, si hay que volver a preguntar.
 */

/** Clave de `localStorage` con el instante (ms) de la última confirmación. */
export const VERIFICATION_KEY = "vapeupar_age_verified_at";

/** La verificación se renueva cada 30 días (LO QUE NO SE TOCA, §9.1). */
export const VERIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * ¿Hay que mostrar la puerta? `stored` es lo que hay guardado en
 * `VERIFICATION_KEY` (o `null`) y `now`, el instante actual en ms.
 *
 * Vigente solo si la verificación cae dentro de los últimos 30 días: a los 30
 * días exactos ya caduca.
 */
export function needsVerification(stored: string | null, now: number): boolean {
  if (!stored) return true;
  const timestamp = parseInt(stored, 10);
  return isNaN(timestamp) || now - timestamp >= VERIFICATION_TTL_MS;
}
