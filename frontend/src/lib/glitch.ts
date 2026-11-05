/**
 * Señal del glitch RGB de la página.
 *
 * `<PageGlitch />` es quien la produce: escribe `--glitch-shift` en el elemento
 * raíz en cada fotograma. Vive aquí, y no dentro de ese componente, porque la
 * consumen dos mundos distintos —el filtro SVG en CSS y el shader de la nube de
 * puntos— y el valor máximo tiene que ser el mismo en los tres sitios o la
 * intensidad se descoordina.
 */

/**
 * Separación máxima de los canales R/B, en píxeles.
 *
 * `globals.css` divide por este mismo número para las scanlines. Si cambia
 * aquí, hay que cambiarlo allí.
 */
export const GLITCH_MAX_SHIFT = 14;

/**
 * Desplazamiento vigente, en píxeles. 0 cuando no hay glitch.
 *
 * Lee el estilo **en línea**, no el computado: `getComputedStyle` fuerza un
 * recálculo de estilos, y esto se consulta sesenta veces por segundo desde el
 * bucle de dibujo. La propiedad la escribe `PageGlitch` con `style.setProperty`,
 * así que está justo ahí.
 *
 * Devuelve 0 cuando `PageGlitch` no está montado: bajo `prefers-reduced-motion`
 * y en la consola de administración no hay glitch, y tampoco debe haberlo en la
 * nube.
 */
export function readGlitchShift(): number {
  if (typeof document === "undefined") return 0;
  const raw = document.documentElement.style.getPropertyValue("--glitch-shift");
  if (!raw) return 0;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}
