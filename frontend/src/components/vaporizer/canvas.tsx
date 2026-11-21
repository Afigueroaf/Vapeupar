"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { getConsoleFunction, setConsoleFunction } from "three";
import { Scene, type PointerState, type SceneAnchor, type SceneConfig } from "./scene";
import { usePointCloud } from "./use-point-cloud";

/**
 * Envoltorio del lienzo WebGL.
 *
 * Está en su propio archivo porque el componente público lo carga con
 * `next/dynamic({ ssr: false })`: así three.js y el reconciliador de R3F —unos
 * cuantos cientos de kB— no entran ni en el render del servidor ni en el
 * paquete inicial del cliente, y la portada sigue pintando su HTML sin esperar
 * a nada de esto.
 */

/**
 * AVISO DE `THREE.Clock` SILENCIADO. three 0.187 declara obsoleto `Clock` en
 * favor de `Timer`, pero quien lo crea es `@react-three/fiber` (9.8.2, su
 * última versión estable: `clock: new THREE.Clock()` en su store), no este
 * código. No hay nada que cambiar de nuestro lado hasta que R3F lo sustituya, y
 * el aviso solo ensuciaba la consola en cada carga de la portada.
 *
 * Se usa el gancho oficial de three (`setConsoleFunction`), que solo ve los
 * mensajes de three, y se filtra ÚNICAMENTE ese aviso: cualquier otro sigue
 * llegando a la consola como siempre. Se instala al cargar este módulo, antes
 * de que `<Canvas>` cree el store. Quitarlo cuando R3F use `Timer`.
 */
const CLOCK_DEPRECATION = "THREE.Clock: This module has been deprecated";
if (!getConsoleFunction()) {
  setConsoleFunction((type, message, ...params) => {
    if (type === "warn" && typeof message === "string" && message.startsWith(CLOCK_DEPRECATION)) return;
    (console[type as "log" | "warn" | "error"] ?? console.log)(message, ...params);
  });
}

export interface VaporizerCanvasProps extends SceneConfig {
  modelPath: string | null;
  particleCount: number;
  ambientCount: number;
  dpr: [number, number];
  /** `false` cuando la pieza no está en pantalla: el bucle se detiene. */
  active: boolean;
  pointer: React.RefObject<PointerState>;
  anchor: SceneAnchor | null;
  /**
   * Los primeros segundos de animación fueron lentos (ver `FrameBudget`). Se
   * llama como mucho una vez por montaje.
   */
  onSlowStart?: () => void;
}

/** Segundos que se descartan al empezar: compilación de shaders y subida de búferes. */
const WARMUP_SECONDS = 0.5;
/** Ventana de medida tras el calentamiento. */
const MEASURE_SECONDS = 2;
/** Fotograma medio por encima del cual se baja la resolución (~45 fps). */
const SLOW_FRAME_SECONDS = 0.022;
/** Un salto mayor es una pausa (pestaña oculta, bucle detenido), no lentitud. */
const MAX_SAMPLE_SECONDS = 0.25;

/**
 * Degradación adaptativa, fase 2 de `docs/performance-optimization-plan.md`.
 *
 * Mide el fotograma medio durante los primeros 2 s de animación de verdad y,
 * si pasa de ~22 ms, avisa UNA vez para que el lienzo baje un escalón de
 * resolución. Después no hace nada más: no vuelve a subir ni a medir, para no
 * oscilar. El medio segundo inicial no cuenta porque ahí se compilan los
 * shaders y cualquier aparato parece lento.
 */
function FrameBudget({ onSlow }: { onSlow: () => void }) {
  const state = useRef({ elapsed: 0, measured: 0, frames: 0, done: false });

  useFrame((_, delta) => {
    const s = state.current;
    if (s.done || delta > MAX_SAMPLE_SECONDS) return;
    s.elapsed += delta;
    if (s.elapsed < WARMUP_SECONDS) return;
    s.measured += delta;
    s.frames += 1;
    if (s.measured < MEASURE_SECONDS) return;
    s.done = true;
    if (s.measured / s.frames > SLOW_FRAME_SECONDS) onSlow();
  });

  return null;
}

export default function VaporizerCanvas({
  modelPath,
  particleCount,
  ambientCount,
  dpr,
  active,
  pointer,
  anchor,
  onSlowStart,
  ...config
}: VaporizerCanvasProps) {
  const { cloud } = usePointCloud({ modelPath, particleCount, ambientCount });

  return (
    <Canvas
      dpr={dpr}
      // `never` fuera de pantalla: un elemento decorativo que ya no se ve no
      // tiene por qué seguir gastando GPU ni batería.
      // `demand` con el movimiento desactivado: un solo fotograma y parar.
      frameloop={!active ? "never" : config.animate ? "always" : "demand"}
      camera={{ fov: 35, position: [0, 0, 6] }}
      gl={{
        // Sin antialias: en puntos con halo no se aprecia, y el relleno
        // aditivo es justo lo caro de este efecto.
        antialias: false,
        // Fondo transparente: el negro lo pone la página. Evita una segunda
        // capa de color y que el lienzo se vea como un recuadro distinto.
        alpha: true,
        powerPreference: "high-performance",
        stencil: false,
      }}
    >
      {cloud && <Scene cloud={cloud} pointer={pointer} anchor={anchor} {...config} />}
      {/* Solo con animación continua: en `demand` no hay fotogramas que medir. */}
      {cloud && config.animate && onSlowStart && <FrameBudget onSlow={onSlowStart} />}
    </Canvas>
  );
}
