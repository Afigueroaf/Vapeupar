"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Condiciones para seguir el cursor:
 *
 * - `hover: hover` + `pointer: fine` → en táctil el `:hover` se queda pegado
 *   después del toque, así que el seguimiento no se activa.
 * - `prefers-reduced-motion: no-preference` → un degradado que persigue el
 *   puntero es movimiento. Sin seguimiento, el brillo sigue existiendo pero
 *   centrado (`--vp-mx/--vp-my` caen a su valor por defecto del 50 %).
 */
const POINTER_QUERY =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

interface CardFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Cambia este valor cuando cambia el conjunto de tarjetas (filtros, orden,
   * búsqueda) para forzar una nueva medición del campo.
   */
  watch?: unknown;
}

/**
 * Campo de tarjetas reactivas del sistema VP.
 *
 * Contenedor de un grupo de `.vp-card` que comparten **una sola imagen de
 * fondo continua**: cada tarjeta pinta solo la porción que le toca, así que el
 * conjunto se lee como una superficie única con ventanas recortadas, no como N
 * tarjetas con N fondos. El efecto original hace esto con
 * `background-attachment: fixed` (anclaje al viewport); aquí el anclaje es al
 * contenedor, por tres razones:
 *
 * 1. `.vp-glitch` aplica `filter` a toda la página (`page.tsx`), y un filtro
 *    rasteriza su subárbol: dentro de él un fondo anclado al viewport deja de
 *    estarlo.
 * 2. iOS Safari ignora `background-attachment: fixed` y Android lo degrada.
 * 3. N fondos anclados al viewport se repintan en cada frame de scroll.
 *
 * El coste de anclar al contenedor es una medición por cambio de tamaño: se
 * escriben `--vp-fw/--vp-fh` (tamaño del campo) en el contenedor y
 * `--vp-fx/--vp-fy` (desplazamiento dentro del campo) en cada tarjeta. El
 * dibujo lo hace `globals.css`; aquí solo se publican las medidas.
 */
export function CardField({ watch, className, children, ...props }: CardFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [trackPointer, setTrackPointer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(POINTER_QUERY);
    const sync = () => setTrackPointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Medición del campo.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const base = root.getBoundingClientRect();
      root.style.setProperty("--vp-fw", `${Math.round(base.width)}px`);
      root.style.setProperty("--vp-fh", `${Math.round(base.height)}px`);

      root.querySelectorAll<HTMLElement>(".vp-card").forEach((card) => {
        const box = card.getBoundingClientRect();
        card.style.setProperty("--vp-fx", `${Math.round(box.left - base.left)}px`);
        card.style.setProperty("--vp-fy", `${Math.round(box.top - base.top)}px`);
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    schedule();

    // Observar el contenedor cubre el cambio de breakpoint, el zoom y el
    // reflujo del grid (cambiar de 3 a 2 columnas cambia su altura). Las
    // alturas internas de las tarjetas también mueven la altura del contenedor.
    const observer = new ResizeObserver(schedule);
    observer.observe(root);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [watch]);

  // Brillo que sigue al puntero. Un único listener delegado para todo el campo.
  useEffect(() => {
    const root = ref.current;
    if (!root || !trackPointer) return;

    let frame = 0;
    let pending: { card: HTMLElement; x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const { card, x, y } = pending;
      pending = null;

      const box = card.getBoundingClientRect();
      card.style.setProperty("--vp-mx", `${((x - box.left) / box.width) * 100}%`);
      card.style.setProperty("--vp-my", `${((y - box.top) / box.height) * 100}%`);
    };

    const onPointerMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(".vp-card");
      if (!card) return;

      // Se guarda la última posición y se escribe una sola vez por frame: el
      // puntero emite muchos más eventos que frames pinta el navegador.
      pending = { card, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    root.addEventListener("pointermove", onPointerMove);

    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [trackPointer]);

  return (
    <div ref={ref} className={cn("vp-field", className)} {...props}>
      {children}
    </div>
  );
}
