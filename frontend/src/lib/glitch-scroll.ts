/**
 * Las ráfagas del glitch de página (`components/page-glitch.tsx`) no salen
 * mientras la página se desplaza: en mitad de un scroll, la separación RGB se
 * leía como un fallo de la pantalla y no como un efecto.
 *
 * - Si toca empezar (o armar el filtro, `armLead` antes) y la página se movió
 *   hace menos de `SCROLL_QUIET_MS`, la ráfaga se aplaza hasta ese silencio.
 *   El margen cubre también la cola de frenado de Lenis, que sigue emitiendo
 *   `scroll` casi un segundo después del último golpe de rueda.
 * - Si el scroll empieza con una ráfaga en curso, se corta y se programa la
 *   siguiente con su espera normal.
 */
export const SCROLL_QUIET_MS = 700;

export interface BurstState {
  /** Cuándo empieza la siguiente ráfaga (reloj de `performance.now()`). */
  burstAt: number;
  /** Inicio de la ráfaga en curso, o -1 si no hay ninguna. */
  burstStart: number;
}

export function holdForScroll(
  state: BurstState,
  now: number,
  lastScrollAt: number,
  armLead: number,
  nextDelay: () => number,
): BurstState {
  const quietAt = lastScrollAt + SCROLL_QUIET_MS;
  if (now >= quietAt) return state;

  if (state.burstStart >= 0) {
    // Una ráfaga que ya iba por delante del último scroll se corta.
    return state.burstStart <= lastScrollAt
      ? { burstStart: -1, burstAt: now + nextDelay() }
      : state;
  }

  if (now >= state.burstAt - armLead) {
    return { burstStart: -1, burstAt: quietAt + armLead };
  }

  return state;
}
