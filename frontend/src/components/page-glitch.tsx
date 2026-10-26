"use client";

import { useEffect, useRef, useState } from "react";

const FILTER_ID = "vp-rgb-glitch";

/** Separación máxima de los canales R/B, en px. `globals.css` divide por este mismo valor. */
const MAX_SHIFT = 14;
const INTRO_DECAY_MS = 2800;
const BURST_DURATION_MS = 420;
const BURST_PEAK = 0.55;
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
    let lastShift = -1;

    const apply = (intensity: number) => {
      const shift = intensity * MAX_SHIFT;
      // En reposo no se toca el DOM: sin invalidación de estilos ni repintado.
      if (shift < 0.05 && lastShift < 0.05) return;
      lastShift = shift;

      // Los canales no se separan de forma simétrica: el azul lleva jitter propio.
      redRef.current?.setAttribute("dx", (-shift).toFixed(2));
      blueRef.current?.setAttribute("dx", (shift * (0.7 + Math.random() * 0.6)).toFixed(2));
      root.style.setProperty("--glitch-shift", shift.toFixed(2));
      root.classList.toggle("glitch-active", shift >= 0.05);
    };

    const tick = (now: number) => {
      if (!start) {
        start = now;
        burstAt = now + INTRO_DECAY_MS + nextBurstDelay();
      }

      const sinceStart = now - start;
      let intensity = 0;

      if (sinceStart < INTRO_DECAY_MS) {
        intensity = (1 - sinceStart / INTRO_DECAY_MS) ** 3;
      }

      if (burstStart < 0 && now >= burstAt) burstStart = now;
      if (burstStart >= 0) {
        const t = (now - burstStart) / BURST_DURATION_MS;
        if (t >= 1) {
          burstStart = -1;
          burstAt = now + nextBurstDelay();
        } else {
          // Ataque rápido, caída larga.
          const envelope = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
          intensity = Math.max(intensity, envelope * BURST_PEAK);
        }
      }

      apply(intensity);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      root.classList.remove("glitch-active");
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
