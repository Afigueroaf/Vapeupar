"use client";

import { useEffect, useRef } from "react";
import { createPrismScene, type PrismSceneHandle } from "./scene";
import type { PrismFace } from "./faces";

/**
 * Montaje del prisma en el DOM.
 *
 * Archivo aparte porque el componente público lo carga con
 * `next/dynamic({ ssr: false })`: así three.js —unos cuantos cientos de kB— no
 * entra ni en el render del servidor ni en el paquete inicial del cliente, y la
 * portada pinta su HTML sin esperar a nada de esto. Es el mismo reparto que usa
 * la nube de puntos de la intro.
 *
 * Todas las propiedades menos `active` se congelan al montar: cambiar
 * cualquiera reconstruye la escena entera, de ahí que el envoltorio las
 * memorice. `active` sí viaja en caliente, que para eso es lo que enciende y
 * apaga el bucle.
 */

export interface PrismStageProps {
  faces: PrismFace[];
  faceAspect: number;
  maxPixelRatio: number;
  animate: boolean;
  /** `false` fuera de pantalla o con la pestaña en segundo plano. */
  active: boolean;
}

export default function PrismStage({
  faces,
  faceAspect,
  maxPixelRatio,
  animate,
  active,
}: PrismStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLParagraphElement>(null);
  const handle = useRef<PrismSceneHandle | null>(null);

  /**
   * Último `active` conocido.
   *
   * POR QUÉ HACE FALTA: la escena nace detenida y la enciende el efecto de
   * abajo, que solo se ejecuta cuando cambia `active`. Si lo que cambia es
   * cualquiera de las otras propiedades, el efecto de arriba reconstruye la
   * escena y el de abajo NO se vuelve a ejecutar, así que la escena nueva se
   * quedaba detenida para siempre y el prisma desaparecía. Pasaba de verdad:
   * basta con activar «reducir movimiento» del sistema con la portada abierta
   * para que cambie `animate`.
   */
  const activeRef = useRef(active);

  useEffect(() => {
    const node = host.current;
    if (!node) return;

    const scene = createPrismScene(node, {
      faces,
      faceAspect,
      maxPixelRatio,
      animate,
      label: label.current,
    });
    handle.current = scene;
    // La escena nueva arranca en el estado en el que estaba la anterior.
    scene.setActive(activeRef.current);

    return () => {
      handle.current = null;
      scene.dispose();
    };
  }, [faces, faceAspect, maxPixelRatio, animate]);

  useEffect(() => {
    activeRef.current = active;
    handle.current?.setActive(active);
  }, [active]);

  return (
    <>
      <div
        ref={host}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        // `pan-y` y no `none`: el gesto horizontal gira el prisma, pero el
        // vertical tiene que seguir desplazando la página. Sin esto, en un
        // teléfono el prisma se convierte en una trampa de scroll.
        style={{ touchAction: "pan-y pinch-zoom" }}
      />

      {/*
        Rótulo del producto. Lo escribe el bucle de dibujo directamente sobre
        el nodo —texto y opacidad— en lugar de pasar por estado de React: su
        valor cambia en cada fotograma mientras la pieza gira, y un render por
        fotograma de la portada entera costaría más que el propio 3D.

        `aria-hidden` porque es el subtítulo de una pieza decorativa cuyo
        contenido real ya está, accesible y enlazable, en el catálogo.
      */}
      <p
        ref={label}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[8%] bottom-[8%] z-10 truncate rounded-vp border-2 border-action bg-background/85 px-3 py-2 text-center font-display text-sm font-bold uppercase tracking-[0.12em] text-action opacity-0"
      />
    </>
  );
}
