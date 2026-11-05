/**
 * Ajuste del presupuesto gráfico al dispositivo.
 *
 * No hay medición de FPS en tiempo real a propósito: un bucle que sube y baja
 * la densidad produce saltos visibles y, en un elemento decorativo, el remedio
 * se nota más que la enfermedad. Lo que hay es una estimación barata y estable
 * tomada una vez al montar.
 */

/**
 * `navigator.deviceMemory` solo existe en Chromium y no está en los tipos del
 * DOM. Se lee de forma defensiva porque su ausencia es lo normal en Safari y
 * Firefox, no un error.
 */
interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
}

/**
 * ¿Puede el navegador abrir un contexto WebGL?
 *
 * Se comprueba antes de montar el `Canvas` para poder enseñar la alternativa
 * estática en lugar de un hueco vacío. El contexto de prueba se descarta de
 * inmediato con `WEBGL_lose_context`: los contextos WebGL vivos son un recurso
 * limitado del navegador (del orden de 8-16 por pestaña) y dejar uno colgado
 * aquí podría impedir que el real se cree.
 */
export function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;

    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Factor de 0,35 a 1 por el que se multiplica el número de partículas pedido.
 *
 * Los tres indicios son pistas, no medidas: `pointer: coarse` identifica táctil
 * (teléfonos, donde además la pieza se ve pequeña y la densidad importa menos),
 * y los núcleos y la memoria separan un portátil de gama baja de uno de
 * trabajo. El suelo de 0,35 existe para que la silueta nunca se quede tan vacía
 * que deje de reconocerse.
 */
export function deviceBudgetFactor(): number {
  if (typeof window === "undefined") return 1;

  let factor = 1;

  if (window.matchMedia("(pointer: coarse)").matches) factor *= 0.6;

  const cores = window.navigator.hardwareConcurrency ?? 8;
  if (cores <= 4) factor *= 0.7;

  const memory = (window.navigator as NavigatorWithHints).deviceMemory;
  if (typeof memory === "number" && memory <= 4) factor *= 0.8;

  return Math.max(0.35, factor);
}

/**
 * Rango de `devicePixelRatio` que se le permite al lienzo.
 *
 * En una pantalla 3x, renderizar a resolución nativa multiplica por nueve los
 * píxeles de un efecto que es puro relleno aditivo. El tope de 2 es invisible
 * en puntos pequeños con halo y recorta el coste a menos de la mitad.
 */
export function canvasDpr(): [number, number] {
  return [1, window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2];
}
