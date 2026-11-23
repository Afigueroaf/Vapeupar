/**
 * Línea de tiempo de la pantalla de arranque (`components/boot/boot-screen.tsx`).
 *
 * Es lógica pura —tiempo transcurrido dentro, opacidades y progresos fuera—
 * para poder probarla sin navegador. El componente solo la pinta.
 *
 * Una sola pasada de 4 s (aprobado por el dueño, ver
 * `docs/superpowers/specs/2026-11-23-arranque-y-transiciones-design.md`):
 *
 *   0 ──── 2600   dibujo de contornos (2200 ms cada uno, escalonados 0–400 ms)
 *   2700 ── 3300  fundido contornos → relleno
 *   3300 ── 3500  sostén del logo completo
 *   3500 ── 4000  la pantalla entera se desvanece
 */

const DRAW_MS = 2200;
const STAGGER_MS = 400;
const FILL_START_MS = 2700;
const FILL_MS = 600;
const FADE_START_MS = 3500;

export const BOOT_TOTAL_MS = 4000;

/** Movimiento reducido: logo relleno quieto y un fundido corto. */
const REDUCED_HOLD_MS = 600;
export const BOOT_REDUCED_TOTAL_MS = 1000;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Curva coseno: arranque y llegada suaves, sin rebote. */
export function ease(value: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp01(value));
}

/** Retraso del contorno `index` de `count`, repartido linealmente en 0–400 ms. */
export function drawDelay(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * STAGGER_MS;
}

export interface BootFrame {
  /** Progreso de dibujo de cada contorno, ya con curva (0 = nada, 1 = entero). */
  draw: number[];
  /** Opacidad del logo relleno; la de los contornos es `1 - fill`. */
  fill: number;
  /** Opacidad de la pantalla completa. */
  screen: number;
  done: boolean;
}

export function bootFrame(elapsed: number, count: number): BootFrame {
  const draw = Array.from({ length: count }, (_, index) =>
    ease((elapsed - drawDelay(index, count)) / DRAW_MS),
  );

  return {
    draw,
    fill: ease((elapsed - FILL_START_MS) / FILL_MS),
    screen: 1 - ease((elapsed - FADE_START_MS) / (BOOT_TOTAL_MS - FADE_START_MS)),
    done: elapsed >= BOOT_TOTAL_MS,
  };
}

export function reducedFrame(elapsed: number): Pick<BootFrame, "screen" | "done"> {
  return {
    screen: 1 - ease((elapsed - REDUCED_HOLD_MS) / (BOOT_REDUCED_TOTAL_MS - REDUCED_HOLD_MS)),
    done: elapsed >= BOOT_REDUCED_TOTAL_MS,
  };
}
