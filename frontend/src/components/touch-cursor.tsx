"use client";

import { useEffect, useRef, useState } from "react";
import {
  CLICK_BLOCK_MS,
  CLICK_SCROLL_GRACE_MS,
  CURSOR_LIFT_PX,
  CURSOR_MODE_ATTR,
  CURSOR_MODE_EVENT,
  HOLD_MS,
  HOT_CLASS,
  MOVE_TOLERANCE_PX,
  VIBRATION_MS,
  VIRTUAL_POINTER_ID,
  hoverChain,
  scrollSpeedAt,
} from "@/lib/touch-cursor";

/**
 * Cursor táctil para teléfonos.
 *
 * EL GESTO. Se mantiene el dedo quieto 350 ms y aparece un cursor 56px por
 * encima de él. A partir de ahí:
 *
 *   - El dedo en el 40% superior sube la página; en el 40% inferior la baja;
 *     en el 20% central no la mueve. La velocidad crece con el cuadrado de la
 *     distancia a la franja central (`scrollSpeedAt`).
 *   - La página se desliza POR DEBAJO del cursor, así que los elementos se van
 *     encendiendo al pasar bajo la punta.
 *   - Al levantar el dedo se pulsa lo que estuviera bajo el cursor, salvo que
 *     la página se haya movido en los últimos 150 ms.
 *
 * CÓMO SE SIMULA EL PUNTERO. El navegador no deja falsificar `:hover`, y el
 * `:hover` real lo decide la posición del DEDO, que está 56px más abajo y casi
 * siempre sobre otro elemento. Así que esto hace dos cosas en paralelo:
 *
 *   1. Despacha en la punta del cursor la secuencia completa de eventos de
 *      puntero y de ratón que despacharía un ratón de escritorio, incluidos
 *      los de frontera (`pointerover` / `pointerenter` / `pointerout` /
 *      `pointerleave`), que no burbujean y hay que emitir elemento a elemento.
 *      De esos eventos viven ya el brillo y la inclinación de las tarjetas
 *      (`ui/card-field.tsx`), el empuje de la nube (`vaporizer-point-cloud`)
 *      y el cabeceo del prisma (`prism/scene.ts`): no ha habido que tocar la
 *      lógica de ninguno de los tres.
 *   2. Marca la cadena de elementos bajo la punta con `.vp-hot`, que
 *      `globals.css` empalma con la variante `hover` de Tailwind para que todas
 *      las utilidades `hover:*` del proyecto respondan a ella.
 *
 * Y UNA TERCERA, MENOS OBVIA: mientras el cursor está encendido, los eventos
 * REALES del dedo se detienen en la fase de captura de `window` y no llegan a
 * la página. Sin eso todo pasaría dos veces y en dos sitios distintos —el
 * prisma giraría con el dedo mientras el cursor lo cabecea desde otro punto, y
 * el `click` nativo abriría lo que hubiera bajo el dedo—. Los sintéticos se
 * reconocen porque `isTrusted` es `false`.
 *
 * DÓNDE SE MONTA: solo en el sitio público (`app/page.tsx`). La consola de
 * administración se queda con táctil normal; ahí hay formularios, tablas y
 * campos de texto donde un cursor virtual estorbaría más que ayudaría.
 *
 * LO QUE NO HACE, a propósito:
 *   - No se activa si el gesto empieza sobre un campo de formulario o dentro
 *     de la puerta +18 (`[aria-modal]`), donde la página está fija.
 *   - No abre el desplegable nativo de un `<select>`: un `click` sintético no
 *     lo abre en ningún navegador. El toque corto normal sigue sirviendo.
 *   - No da el foco al elemento que pulsa. Un ratón tampoco lo hace.
 *
 * Ver `lib/touch-cursor.ts` para los números y `docs/frontend.md`.
 */

/**
 * Eventos del dedo real que no deben llegar a la página con el cursor
 * encendido. `string[]` y no `as const` a propósito: así `addEventListener`
 * resuelve por su firma genérica y no exige un manejador por tipo de evento.
 */
const SEALED: string[] = [
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointercancel",
  "pointerover",
  "pointerout",
  "pointerenter",
  "pointerleave",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseover",
  "mouseout",
  "mouseenter",
  "mouseleave",
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "selectstart",
  "dragstart",
];

/** De los sellados, los que además hay que cancelar y no solo detener. */
const CANCELLED = new Set([
  // El que impide que la página se desplace con el dedo: el desplazamiento lo
  // manda ahora la zona, no el arrastre. `touch-action: none` NO basta, porque
  // el navegador fija ese valor al empezar el gesto y aquí se cambia a mitad.
  "touchmove",
  // El menú contextual de la pulsación larga del sistema, que llega sobre los
  // 500 ms: justo después de encenderse el cursor.
  "contextmenu",
  "selectstart",
  "dragstart",
  "click",
  "auxclick",
  "dblclick",
]);

/** Los que siguen molestando después de apagar el cursor, porque llegan tarde. */
const LATE = new Set(["click", "auxclick", "dblclick", "contextmenu"]);

/** Dónde no se enciende el cursor. */
const FORBIDDEN =
  "input, textarea, select, [contenteditable=''], [contenteditable='true'], [aria-modal='true']";

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function TouchCursor() {
  /**
   * Nada de esto se monta con puntero fino. No es solo ahorro: en un portátil
   * el cursor de verdad ya hace este trabajo, y el rótulo de la esquina
   * mentiría.
   */
  const [coarse, setCoarse] = useState(false);

  const layerRef = useRef<SVGSVGElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const leashRef = useRef<SVGLineElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!coarse) return;

    // Los nodos del SVG. Se vuelven a declarar ya sin `null` tras la
    // comprobación porque TypeScript no conserva el estrechamiento dentro de
    // las funciones DECLARADAS de este ámbito: están izadas, así que no puede
    // dar por hecho que se llamen después de la guarda.
    const svgNode = layerRef.current;
    const arrowNode = arrowRef.current;
    const ringNode = ringRef.current;
    const leashNode = leashRef.current;
    if (!svgNode || !arrowNode || !ringNode || !leashNode) return;

    const layer: SVGSVGElement = svgNode;
    const arrow: SVGGElement = arrowNode;
    const ring: SVGCircleElement = ringNode;
    const leash: SVGLineElement = leashNode;

    const root = document.documentElement;

    /** Dedo apoyado y a la espera de cumplir los 350 ms, o `null`. */
    let armed: { id: number; type: string; x: number; y: number; target: Element } | null = null;
    let timer = 0;
    let active = false;

    /** Dedo (`f`) y punta del cursor (`c`), en píxeles de viewport. */
    let fx = 0;
    let fy = 0;
    let cx = 0;
    let cy = 0;

    /** Cadena bajo la punta, del elemento más interno hacia `<html>`. */
    let hot: Element[] = [];

    let raf = 0;
    let last = 0;
    /** Fracción de píxel pendiente de desplazar. Ver el bucle. */
    let debt = 0;
    let lastScrollAt = 0;
    /**
     * Cuándo se apagó el cursor por última vez.
     *
     * `-Infinity` y no 0: con 0, «hace menos de 400 ms que se apagó» sería
     * cierto durante los primeros 400 ms de vida de la página —el reloj de
     * `performance.now()` empieza ahí— y se habría descartado el primer toque
     * de quien llega con prisa, sin que hubiera existido ningún gesto.
     */
    let endedAt = Number.NEGATIVE_INFINITY;

    /* --- Eventos sintéticos --------------------------------------------- */

    function emit(
      type: string,
      el: Element,
      related: Element | null,
      bubbles: boolean,
      extra: Partial<PointerEventInit> = {},
    ) {
      const init: PointerEventInit = {
        bubbles,
        cancelable: true,
        composed: true,
        view: window,
        clientX: cx,
        clientY: cy,
        screenX: cx,
        screenY: cy,
        relatedTarget: related,
        // -1 / 0 es lo que declara un puntero que se mueve sin botones
        // pulsados; la secuencia del clic lo sobrescribe.
        button: -1,
        buttons: 0,
        ...extra,
      };

      el.dispatchEvent(
        type.startsWith("pointer")
          ? new PointerEvent(type, {
              pointerId: VIRTUAL_POINTER_ID,
              pointerType: "mouse",
              isPrimary: true,
              width: 1,
              height: 1,
              ...init,
            })
          : new MouseEvent(type, init),
      );
    }

    /**
     * Mueve el puntero virtual de un elemento a otro.
     *
     * Reproduce el reparto que hace el navegador: `pointerout` / `pointerover`
     * burbujean una sola vez, y `pointerleave` / `pointerenter` se emiten en
     * cada elemento del tramo que se abandona o se entra —de dentro hacia
     * fuera y de fuera hacia dentro, respectivamente—. El tramo se calcula
     * contra el primer ancestro común de las dos cadenas, que es exactamente
     * donde el navegador deja de emitir.
     */
    function retarget(next: Element | null) {
      const previous = hot;
      const before = previous.length > 0 ? previous[0] : null;
      if (next === before) return;

      const chain = hoverChain(next);
      const common = previous.find((el) => chain.includes(el)) ?? null;
      const after = chain.length > 0 ? chain[0] : null;

      if (before) {
        emit("pointerout", before, after, true);
        emit("mouseout", before, after, true);
        for (const el of previous) {
          if (el === common) break;
          el.classList.remove(HOT_CLASS);
          emit("pointerleave", el, after, false);
          emit("mouseleave", el, after, false);
        }
      }

      if (after) {
        emit("pointerover", after, before, true);
        emit("mouseover", after, before, true);
        const entering: Element[] = [];
        for (const el of chain) {
          if (el === common) break;
          entering.push(el);
        }
        // De fuera hacia dentro, como los emite el navegador.
        for (const el of entering.reverse()) {
          el.classList.add(HOT_CLASS);
          emit("pointerenter", el, before, false);
          emit("mouseenter", el, before, false);
        }
      }

      hot = chain;
    }

    /** La secuencia de un clic de ratón, entera. */
    function tap(el: Element) {
      emit("pointerdown", el, null, true, { button: 0, buttons: 1, pressure: 0.5 });
      emit("mousedown", el, null, true, { button: 0, buttons: 1 });
      emit("pointerup", el, null, true, { button: 0, buttons: 0, pressure: 0 });
      emit("mouseup", el, null, true, { button: 0, buttons: 0 });
      emit("click", el, null, true, { button: 0, buttons: 0, detail: 1 });
    }

    /* --- Bucle ----------------------------------------------------------- */

    function draw() {
      arrow.setAttribute("transform", `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`);
      ring.setAttribute("cx", fx.toFixed(1));
      ring.setAttribute("cy", fy.toFixed(1));
      leash.setAttribute("x1", fx.toFixed(1));
      leash.setAttribute("y1", fy.toFixed(1));
      leash.setAttribute("x2", cx.toFixed(1));
      leash.setAttribute("y2", cy.toFixed(1));
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);

      // Tope de 50 ms: si la pestaña vuelve de segundo plano, el salto
      // acumulado no debe convertirse en un desplazamiento de media página.
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;

      // 1. Desplazamiento por zonas.
      let scrolled = false;
      const speed = scrollSpeedAt(fy, window.innerHeight);
      if (speed === 0) {
        debt = 0;
      } else {
        // Se acumula la fracción de píxel: a 40 px/s un fotograma son 0.6px, y
        // pidiéndolos de uno en uno el navegador los redondea a cero y la
        // página no se movería NUNCA en la parte lenta de la curva.
        debt += speed * dt;
        const step = Math.trunc(debt);
        if (step !== 0) {
          debt -= step;
          const from = window.scrollY;
          window.scrollBy({ top: step, left: 0, behavior: "auto" });
          scrolled = window.scrollY !== from;
          if (scrolled) lastScrollAt = now;
        }
      }

      // 2. Punta del cursor. Pegada al dedo y 56px por encima, dentro del
      //    viewport: contra el borde de arriba se queda en el canto en vez de
      //    salirse de la pantalla.
      const nx = clamp(fx, 2, window.innerWidth - 2);
      const ny = clamp(fy - CURSOR_LIFT_PX, 2, window.innerHeight - 2);
      const moved = nx !== cx || ny !== cy;
      cx = nx;
      cy = ny;
      draw();

      // 3. Lo que hay debajo. Se recalcula también con el dedo quieto si la
      //    página se ha movido: ahí es el contenido el que pasa por debajo de
      //    la punta.
      if (!moved && !scrolled) return;

      const el = document.elementFromPoint(cx, cy);
      retarget(el);
      if (el) {
        emit("pointermove", el, null, true);
        emit("mousemove", el, null, true);
      }
    }

    /* --- Encendido y apagado --------------------------------------------- */

    function activate() {
      timer = 0;
      if (!armed || active) return;

      active = true;
      debt = 0;
      lastScrollAt = 0;
      root.setAttribute(CURSOR_MODE_ATTR, "on");

      // La página ya recibió el `pointerdown` del dedo —el cursor nace 350 ms
      // más tarde— y puede creerse en mitad de un arrastre. El prisma, por
      // ejemplo, se ha quedado con su `pointerDown` en alto y con la captura
      // del puntero sobre su lienzo. Un `pointercancel` con el identificador
      // REAL lo devuelve a su sitio; es un evento que ese código ya trata.
      armed.target.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          composed: true,
          pointerId: armed.id,
          pointerType: armed.type,
          isPrimary: true,
        }),
      );

      // La captura asegura que los movimientos del dedo sigan llegando aquí
      // aunque pase por encima de algo que capture punteros, y de paso saca el
      // `:hover` y el `:active` reales de la página en los navegadores que
      // hacen la prueba de impacto contra el elemento que captura.
      try {
        layer.setPointerCapture(armed.id);
      } catch {
        // Si el dedo ya se levantó, da igual: el apagado viene detrás.
      }

      window.getSelection()?.removeAllRanges();
      if (typeof navigator.vibrate === "function") navigator.vibrate(VIBRATION_MS);

      cx = clamp(fx, 2, window.innerWidth - 2);
      cy = clamp(fy - CURSOR_LIFT_PX, 2, window.innerHeight - 2);
      draw();
      layer.dataset.on = "true";

      const el = document.elementFromPoint(cx, cy);
      retarget(el);
      if (el) {
        emit("pointermove", el, null, true);
        emit("mousemove", el, null, true);
      }

      last = performance.now();
      raf = requestAnimationFrame(frame);
      window.dispatchEvent(new Event(CURSOR_MODE_EVENT));
    }

    function deactivate(withClick: boolean) {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
      armed = null;
      if (!active) return;

      active = false;
      endedAt = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      root.removeAttribute(CURSOR_MODE_ATTR);
      delete layer.dataset.on;

      const target = hot.length > 0 ? hot[0] : null;
      // LA GUARDA DEL CLIC. Si la página se movió hace menos de 150 ms, esto
      // era un recorrido y no una elección.
      const quiet = endedAt - lastScrollAt > CLICK_SCROLL_GRACE_MS;

      // EL CLIC VA AQUÍ, SÍNCRONO dentro del manejador de `pointerup`, y no en
      // un `setTimeout`: la activación de usuario del navegador solo está viva
      // durante el gesto, y sin ella un `<a target="_blank">` —el botón de
      // WhatsApp, el CTA de cada tarjeta— lo bloquearía el antipopups.
      if (withClick && target && quiet) tap(target);

      // Antes de avisar del cambio de modo: `<CardField />` deja de escuchar en
      // cuanto se entera, y es el `pointerout` el que devuelve la tarjeta a
      // plano.
      retarget(null);
      window.dispatchEvent(new Event(CURSOR_MODE_EVENT));
    }

    /* --- Entrada --------------------------------------------------------- */

    function onDown(event: PointerEvent) {
      if (!event.isTrusted) return;

      // Segundo dedo: el cursor se retira y devuelve el gesto al navegador
      // (pellizco para ampliar).
      if (!event.isPrimary) {
        deactivate(false);
        return;
      }
      if (active || armed) return;
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;

      const target = event.target;
      if (!(target instanceof Element) || target.closest(FORBIDDEN)) return;

      fx = event.clientX;
      fy = event.clientY;
      armed = {
        id: event.pointerId,
        type: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        target,
      };
      timer = window.setTimeout(activate, HOLD_MS);
    }

    function onMove(event: PointerEvent) {
      if (!event.isTrusted) return;

      if (active) {
        fx = event.clientX;
        fy = event.clientY;
        return;
      }

      if (!armed || event.pointerId !== armed.id) return;

      // Se ha movido: esto era un desliz. Se cancela la espera y el navegador
      // desplaza la página como lo ha hecho siempre.
      if (Math.hypot(event.clientX - armed.x, event.clientY - armed.y) > MOVE_TOLERANCE_PX) {
        deactivate(false);
        return;
      }

      fx = event.clientX;
      fy = event.clientY;
    }

    function onUp(event: PointerEvent) {
      if (!event.isTrusted) return;
      deactivate(true);
    }

    function onCancel(event: PointerEvent) {
      if (!event.isTrusted) return;
      deactivate(false);
    }

    /** Un solo guardián para todo lo que el dedo real no debe propagar. */
    function seal(event: Event) {
      if (!event.isTrusted) return;

      if (!active) {
        const late = performance.now() - endedAt < CLICK_BLOCK_MS;
        // Fuera del gesto solo se descartan los que llegan tarde; un toque
        // corto nuevo tiene que funcionar como siempre.
        if (!late || !LATE.has(event.type)) return;
      }

      if (CANCELLED.has(event.type) && event.cancelable) event.preventDefault();
      event.stopPropagation();
    }

    // TODO EN FASE DE CAPTURA SOBRE `window`: es el primer sitio por el que
    // pasa un evento, así que detenerlo aquí lo saca de la página entera —y
    // también los que no burbujean, que igualmente recorren la fase de captura
    // hasta su destino—. Los manejadores de este componente viven en el MISMO
    // nodo, y `stopPropagation` no afecta a los oyentes del nodo en curso: se
    // siguen ejecutando pase lo que pase con el orden de registro.
    const options = { capture: true, passive: false } as const;

    window.addEventListener("pointerdown", onDown, options);
    window.addEventListener("pointermove", onMove, options);
    window.addEventListener("pointerup", onUp, options);
    window.addEventListener("pointercancel", onCancel, options);
    for (const type of SEALED) window.addEventListener(type, seal, options);

    const giveUp = () => deactivate(false);
    window.addEventListener("blur", giveUp);
    document.addEventListener("visibilitychange", giveUp);

    return () => {
      window.removeEventListener("pointerdown", onDown, options);
      window.removeEventListener("pointermove", onMove, options);
      window.removeEventListener("pointerup", onUp, options);
      window.removeEventListener("pointercancel", onCancel, options);
      for (const type of SEALED) window.removeEventListener(type, seal, options);
      window.removeEventListener("blur", giveUp);
      document.removeEventListener("visibilitychange", giveUp);

      if (timer) clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      for (const el of hot) el.classList.remove(HOT_CLASS);
      root.removeAttribute(CURSOR_MODE_ATTR);
    };
  }, [coarse]);

  if (!coarse) return null;

  return (
    <>
      {/*
        Capa del cursor. `pointer-events: none` no es decorativo: la propiedad
        se hereda, así que ni este SVG ni nada de dentro aparece en
        `elementFromPoint`, que es con lo que el bucle averigua qué hay bajo la
        punta. Sin eso el cursor se señalaría a sí mismo.

        `z-[45]`: por encima del botón flotante de WhatsApp (`z-40`) y por
        debajo de la puerta +18 (`z-50`), que debe taparlo todo.
      */}
      <svg
        ref={layerRef}
        aria-hidden="true"
        focusable="false"
        width="100%"
        height="100%"
        className="vp-cursor-layer pointer-events-none fixed inset-0 z-[45]"
      >
        {/* Correa dedo -> punta. Es lo que explica el gesto sin un cartel:
            deja ver que el cursor es el propio dedo, desplazado. */}
        <line
          ref={leashRef}
          stroke="var(--color-action)"
          strokeWidth="1"
          strokeDasharray="3 5"
          opacity="0.4"
        />
        {/* Anillo en el punto de contacto real. */}
        <circle
          ref={ringRef}
          r="14"
          fill="none"
          stroke="var(--color-action)"
          strokeWidth="2"
          opacity="0.35"
        />
        {/* La flecha. La punta está en el origen del grupo, de modo que
            `translate(cx cy)` la deja exactamente sobre el punto que señala.
            Relleno lima —el color de acción del sistema— con contorno negro,
            que es lo que la mantiene visible tanto sobre el fondo casi negro
            como sobre la foto de un producto. */}
        <g ref={arrowRef}>
          <path
            d="M0 0 L0 22 L5.5 17 L9 25.5 L13.5 23.5 L10 15 L17.5 15 Z"
            fill="var(--color-action)"
            stroke="var(--color-vp-black)"
            strokeWidth="1.5"
            strokeLinejoin="miter"
          />
        </g>
      </svg>

      {/*
        Rótulo de la esquina. El gesto no se descubre solo, y es el único sitio
        donde se cuenta.

        Traslúcido por decisión de diseño: tiene que convivir con el catálogo
        sin competir con él. Eso lo deja por debajo del contraste que el sistema
        exige al texto, y por eso va `aria-hidden`: es una pista de puntero, y
        quien navega con lector de pantalla usa sus propios gestos, donde este
        no tiene sentido. Nada de lo que dice hace falta para usar la tienda.

        Esquina IZQUIERDA: la derecha es del botón de WhatsApp. Los márgenes
        suman `env(safe-area-inset-*)` por el mismo motivo que allí.
      */}
      <p
        aria-hidden="true"
        className="vp-cursor-hint pointer-events-none fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-[calc(1.25rem+env(safe-area-inset-left))] z-30 max-w-[9.5rem] font-display text-[0.6875rem] font-semibold uppercase leading-tight tracking-[0.08em] text-foreground/40"
      >
        Mantén presionado para cambiar tu experiencia de navegación
      </p>
    </>
  );
}
