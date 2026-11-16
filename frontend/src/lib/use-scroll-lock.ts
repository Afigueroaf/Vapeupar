"use client";

import { useEffect } from "react";

/**
 * Bloquea el desplazamiento de la página mientras `active` sea verdadero.
 *
 * Es la misma técnica que la puerta +18 (`age-verification-modal.tsx`, donde
 * está explicada): fijar el `body` y compensar con `top` negativo, porque en
 * iOS Safari el `overflow: hidden` del `body` no detiene nada. Al soltar se
 * devuelve la posición con `window.scrollTo`.
 *
 * Con el `body` fijo, Lenis ve un límite de desplazamiento de cero y deja de
 * mover la página por su cuenta (`smooth-scroll.tsx`). Lo que SÍ hay que hacer
 * en el panel que se desplace por dentro es marcarlo con `data-lenis-prevent`,
 * o Lenis se queda la rueda del ratón.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    };

    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    style.overflow = "hidden";

    return () => {
      Object.assign(style, previous);
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
