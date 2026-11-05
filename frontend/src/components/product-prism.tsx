"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
// Se reutiliza el módulo de la nube de puntos en lugar de duplicar la sonda:
// abrir un contexto WebGL de prueba no es gratis y los contextos vivos son un
// recurso contado del navegador. El módulo no tiene nada de la nube: mide el
// equipo, no el objeto.
import { canvasDpr, isWebGLAvailable } from "./vaporizer/device";
import { facesFromProducts } from "./prism/faces";
import type { Product } from "@/types/product";

/**
 * Prisma 3D de productos.
 *
 * Una pieza de N caras girando sobre su eje vertical, cada cara con la foto de
 * un producto destacado. Gira sola, se deja arrastrar, sigue al cursor cuando
 * pasa por encima y, al hacer clic en una cara, la trae al frente y la deja
 * quieta unos segundos con su rótulo.
 *
 * Reparto de responsabilidades:
 *
 * - este archivo: contenedor, entorno (WebGL, movimiento, visibilidad) y API;
 * - `prism/stage.tsx`: montaje en el DOM, cargado en diferido;
 * - `prism/scene.ts`: el motor (bucle, giro, raycast);
 * - `prism/geometry.ts`: medidas del prisma y encuadre de la cámara;
 * - `prism/faces.ts`: de productos del catálogo a caras.
 */

const PrismStage = dynamic(() => import("./prism/stage"), { ssr: false });

/** Caras por defecto. */
const DEFAULT_SIDES = 6;

/**
 * Proporción por defecto de cada cara (ancho / alto).
 *
 * Vertical, que es como se fotografía un vaporizador. No tiene que coincidir
 * con la de las fotos: el motor recorta cada textura centrada para cubrir la
 * cara sin deformarla.
 */
const DEFAULT_FACE_ASPECT = 3 / 4;

export interface ProductPrismProps {
  /**
   * Productos de los que salen las caras. Manda `showcase`, la casilla de la
   * pantalla «Vitrina» de la consola; sin ninguna marcada se usan todos
   * (`prism/faces.ts`).
   */
  products: Product[];
  /**
   * Número de caras. Con menos productos que caras, las fotos se repiten en
   * ciclo.
   * @default 6
   */
  sides?: number;
  /** @default 0.75 */
  faceAspect?: number;
  /**
   * Nombre accesible. Sin él la pieza queda como decorativa, que es lo
   * razonable cuando los mismos productos ya aparecen listados debajo.
   */
  label?: string;
  /**
   * Para el bucle aunque la pieza siga en pantalla.
   *
   * Existe por el cajón de la banda de confianza: en móvil se desliza por
   * encima del prisma y lo tapa del todo, pero taparlo no es sacarlo de la
   * pantalla, así que el observador de aquí abajo seguiría viendo la pieza
   * visible y el prisma seguiría girando detrás de un panel opaco.
   */
  paused?: boolean;
  className?: string;
}

interface Environment {
  webgl: boolean;
  maxPixelRatio: number;
}

export function ProductPrism({
  products,
  sides = DEFAULT_SIDES,
  faceAspect = DEFAULT_FACE_ASPECT,
  label,
  paused = false,
  className,
}: ProductPrismProps) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [animate, setAnimate] = useState(true);
  const [visible, setVisible] = useState(false);
  /**
   * Si la pieza ha estado a tiro de pantalla alguna vez.
   *
   * ES LO QUE DECIDE SI SE MONTA, y no `visible`, que enciende y apaga el bucle.
   * Hasta que lo sea no se monta nada: ni three.js, ni el contexto WebGL, ni las
   * seis fotos.
   *
   * POR QUÉ: three.js, un contexto WebGL —un recurso contado, del que esta
   * página ya gasta otro para la nube de puntos— y seis imágenes por el
   * optimizador no se pagan por una pieza que el visitante no ha visto todavía.
   * El cierre nació cuando el hueco de la banda era `hidden lg:block` y en un
   * teléfono el prisma no existía: el componente se renderizaba igual y el
   * móvil pagaba la descarga entera por nada. Ahora el prisma sí se ve en
   * móvil, pero el cierre sigue valiendo lo mismo, porque la banda queda a una
   * pantalla de la portada.
   *
   * El cierre va contra el observador y NO contra una media query: un elemento
   * con `display: none` no interseca nunca, así que el día que algún ancho
   * vuelva a esconder el hueco no hay que repetir aquí su punto de ruptura.
   */
  const [everVisible, setEverVisible] = useState(false);

  const faces = useMemo(() => facesFromProducts(products, sides), [products, sides]);

  // Nada de esto existe en el servidor, así que se mide tras el montaje; hasta
  // entonces el componente solo reserva el hueco.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setAnimate(!motion.matches);

    const measure = () =>
      setEnvironment({ webgl: isWebGLAvailable(), maxPixelRatio: canvasDpr()[1] });

    measure();
    syncMotion();

    motion.addEventListener("change", syncMotion);
    return () => motion.removeEventListener("change", syncMotion);
  }, []);

  // Visibilidad real: fuera de pantalla o en una pestaña de fondo, el bucle se
  // para. Es la diferencia entre un adorno y una fuga de batería.
  useEffect(() => {
    if (!host) return;

    let onScreen = false;
    const sync = () => setVisible(onScreen && document.visibilityState === "visible");

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) setEverVisible(true);
        sync();
      },
      { rootMargin: "120px" },
    );
    observer.observe(host);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [host]);

  const accessibility = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };

  // Sin fotos utilizables no hay prisma que montar, y sin WebGL tampoco. En
  // los dos casos el hueco se queda vacío a propósito: es una pieza de apoyo,
  // y una alternativa estática aquí competiría con el catálogo de abajo.
  const ready =
    environment !== null && environment.webgl && faces.length > 0 && everVisible;

  return (
    <div
      ref={setHost}
      {...accessibility}
      className={cn("relative isolate h-full w-full", className)}
    >
      {ready ? (
        <PrismStage
          faces={faces}
          faceAspect={faceAspect}
          maxPixelRatio={environment.maxPixelRatio}
          animate={animate}
          active={visible && !paused}
        />
      ) : null}
    </div>
  );
}
