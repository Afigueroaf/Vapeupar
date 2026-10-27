"use client";

import { useEffect, useRef, useState } from "react";

const FILTER_ID = "vp-rgb-glitch";

/** Separación máxima de los canales R/B, en px. `globals.css` divide por este mismo valor. */
const MAX_SHIFT = 14;
const INTRO_DECAY_MS = 2800;
const BURST_DURATION_MS = 420;
const BURST_PEAK = 0.42;
const BURST_INTERVAL_MIN_MS = 5000;
const BURST_INTERVAL_MAX_MS = 9000;

function nextBurstDelay() {
  return BURST_INTERVAL_MIN_MS + Math.random() * (BURST_INTERVAL_MAX_MS - BURST_INTERVAL_MIN_MS);
}

/**
 * Glitch RGB a nivel de página.
 *
 * Singleton: se monta una sola vez en el layout raíz. Publica el filtro SVG que
 * `.vp-glitch` consume desde CSS y escribe `--glitch-shift` + `html.glitch-active`
 * en cada frame.
 *
 * Bajo `prefers-reduced-motion: reduce` no monta nada, así que la clase nunca se
 * activa y el filtro nunca llega a aplicarse (`docs/design-reset-inventory.md` §8.5).
 */
export function PageGlitch() {
  const [enabled, setEnabled] = useState(false);
  const redRef = useRef<SVGFEOffsetElement>(null);
  const blueRef = useRef<SVGFEOffsetElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const root = document.documentElement;
    let frame = 0;
    let start = 0;
    let burstAt = 0;
    let burstStart = -1;

    // Habilita el filtro en CSS. Mientras el componente esté montado el filtro
    // permanece aplicado: con dx=0 es visualmente neutro, y mantenerlo estable
    // evita que Chromium rehaga el contexto de filtrado en cada burst.
    root.classList.add("glitch-ready");

    const apply = (intensity: number, now: number) => {
      // Jitter horizontal tipo scanline en intensidades altas.
      const lineNoise =
        intensity > 0.25 ? Math.max(0, Math.sin(now * 0.001 * 23 + 1.7)) * intensity * 3 : 0;
      const shift = Math.round(intensity * MAX_SHIFT + lineNoise);

      redRef.current?.setAttribute("dx", String(-shift));
      blueRef.current?.setAttribute("dx", String(shift));
      root.style.setProperty("--glitch-shift", String(shift));
      root.classList.toggle("glitch-active", intensity > 0.04);
    };

    const tick = (now: number) => {
      if (!start) {
        start = now;
        burstAt = now + INTRO_DECAY_MS + nextBurstDelay();
      }

      const sinceStart = now - start;
      let intensity = 0;

      if (sinceStart < INTRO_DECAY_MS) {
        // Caída de potencia: desplome inicial rápido y cola lenta.
        intensity = (1 - sinceStart / INTRO_DECAY_MS) ** 2.4;
      }

      if (burstStart < 0 && now >= burstAt) burstStart = now;
      if (burstStart >= 0) {
        const t = (now - burstStart) / BURST_DURATION_MS;
        if (t >= 1) {
          burstStart = -1;
          burstAt = now + nextBurstDelay();
        } else {
          // Campana: sube y baja de forma simétrica.
          intensity = Math.max(intensity, BURST_PEAK * Math.sin(t * Math.PI));
        }
      }

      apply(intensity, now);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      root.classList.remove("glitch-ready", "glitch-active");
      root.style.removeProperty("--glitch-shift");
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <svg aria-hidden="true" focusable="false" className="absolute size-0">
        <defs>
          {/*
            Separa el SourceGraphic en R / G / B, desplaza rojo y azul en sentidos
            opuestos y los recompone con `screen`. Con dx=0 el resultado es idéntico
            al original, así que el filtro es visualmente neutro en reposo.
            `sRGB` es obligatorio: en linearRGB los colores de marca se lavan.
          */}
          <filter
            id={FILTER_ID}
            x="-5%"
            y="-5%"
            width="110%"
            height="110%"
            colorInterpolationFilters="sRGB"
          >
            <feOffset ref={redRef} in="SourceGraphic" dx="0" dy="0" result="redShifted" />
            <feColorMatrix
              in="redShifted"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="red"
            />

            <feOffset ref={blueRef} in="SourceGraphic" dx="0" dy="0" result="blueShifted" />
            <feColorMatrix
              in="blueShifted"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="blue"
            />

            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="green"
            />

            <feBlend in="red" in2="green" mode="screen" result="redGreen" />
            <feBlend in="redGreen" in2="blue" mode="screen" />
          </filter>
        </defs>
      </svg>

      <div aria-hidden="true" className="vp-glitch-scanlines" />
    </>
  );
}
