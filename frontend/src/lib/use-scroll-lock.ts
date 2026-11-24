"use client";

import { useEffect } from "react";

/**
 * Bloqueo del desplazamiento de la página, compartido por todas las capas que
 * lo necesitan: pantalla de arranque, puerta +18 y carrito.
 *
 * POR QUÉ NO `document.body.style.overflow = "hidden"`: en iOS Safari el
 * elemento que desplaza la página es `documentElement`, y el navegador ignora
 * el `overflow` del `body`. El resultado era una puerta que en móvil no
 * bloqueaba la navegación: el catálogo seguía desplazándose por detrás. El
 * bloqueo que sí funciona en los dos sistemas es fijar el `body` y compensar
 * el desplazamiento actual con `top` negativo; al soltar se devuelve la
 * posición con `window.scrollTo`, o el visitante aparece de vuelta en el
 * principio de la página.
 *
 * POR QUÉ UN CONTADOR: cada capa guardaba los estilos «previos» al bloquear y
 * los restauraba al soltar. Con dos capas a la vez —el arranque y la puerta,
 * que se montan juntas— la segunda guardaba como «previos» los del primer
 * bloqueo, y la primera en soltar devolvía el `body` a su estado original con
 * la otra todavía abierta: puerta +18 visible y la página desplazándose
 * detrás. Ahora el primer bloqueo guarda y el último restaura.
 *
 * Con el `body` fijo, Lenis ve un límite de desplazamiento de cero y deja de
 * mover la página por su cuenta (`smooth-scroll.tsx`). Lo que SÍ hay que hacer
 * en el panel que se desplace por dentro es marcarlo con `data-lenis-prevent`,
 * o Lenis se queda la rueda del ratón.
 */
let holders = 0;
let saved: { scrollY: number; style: Record<string, string> } | null = null;

const KEYS = ["position", "top", "left", "right", "width", "overflow"] as const;

/** Bloquea el desplazamiento. Devuelve la liberación, que es idempotente. */
export function lockScroll(): () => void {
  const { style } = document.body;

  if (holders === 0) {
    const scrollY = window.scrollY;
    saved = { scrollY, style: Object.fromEntries(KEYS.map((key) => [key, style[key]])) };

    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    style.overflow = "hidden";
  }
  holders += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders > 0 || !saved) return;

    Object.assign(style, saved.style);
    window.scrollTo(0, saved.scrollY);
    saved = null;
  };
}

/** Bloquea el desplazamiento mientras `active` sea verdadero. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return lockScroll();
  }, [active]);
}
