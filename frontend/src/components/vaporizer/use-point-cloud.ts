"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  createPlaceholderGeometry,
  mergeSceneGeometry,
  normalizeGeometry,
} from "./geometry";
import { sampleAmbient, sampleModel, toBufferGeometry } from "./sampling";

/**
 * Carga del modelo y construcción de la nube, con su ciclo de vida.
 *
 * Todo el trabajo caro (descarga, fusión, muestreo) ocurre aquí, una sola vez,
 * fuera del bucle de render. Lo que sale son dos `BufferGeometry` inmutables
 * que la escena se limita a dibujar.
 */

export type PointCloudStatus = "loading" | "ready" | "error";

export interface PointCloud {
  /** Superficie + contorno del dispositivo. */
  model: THREE.BufferGeometry;
  /** Corona dispersa. `null` si se pidió sin partículas ambientales. */
  ambient: THREE.BufferGeometry | null;
  /** Radio de la esfera envolvente del modelo ya normalizado. */
  radius: number;
  /** De dónde salió la forma. `placeholder` = el GLB no estaba disponible. */
  source: "model" | "placeholder";
}

export interface UsePointCloudOptions {
  modelPath: string | null;
  particleCount: number;
  ambientCount: number;
}

interface State {
  cloud: PointCloud | null;
  status: PointCloudStatus;
  /** Motivo por el que se recurrió a la silueta provisional, si lo hubo. */
  reason: string | null;
}

const INITIAL: State = { cloud: null, status: "loading", reason: null };

/**
 * Descarga y convierte el GLB en una geometría fusionada.
 *
 * Se descarga con `fetch` y se pasa a `parseAsync` en lugar de usar
 * `loader.loadAsync(url)` por una razón concreta: con el modelo todavía sin
 * subir, `loadAsync` sobre un 404 lanza un error de parseo con un mensaje que
 * no dice nada. Separando las dos fases, un 404 es una rama normal del código
 * y el componente puede caer en la silueta provisional sin ruido en consola.
 */
async function loadModelGeometry(path: string): Promise<THREE.BufferGeometry> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`El modelo respondió ${response.status}`);

  const data = await response.arrayBuffer();
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(data, path.slice(0, path.lastIndexOf("/") + 1));

  const geometry = mergeSceneGeometry(gltf.scene);

  // El GLB trae materiales y texturas que esta vista no usa: solo interesa la
  // forma. Sin esta limpieza se quedarían en memoria de GPU sin que nada los
  // dibuje nunca.
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry?.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });

  if (!geometry) throw new Error("El modelo no contiene ninguna malla");
  return geometry;
}

export function usePointCloud({
  modelPath,
  particleCount,
  ambientCount,
}: UsePointCloudOptions): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    // Se rellena al terminar. La función de limpieza lee esta misma variable,
    // así que libera lo que exista en el momento de desmontar, tanto si la
    // carga acabó como si no. Es lo que hace que el doble montaje de Strict
    // Mode no deje una nube huérfana en memoria de GPU.
    let created: THREE.BufferGeometry[] = [];

    void (async () => {
      let source: THREE.BufferGeometry | null = null;
      let origin: PointCloud["source"] = "placeholder";
      let reason: string | null = null;

      if (modelPath) {
        try {
          source = await loadModelGeometry(modelPath);
          origin = "model";
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
      } else {
        reason = "No se indicó ninguna ruta de modelo";
      }

      if (cancelled) {
        source?.dispose();
        return;
      }

      if (!source) source = createPlaceholderGeometry();

      try {
        const radius = normalizeGeometry(source);
        const model = toBufferGeometry(sampleModel(source, particleCount));
        const ambient =
          ambientCount > 0 ? toBufferGeometry(sampleAmbient(ambientCount, radius)) : null;

        source.dispose();
        source = null;

        if (cancelled) {
          model.dispose();
          ambient?.dispose();
          return;
        }

        created = ambient ? [model, ambient] : [model];
        setState({ cloud: { model, ambient, radius, source: origin }, status: "ready", reason });
      } catch (error) {
        source?.dispose();
        if (cancelled) return;
        setState({
          cloud: null,
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
      for (const geometry of created) geometry.dispose();
      // Volver al estado inicial AQUÍ y no al empezar el efecto no es un
      // detalle de estilo: la nube deja de publicarse exactamente en el mismo
      // instante en que se liberan sus buffers. Resetear antes de la carga
      // dejaría una ventana en la que la escena dibuja una geometría ya
      // destruida, que es un error de contexto WebGL, no un parpadeo.
      setState(INITIAL);
    };
  }, [modelPath, particleCount, ambientCount]);

  return state;
}
