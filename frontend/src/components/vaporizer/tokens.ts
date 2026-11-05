/**
 * Puente entre los tokens de color de `globals.css` y three.js.
 *
 * POR QUÉ EXISTE: la regla del sistema VP es que ningún componente escribe un
 * hex literal (`globals.css` §TOKENS). Pero three.js no entiende `var(--x)`:
 * necesita un número. Así que el color se *lee* del token en tiempo de
 * ejecución en lugar de duplicarse en el código del render.
 *
 * El valor de respaldo de abajo es la única copia del hex fuera de `@theme`, y
 * solo se usa si `getComputedStyle` devuelve vacío (SSR, jsdom, o el token
 * renombrado). Si cambia la paleta y este archivo se queda atrás, el síntoma es
 * un holograma del color viejo, no una pantalla en negro.
 */

/** Espejo de `--color-action` (`--color-vp-lime`). Solo respaldo. */
const FALLBACK = "#d7ff00";

/**
 * Devuelve el valor calculado de una custom property del documento.
 *
 * Las custom properties se sustituyen en tiempo de valor calculado, así que
 * `--color-action: var(--color-vp-lime)` se lee ya resuelto a su hex.
 */
export function readColorToken(name: string, fallback: string = FALLBACK): string {
  if (typeof window === "undefined") return fallback;

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
