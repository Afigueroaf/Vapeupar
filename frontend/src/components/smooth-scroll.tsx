"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Intensidad del suavizado, EN UN SOLO SITIO.
 *
 * Es la fracción de la distancia que falta que se recorre en cada fotograma,
 * así que CUANTO MÁS BAJO, MÁS SUAVE. La usan la rueda (opción `lerp` de la
 * instancia) y el teclado (cada `scrollTo`), y tienen que valer lo mismo o los
 * dos frenarían distinto.
 */
const SUAVIZADO = 0.07;

/**
 * Desplazamiento suavizado de la página pública (Lenis 1.3.27).
 *
 * QUÉ HACE LENIS, Y QUÉ NO. No mueve el contenido con `transform`: intercepta
 * la rueda del ratón, acumula el destino y se lo pide al navegador con
 * `scrollTo` fotograma a fotograma. El desplazamiento del documento SIGUE
 * SIENDO EL NATIVO, y eso es justo lo que hace que el resto del sistema no se
 * entere:
 *
 *   - Las capas `position: fixed` —navbar, botón flotante, velo de scanlines,
 *     puerta +18— siguen ancladas al viewport.
 *   - El armado del glitch mide con `getBoundingClientRect` en cada ráfaga
 *     (`page-glitch.tsx`), así que lee la posición real, no una interpolada.
 *   - `window.scrollY` no miente, de modo que el bloqueo de la puerta +18
 *     —que fija el `body` con un `top` negativo— sigue guardando y devolviendo
 *     la posición correcta.
 *
 * La alternativa clásica (envolver el documento y animar su `transform`) habría
 * roto las tres cosas a la vez.
 *
 * NO SE TOCA EL CURSOR TÁCTIL. `touch-cursor.tsx` desplaza con `window.scrollBy`
 * fotograma a fotograma, y aquí no hay conflicto por dos motivos: `syncTouch`
 * se queda en `false`, así que Lenis no intercepta nada del dedo, y cuando algo
 * externo mueve el documento, Lenis adopta la posición real en el acto —su
 * `onNativeScroll` iguala `animatedScroll` y `targetScroll` a `actualScroll`
 * mientras no esté él desplazando (verificado en `dist/lenis.js`)—. Lo que el
 * cursor táctil pida, manda.
 *
 * POR QUÉ NO SE SUAVIZA EL TÁCTIL. `syncTouch: true` sustituye la inercia del
 * sistema por una propia, y eso en un teléfono es peor negocio en los dos
 * frentes de este proyecto: se nota como retardo del dedo y mete trabajo de JS
 * en cada fotograma de scroll en el equipo más justo (un Moto G15, el de las
 * medidas de `docs/performance-optimization-plan.md`). La rueda del ratón, que
 * es lo que da saltos secos, solo existe en escritorio.
 *
 * EL TECLADO SE SUAVIZA AQUÍ, NO EN LA LIBRERÍA: Lenis solo escucha `wheel` y
 * los eventos de toque, así que las flechas, av/re página e inicio/fin seguían
 * dando el salto seco del navegador. El bloque `--- Teclado ---`, más abajo,
 * cancela ese salto y pide el mismo recorrido a Lenis.
 *
 * MOVIMIENTO REDUCIDO: lo respeta Lenis solo, por `respectReducedMotion`
 * (activo por defecto). No hace falta la guarda de `prefers-reduced-motion` que
 * sí lleva `<PageGlitch />`.
 *
 * EN LA CONSOLA (`/admin`) NO SE MONTA, igual que el glitch: ahí el armazón va
 * sin efectos y un bucle de `requestAnimationFrame` solo gastaría batería.
 */
export function SmoothScroll() {
  const onConsole = usePathname().startsWith("/admin");

  useEffect(() => {
    if (onConsole) return;

    const lenis = new Lenis({
      /**
       * CUANTO MÁS BAJO, MÁS SUAVE: el `lerp` es la fracción de la distancia
       * que falta que se recorre en cada fotograma, así que 0.07 persigue el
       * destino más despacio que el 0.1 por defecto de la librería y alarga la
       * cola del frenado (de ~0.45s a ~0.65s en recorrer el 95% de un salto de
       * rueda).
       *
       * No baja más por una razón concreta: por debajo de ~0.05 la página se
       * queda "nadando" detrás de la rueda y el texto pasa demasiado tiempo en
       * movimiento para poder leerlo mientras se desplaza.
       */
      lerp: SUAVIZADO,

      /** Lo único que se suaviza: la rueda. Ver la nota del táctil, arriba. */
      smoothWheel: true,
      syncTouch: false,

      /**
       * Los cuatro enlaces del pie apuntan a anclas de la misma página
       * (`#desechables`, `#pods`, `#liquidos`, `#faq`). Sin esto el navegador
       * salta de golpe y Lenis se limita a adoptar la nueva posición; con esto
       * el salto se recorre con la misma curva que la rueda, que es lo que
       * convierte el pie en una navegación y no en un teletransporte.
       */
      anchors: true,

      /**
       * El bucle lo lleva la propia librería. Un `requestAnimationFrame` propio
       * aquí sería un tercer bucle en la página —ya hay el del glitch y los de
       * las piezas 3D— sin ninguna ventaja: no hay nada que sincronizar con
       * ellos, porque cada uno escribe en cosas distintas.
       */
      autoRaf: true,

      /**
       * EL LÍMITE SE LEE EN VIVO, NUNCA DE UNA MEDIDA GUARDADA.
       *
       * Por defecto Lenis guarda `scrollHeight` y el alto de la ventana y solo
       * los renueva cuando sus observadores ven cambiar `<html>` o la ventana.
       * Esa caché fallaba por dos lados en esta página:
       *
       *   1. `<html>` lleva `h-full` (`layout.tsx`) y mide siempre una ventana,
       *      así que el observador no salta cuando la portada crece —vitrina 3D,
       *      catálogo, imágenes—: la rueda se frenaba en seco a mitad de página.
       *
       *   2. EL BLOQUEO DE SCROLL ENVENENA LA CACHÉ. La puerta +18 y el carrito
       *      (`use-scroll-lock.ts`) fijan el `body`; un `body` fijo no aporta
       *      desplazamiento al documento, así que cualquier medida tomada
       *      durante el bloqueo da límite 0. Al soltarlo, el `body` recupera
       *      exactamente el tamaño que tenía, ningún observador salta y Lenis
       *      se queda con el 0: toda rueda acaba en `clamp(0, destino, 0)` y la
       *      página no se mueve. Con la puerta pasaba en la PRIMERA visita: el
       *      observador mide nada más montar, con la puerta ya cerrada. Con el
       *      carrito, si la ventana cambiaba de tamaño mientras estaba abierto
       *      (zoom, consola de desarrollo). SOLO EN ESCRITORIO porque el dedo no
       *      pasa por Lenis (`syncTouch: false`), y el teclado se salvaba porque
       *      con límite 0 se deja al navegador (ver `--- Teclado ---`).
       *
       * Antes se parcheaba (1) observando el `<body>`, lo que no cubría (2).
       * Con `naiveDimensions` el límite es `scrollHeight - clientHeight` de
       * `<html>` en cada lectura, y no hay nada que pueda quedarse viejo. El
       * coste es mínimo: Lenis solo lo lee al recibir un evento de rueda o de
       * teclado, no en cada fotograma de la animación (verificado en
       * `dist/lenis.mjs`).
       */
      naiveDimensions: true,
    });

    /* --- Teclado ---------------------------------------------------------
     *
     * LENIS NO SUAVIZA EL TECLADO. Solo escucha `wheel` y los eventos de
     * toque; las flechas, av/re página e inicio/fin las resuelve el navegador
     * con su propio salto, y Lenis se limita a adoptar la posición nueva
     * (`onNativeScroll`). El resultado era una página que se desliza con la
     * rueda y salta a secas con el teclado.
     *
     * Así que el salto nativo se cancela y se pide el mismo desplazamiento a
     * Lenis. SE SUMA SOBRE `targetScroll` Y NO SOBRE LA POSICIÓN ACTUAL: con
     * la tecla mantenida, el navegador repite el evento varias veces por
     * segundo, y acumular sobre el destino es lo que convierte la repetición
     * en un desplazamiento continuo en vez de en un forcejeo contra la
     * interpolación en curso.
     */
    const PASO_FLECHA = 80;

    /** Lo que avanza av/re página: una pantalla menos un solapamiento, para no
     *  perder la línea por la que se iba. */
    const pasoPagina = () => window.innerHeight * 0.9;

    /**
     * Teclas que el foco se queda para sí.
     *
     * En un `<select>` del catálogo las flechas cambian de opción, en un campo
     * de texto mueven el cursor y en un botón o enlace el espacio lo activa.
     * Robar esas teclas para desplazar la página rompería el formulario de
     * filtros y la navegación con teclado, que es justo lo que esto viene a
     * mejorar.
     */
    const escribiendo = (nodo: EventTarget | null) => {
      if (!(nodo instanceof HTMLElement)) return false;
      if (nodo.isContentEditable) return true;
      return ["INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON", "A"].includes(nodo.tagName);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Los atajos del navegador no se tocan: Alt+flecha es atrás/adelante y
      // Ctrl/Cmd+flecha o +inicio/fin son suyos en varias plataformas.
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.defaultPrevented || escribiendo(event.target)) return;

      let destino: number | null = null;

      switch (event.key) {
        case "ArrowDown":
          destino = lenis.targetScroll + PASO_FLECHA;
          break;
        case "ArrowUp":
          destino = lenis.targetScroll - PASO_FLECHA;
          break;
        case "PageDown":
        case " ":
          destino = lenis.targetScroll + pasoPagina();
          break;
        case "PageUp":
          destino = lenis.targetScroll - pasoPagina();
          break;
        case "Home":
          destino = 0;
          break;
        case "End":
          destino = lenis.limit;
          break;
        default:
          return;
      }

      // Si la puerta +18 está abierta no hay documento que desplazar —fija el
      // `body`, así que el límite es 0—, y cancelar la tecla ahí dejaría el
      // espacio sin activar el botón de confirmación. Se comprueba por el
      // límite y no por la puerta, que es un componente del que esto no sabe
      // nada.
      if (lenis.limit <= 0) return;

      event.preventDefault();
      lenis.scrollTo(Math.max(0, Math.min(destino, lenis.limit)), {
        // ESTAS DOS OPCIONES VAN JUNTAS, Y SON LAS MISMAS QUE LA LIBRERÍA SE
        // PASA A SÍ MISMA AL TRATAR LA RUEDA (`onVirtualScroll`, en
        // `dist/lenis.js`): `programmatic: false` marca el desplazamiento como
        // gesto del usuario —acumulable, interrumpible y, bajo movimiento
        // reducido, instantáneo en vez de animado—, pero con ese valor el
        // `lerp` por defecto del método queda en `undefined`, así que hay que
        // pasarlo explícitamente o el salto sale seco. Con los dos, el teclado
        // y la rueda frenan exactamente igual.
        programmatic: false,
        lerp: SUAVIZADO,
      });
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      lenis.destroy();
    };
  }, [onConsole]);

  return null;
}
