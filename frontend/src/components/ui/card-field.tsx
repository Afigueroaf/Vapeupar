"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isCursorMode, subscribeCursorMode } from "@/lib/touch-cursor";
import { cn } from "@/lib/utils";

/**
 * Condiciones para seguir el cursor:
 *
 * - `hover: hover` + `pointer: fine` → en táctil el `:hover` se queda pegado
 *   después del toque, así que el seguimiento no se activa... salvo que haya
 *   un cursor virtual encendido, que es un puntero de posición conocida y con
 *   salida (ver más abajo).
 * - `prefers-reduced-motion: no-preference` → un degradado que persigue el
 *   puntero es movimiento. Sin seguimiento, el brillo sigue existiendo pero
 *   centrado (`--vp-mx/--vp-my` caen a su valor por defecto del 50 %).
 */
const POINTER_QUERY = "(hover: hover) and (pointer: fine)";
const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

interface CardFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Cambia este valor cuando cambia el conjunto de tarjetas (filtros, orden,
   * búsqueda) o cuando se mueven sin cambiar de tamaño —el cajón de
   * `trust-stage.tsx` lo cambia en cada fotograma de su recorrido— para forzar
   * una nueva medición del campo. Es barato: tres rectos y seis variables.
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
 * 1. El glitch RGB aplica `filter` a los bloques de la página —y una de las
 *    piezas filtradas es la tarjeta misma (`.vp-glitch-card`)—, y un filtro
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

  /**
   * EL CURSOR TÁCTIL CUENTA COMO PUNTERO. En un teléfono el seguimiento
   * también se enciende mientras está en uso: despacha `pointermove` sobre el
   * elemento que hay bajo su punta, que es justo lo que escucha el efecto de
   * más abajo, y emite el `pointerout` que devuelve la tarjeta a plano. La
   * preferencia de movimiento reducido sigue mandando por encima de todo.
   */
  useEffect(() => {
    const pointer = window.matchMedia(POINTER_QUERY);
    const motion = window.matchMedia(MOTION_QUERY);

    const sync = () => setTrackPointer(motion.matches && (pointer.matches || isCursorMode()));

    sync();
    pointer.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    const unsubscribe = subscribeCursorMode(sync);

    return () => {
      pointer.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
      unsubscribe();
    };
  }, []);

  // Medición del campo. Una sola por fotograma, aunque la pidan varios.
  const frame = useRef(0);

  const schedule = useCallback(() => {
    if (frame.current) return;

    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const root = ref.current;
      if (!root) return;

      const base = root.getBoundingClientRect();
      root.style.setProperty("--vp-fw", `${Math.round(base.width)}px`);
      root.style.setProperty("--vp-fh", `${Math.round(base.height)}px`);

      root.querySelectorAll<HTMLElement>(".vp-card").forEach((card) => {
        const box = card.getBoundingClientRect();
        card.style.setProperty("--vp-fx", `${Math.round(box.left - base.left)}px`);
        card.style.setProperty("--vp-fy", `${Math.round(box.top - base.top)}px`);
      });
    });
  }, []);

  // El observador se monta UNA VEZ, y la medición que pide `watch` va en su
  // propio efecto. Antes los dos compartían efecto y cada cambio de `watch`
  // reconstruía el observador: con el catálogo eso pasaba una vez por filtro,
  // pero el cajón de la banda de confianza pide medir en cada fotograma de su
  // recorrido, y ahí tirar y rehacer un ResizeObserver sesenta veces por
  // segundo para volver a medir tres tarjetas no tiene ningún sentido.
  //
  // Observar el contenedor cubre el cambio de breakpoint, el zoom y el reflujo
  // del grid (cambiar de 3 a 2 columnas cambia su altura). Las alturas internas
  // de las tarjetas también mueven la altura del contenedor. Y `observe()` ya
  // dispara una primera vez al conectarse, así que no hace falta medir a mano
  // al montar.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const observer = new ResizeObserver(schedule);
    observer.observe(root);

    return () => {
      observer.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [schedule]);

  useEffect(schedule, [schedule, watch]);

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
      const fx = (x - box.left) / box.width;
      const fy = (y - box.top) / box.height;

      card.style.setProperty("--vp-mx", `${fx * 100}%`);
      card.style.setProperty("--vp-my", `${fy * 100}%`);

      // Mismo gesto, segunda lectura: de -1 a 1 con el centro en 0. De aquí
      // salen la inclinación 3D y el desplazamiento de la lámina
      // (`globals.css`). Se calculan en el mismo `flush` para no medir la
      // tarjeta dos veces por frame.
      card.style.setProperty("--vp-rx", (fx * 2 - 1).toFixed(3));
      card.style.setProperty("--vp-ry", (fy * 2 - 1).toFixed(3));
    };

    const onPointerMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(".vp-card");
      if (!card) return;

      // Se guarda la última posición y se escribe una sola vez por frame: el
      // puntero emite muchos más eventos que frames pinta el navegador.
      pending = { card, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    // Al salir, la tarjeta vuelve a plano. Sin esto se quedaría congelada en
    // la última inclinación, como si el puntero siguiera encima.
    const onPointerOut = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>(".vp-card");
      if (!card) return;

      // `pointerout` también salta al pasar de un hijo a otro dentro de la
      // misma tarjeta; eso no es salir.
      const next = event.relatedTarget;
      if (next instanceof Node && card.contains(next)) return;

      card.style.removeProperty("--vp-rx");
      card.style.removeProperty("--vp-ry");
    };

    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerout", onPointerOut);

    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerout", onPointerOut);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [trackPointer]);

  return (
    <div ref={ref} className={cn("vp-field", className)} {...props}>
      {children}
    </div>
  );
}
