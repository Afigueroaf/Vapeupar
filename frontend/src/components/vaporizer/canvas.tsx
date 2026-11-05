"use client";

import { Canvas } from "@react-three/fiber";
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

export interface VaporizerCanvasProps extends SceneConfig {
  modelPath: string | null;
  particleCount: number;
  ambientCount: number;
  dpr: [number, number];
  /** `false` cuando la pieza no está en pantalla: el bucle se detiene. */
  active: boolean;
  pointer: React.RefObject<PointerState>;
  anchor: SceneAnchor | null;
}

export default function VaporizerCanvas({
  modelPath,
  particleCount,
  ambientCount,
  dpr,
  active,
  pointer,
  anchor,
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
    </Canvas>
  );
}
