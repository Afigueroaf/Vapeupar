/**
 * Cursor táctil: constantes, geometría y estado compartido.
 *
 * QUÉ ES. En un teléfono no hay puntero, así que todo lo que el sistema VP
 * dibuja «al apuntar» —el borde lima de la tarjeta, la lámina holográfica que
 * sigue al cursor, la inclinación 3D, el empuje de la nube de puntos, el
 * cabeceo del prisma— no se ve nunca. Este módulo sostiene un cursor virtual
 * que se enciende al mantener el dedo en la pantalla: a partir de ahí la
 * página recibe eventos de puntero sintéticos en la punta del cursor, y el
 * dedo pasa a mandar también el desplazamiento por zonas.
 *
 * REPARTO DE ARCHIVOS. Aquí vive lo que se puede leer sin pensar en el DOM:
 * los números ajustables, la curva de velocidad y la suscripción al modo. La
 * maquinaria de eventos está en `components/touch-cursor.tsx`.
 *
 * Ver `docs/frontend.md` §Cursor táctil.
 */

/* --- Números ajustables ---------------------------------------------------
 *
 * Los cuatro primeros son el contrato del gesto y conviene no moverlos sin
 * probar en un teléfono de verdad: entre ellos se reparten la frontera con el
 * desliz nativo, que es el gesto que todo el mundo ya tiene aprendido.
 */

/**
 * Cuánto hay que mantener el dedo quieto para que aparezca el cursor.
 *
 * 350 ms es deliberadamente tardío. Por debajo de ~250 ms el cursor se cuela
 * en gestos que eran un desliz lento, y el desliz es el gesto que la gente ya
 * sabe hacer: romperlo cuesta más que esperar. Por encima de ~450 ms el gesto
 * deja de sentirse como respuesta.
 */
export const HOLD_MS = 350;

/**
 * Margen de movimiento admitido durante la espera, en píxeles CSS.
 *
 * El dedo nunca está quieto. Con 10px se absorbe el temblor de la mano sin
 * confundir un desliz: un desliz de verdad recorre esos 10px en los primeros
 * fotogramas y cancela la espera, con lo que el navegador desplaza la página
 * como siempre y de este módulo no se entera nadie.
 */
export const MOVE_TOLERANCE_PX = 10;

/**
 * Franja central sin desplazamiento, en fracción del alto del viewport.
 *
 * 0.2 = el 20% central (del 40% al 60% de la pantalla). Fuera de ella, el
 * dedo arriba sube y el dedo abajo baja.
 */
export const DEAD_ZONE_RATIO = 0.2;

/** Velocidad máxima de desplazamiento, en píxeles CSS por segundo. */
export const MAX_SCROLL_SPEED = 1200;

/**
 * Curvatura del acelerador.
 *
 * La velocidad no es proporcional a la distancia al centro, sino a esa
 * distancia elevada a este exponente. CON EXPONENTE 1 EL GESTO ES
 * INMANEJABLE: las zonas miden el 40% de la pantalla cada una, así que al
 * borde mismo de la franja central la página ya se iría a 300 px/s y no habría
 * forma de posar el cursor sobre una tarjeta. Con 2, ese mismo punto da 75px/s
 * —un hilo— y la velocidad alta queda reservada al extremo de la pantalla, que
 * es donde el pulgar llega de forma deliberada.
 */
export const SCROLL_CURVE_EXP = 2;

/**
 * Cuánto se levanta la punta del cursor por encima del dedo, en píxeles CSS.
 *
 * SIN ESTO EL GESTO NO SIRVE DE NADA: el dedo tapa justo lo que se quiere
 * mirar. 56px es algo más que la anchura media de un pulgar (~45px) y deja la
 * punta a la vista sin alejarla tanto que haya que apuntar «a ciegas».
 */
export const CURSOR_LIFT_PX = 56;

/**
 * Silencio de desplazamiento exigido para que al levantar el dedo se pulse.
 *
 * Es la guarda contra el clic accidental: si la página se movió en los últimos
 * 150 ms, levantar el dedo no pulsa nada. Así terminar un recorrido largo no
 * abre un producto, pero posar el cursor sobre algo y soltar sí.
 */
export const CLICK_SCROLL_GRACE_MS = 150;

/**
 * Ventana en la que se siguen descartando los clics reales del navegador tras
 * apagar el cursor.
 *
 * El `click` nativo llega DESPUÉS de `pointerup`, es decir después de que el
 * cursor ya se haya apagado, y apuntaría a lo que hubiera bajo el dedo —no
 * bajo el cursor—. Hay que seguir descartándolo un instante más.
 */
export const CLICK_BLOCK_MS = 400;

/** Pulso del vibrador al encender el cursor, en milisegundos. */
export const VIBRATION_MS = 10;

/* --- Marcas en el DOM ----------------------------------------------------- */

/** Atributo en `<html>` mientras el cursor está encendido. */
export const CURSOR_MODE_ATTR = "data-vp-cursor";

/**
 * Clase que espeja `:hover` en la cadena de elementos bajo el cursor.
 *
 * POR QUÉ NO BASTA `:hover`. El navegador decide el `:hover` por la posición
 * REAL del dedo, que está 56px más abajo y casi siempre sobre otro elemento.
 * Y `:hover` no se puede simular. Así que el cursor virtual marca la cadena
 * con esta clase, y `globals.css` redefine la variante `hover` de Tailwind
 * para que todas las utilidades `hover:*` existentes respondan también a ella
 * (ver §CURSOR TÁCTIL).
 */
export const HOT_CLASS = "vp-hot";

/**
 * ¿Merece la pena marcar este elemento con `.vp-hot`?
 *
 * POR QUÉ EXISTE ESTE FILTRO. La cadena bajo la punta llega hasta `<html>`, y
 * marcar la cadena entera costaba carísimo: `vp-hot` aparece en reglas de
 * descendiente (`.vp-card.vp-hot .vp-holo`) y dentro de un `:has()`, así que
 * cada vez que la clase entra o sale de un contenedor de página el navegador
 * programa una invalidación que recorre medio documento. Medido en un Moto G15
 * durante un recorrido con el cursor: 1 569 ms de recálculo de estilo y 4 245
 * recálculos forzados en 14 segundos de gesto.
 *
 * Y no compraba nada. Un contenedor de página no tiene ninguna regla que
 * responda a `.vp-hot`: las que existen son `.vp-card` y las utilidades
 * `hover:*` de Tailwind, que en este proyecto viven todas en elementos
 * interactivos —enlaces, botones, campos—.
 *
 * CÓMO SE MANTIENE SOLO. La segunda condición mira si el elemento lleva alguna
 * utilidad `hover:*`, y eso se puede comprobar sin consultar el CSS porque
 * Tailwind v4 pone el nombre de la utilidad tal cual en el atributo `class`:
 * un elemento con `hover:text-action` lleva literalmente ese texto. O sea que
 * añadir un `hover:` nuevo en cualquier componente funciona con el cursor sin
 * tocar este archivo.
 *
 * LOS EVENTOS NO SE FILTRAN, SOLO LA CLASE. `pointerenter` / `pointerleave` y
 * compañía se siguen emitiendo en la cadena completa, porque de ellos viven la
 * nube, el prisma y el brillo de las tarjetas.
 */
export function marksHot(el: Element): boolean {
  if (el.classList.contains("vp-card")) return true;
  const className = el.getAttribute("class");
  return className !== null && className.includes("hover:");
}

/**
 * Identificador de los eventos de puntero sintéticos.
 *
 * No puede coincidir con el del dedo real: hay código —el prisma— que llama a
 * `setPointerCapture` con el identificador que recibe.
 */
export const VIRTUAL_POINTER_ID = 7_000_001;

/** Evento de ventana que anuncia el encendido o apagado del cursor. */
export const CURSOR_MODE_EVENT = "vp:cursor-mode";

/* --- Geometría ------------------------------------------------------------ */

/**
 * Velocidad de desplazamiento para un dedo a la altura `y` de una pantalla de
 * alto `height`. Positiva baja, negativa sube, cero en la franja central.
 *
 * Se exporta aparte de la maquinaria para poder razonarla —y probarla— sin
 * levantar un DOM.
 */
export function scrollSpeedAt(y: number, height: number): number {
  if (height <= 0) return 0;

  const half = DEAD_ZONE_RATIO / 2;
  // -0.5 (arriba del todo) .. 0.5 (abajo del todo), 0 en el centro.
  const offset = y / height - 0.5;
  const over = Math.abs(offset) - half;
  if (over <= 0) return 0;

  // Lo que queda de media pantalla por fuera de la franja central.
  const span = 0.5 - half;
  const ramp = span > 0 ? Math.min(1, over / span) : 1;

  return Math.sign(offset) * MAX_SCROLL_SPEED * Math.pow(ramp, SCROLL_CURVE_EXP);
}

/**
 * Cadena de elementos bajo un punto, del más interno a `<html>`.
 *
 * Es la cadena que el navegador marcaría con `:hover`, y la que recibe los
 * eventos de frontera (`pointerenter` / `pointerleave`), que no burbujean.
 */
export function hoverChain(el: Element | null): Element[] {
  const chain: Element[] = [];
  for (let node = el; node; node = node.parentElement) chain.push(node);
  return chain;
}

/* --- Estado compartido ----------------------------------------------------
 *
 * Dos componentes necesitan saber si el cursor está encendido para dejar de
 * exigir puntero fino: `<CardField />` (inclinación y brillo de las tarjetas)
 * y `<VaporizerPointCloud />` (empuje de la nube). Se suscriben con
 * `useSyncExternalStore`, que es el patrón que ya usa la puerta +18.
 */

/** Para `useSyncExternalStore`: avisa en cada cambio de modo. */
export function subscribeCursorMode(onChange: () => void): () => void {
  window.addEventListener(CURSOR_MODE_EVENT, onChange);
  return () => window.removeEventListener(CURSOR_MODE_EVENT, onChange);
}

/** ¿Está encendido el cursor virtual? Lee el DOM, que es la única fuente. */
export function isCursorMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(CURSOR_MODE_ATTR) === "on";
}

/** En el servidor no hay dedo. */
export function isCursorModeOnServer(): boolean {
  return false;
}
