"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LOGO_FILL_PATHS,
  LOGO_FILL_TRANSFORM,
  LOGO_PATHS,
  LOGO_VIEWBOX,
} from "@/components/boot/logo-paths";
import { bootFrame, reducedFrame } from "@/lib/boot-timeline";
import { lockScroll } from "@/lib/use-scroll-lock";

/**
 * Pantalla de arranque: el logo VU se dibuja, se rellena y da paso a la web.
 *
 * Sale en CADA carga o recarga de la web pública y nunca en una navegación
 * interna: vive en el layout raíz, que no se vuelve a montar al cambiar de
 * página. En `/admin` no aparece (mismo criterio que `SmoothScroll`).
 *
 * LA PINTA EL SERVIDOR. Así tapa la página desde el primer fotograma y, sobre
 * todo, durante la hidratación: es lo que quita el parpadeo de la puerta +18,
 * que el servidor pinta cerrada por seguridad y que un visitante ya verificado
 * alcanzaba a ver un instante. Cuando el arranque se retira, la hidratación ya
 * ha resuelto si la puerta toca o no.
 *
 * Los contornos usan `pathLength="1"` en vez de medir `getTotalLength()`: el
 * guion se expresa en fracción del trazado, así que el servidor ya los pinta
 * ocultos (sin JS no hay medidas) y el resultado es el mismo.
 *
 * La línea de tiempo (4 s, una sola pasada) está en `lib/boot-timeline.ts`.
 * Cada fotograma escribe directamente en el DOM, sin `setState`: solo hay un
 * render más, el que la desmonta.
 */
export function BootScreen() {
  const onConsole = usePathname().startsWith("/admin");
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<SVGGElement>(null);
  const fillRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (onConsole) return;
    const root = rootRef.current;
    const strokesGroup = strokesRef.current;
    const fill = fillRef.current;
    if (!root || !strokesGroup || !fill) return;

    const strokes = Array.from(strokesGroup.querySelectorAll("path"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const releaseScroll = lockScroll();

    // RELOJ ACTIVO: solo cuenta mientras la pestaña está a la vista. Si el
    // visitante cambia de pestaña a mitad del dibujo, al volver continúa donde
    // iba en vez de saltar al final.
    let elapsed = 0;
    let last = 0;
    let frame = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      releaseScroll();
      setVisible(false);
    };

    const paint = () => {
      if (reduced) {
        const { screen, done } = reducedFrame(elapsed);
        root.style.opacity = String(screen);
        return done;
      }

      const { draw, fill: fillOpacity, screen, done } = bootFrame(elapsed, strokes.length);
      strokes.forEach((path, index) => {
        path.style.strokeDashoffset = String(1 - draw[index]);
        // Con el guion a longitud cero, el extremo redondeado pintaría un
        // punto en el inicio de cada pieza antes de que empiece a dibujarse.
        path.style.opacity = draw[index] > 0 ? "1" : "0";
      });
      strokesGroup.style.opacity = String(1 - fillOpacity);
      fill.style.opacity = String(fillOpacity);
      root.style.opacity = String(screen);
      return done;
    };

    const tick = (now: number) => {
      if (last) elapsed += now - last;
      last = now;
      if (paint()) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame && !finished) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      releaseScroll();
    };
  }, [onConsole]);

  if (onConsole || !visible) return null;

  return (
    <div
      ref={rootRef}
      className="vp-boot fixed inset-0 z-[60] flex items-center justify-center bg-background"
      role="status"
      aria-live="polite"
      aria-label="Cargando Vapeupar"
    >
      {/* Sin JS no hay quien la retire: se oculta para no dejar la web tapada. */}
      <noscript>
        <style>{".vp-boot{display:none!important}"}</style>
      </noscript>

      <svg className="vp-boot__logo" viewBox={LOGO_VIEWBOX} aria-hidden="true" focusable="false">
        <g
          ref={strokesRef}
          className="vp-boot__strokes"
          fill="none"
          stroke="var(--color-vp-white)"
          strokeWidth={0.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {LOGO_PATHS.map((d) => (
            <path key={d} d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1} />
          ))}
        </g>
        <g
          ref={fillRef}
          className="vp-boot__fill"
          fill="var(--color-vp-white)"
          opacity={0}
          transform={LOGO_FILL_TRANSFORM}
        >
          {LOGO_FILL_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
    </div>
  );
}
