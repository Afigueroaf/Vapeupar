"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isCursorMode, isCursorModeOnServer, subscribeCursorMode } from "@/lib/touch-cursor";
import { cn } from "@/lib/utils";
import { canvasDpr, deviceBudgetFactor, isWebGLAvailable } from "./vaporizer/device";
import type { PointerState, SceneAnchor } from "./vaporizer/scene";
import { readColorToken } from "./vaporizer/tokens";

/**
 * Nube de puntos 3D del vaporizador.
 *
 * Representa el dispositivo como miles de partículas luminosas repartidas
 * sobre su superficie real, con las aristas reforzadas para que la silueta se
 * lea. El modelo es `/models/vaporizer.glb`, exportado desde
 * `assets/3d_components/vape.blend` (ver el README de esa carpeta pública).
 * Si el archivo falta, dibuja una silueta provisional generada por código en
 * lugar de dejar el hueco vacío.
 *
 * Reparto de responsabilidades:
 *
 * - este archivo: contenedor, entorno (WebGL, movimiento, visibilidad) y API;
 * - `vaporizer/canvas.tsx`: el lienzo, cargado en diferido;
 * - `vaporizer/scene.tsx`: cámara y animación;
 * - `vaporizer/use-point-cloud.ts`: carga del modelo y ciclo de vida;
 * - `vaporizer/geometry.ts` + `sampling.ts`: de malla a puntos.
 */

const VaporizerCanvas = dynamic(() => import("./vaporizer/canvas"), { ssr: false });

/** Ruta por defecto del modelo. Relativa a `frontend/public`. */
const DEFAULT_MODEL_PATH = "/models/vaporizer.glb";

export interface VaporizerPointCloudProps {
  /**
   * Ruta pública del GLB o glTF. `null` fuerza la silueta provisional.
   * @default "/models/vaporizer.glb"
   */
  modelPath?: string | null;
  /**
   * Partículas sobre el dispositivo, antes del ajuste por capacidad del
   * equipo. El valor por defecto está calibrado para el box-mod del hero: sus
   * caras planas son grandes y con menos puntos el cuerpo se vacía y el objeto
   * se lee como un alambrado en lugar de como un volumen.
   * @default 55000
   */
  particleCount?: number;
  /**
   * Corona de partículas sueltas alrededor del objeto.
   * @default true
   */
  ambientParticles?: boolean;
  /** @default 1400 */
  ambientParticleCount?: number;
  /**
   * Color principal. Por defecto se lee el token `--color-action` del sistema
   * VP, de modo que la pieza sigue a la paleta sin fijar ningún hex aquí.
   */
  color?: string;
  /**
   * Tamaño del objeto respecto al hueco que marca `anchorSelector`.
   *
   * A 1 el vaporizador se ajusta al hueco; por encima lo desborda, que es lo
   * normal aquí porque el lienzo cubre la portada entera y el hueco solo sirve
   * para situar el objeto, no para recortarlo. Agrandar no lo mueve: su centro
   * sigue en el mismo punto de la maqueta.
   * @default 1.25
   */
  scale?: number;
  /**
   * Tamaño base del punto, en píxeles CSS medidos en el plano central del
   * objeto. Los puntos más cercanos a la cámara se dibujan mayores.
   * @default 2.4
   */
  pointSize?: number;
  /**
   * Peso del halo alrededor de cada punto. 0 deja solo el núcleo; por encima
   * de ~1,6 la nube empieza a fundirse en una mancha.
   * @default 0.8
   */
  glow?: number;
  /** @default 1 */
  opacity?: number;
  /**
   * Velocidad de giro en radianes por segundo. Negativa invierte el sentido.
   * @default 0.3
   */
  rotationSpeed?: number;
  /**
   * Amplitud de la respiración de las partículas, en unidades de escena (el
   * modelo mide 2). Por encima de ~0,05 el dispositivo empieza a deformarse.
   * @default 0.012
   */
  wave?: number;
  /**
   * Inclinación de reposo en radianes, para que no se vea de perfil plano.
   * @default -0.1
   */
  tilt?: number;
  /**
   * Orientación inicial del modelo, en radianes.
   * @default [0, 0.6, 0]
   */
  initialRotation?: [number, number, number];
  /**
   * Reacción al cursor: inclinación del objeto y dispersión de los puntos. Se
   * ignora en táctil, donde no hay cursor que seguir, y con movimiento
   * reducido.
   * @default true
   */
  interactive?: boolean;
  /**
   * Cuánto desvía el cursor la orientación, en radianes a pleno recorrido.
   * @default 0.2
   */
  pointerStrength?: number;
  /**
   * Radio de acción del cursor, en fracción de la altura del contenedor. Los
   * puntos que caen dentro se desprenden de la superficie.
   * @default 0.08
   */
  cursorRadius?: number;
  /**
   * Hasta dónde salen despedidos esos puntos, también en fracción de la
   * altura del contenedor. A 0 el cursor solo inclina el objeto, sin
   * desarmarlo.
   *
   * Es el alcance **máximo**: cada punto lleva sorteada su propia fracción de
   * esa distancia, y eso es lo que hace que la nube se desarme en vez de
   * inflarse. A 1, los que más viajan recorren la altura completa del
   * contenedor; por encima se van fuera de cuadro.
   * @default 2.25
   */
  cursorScatter?: number;
  /**
   * Cuánto crece el radio al hacer clic, como múltiplo del normal.
   *
   * El clic abre de golpe una esfera mucho mayor y empuja los puntos a más
   * velocidad: lo que se lee como una explosión. Vuelve a su tamaño en algo
   * menos de un segundo. A 1 el clic no hace nada.
   * @default 4
   */
  burstRadius?: number;
  /**
   * Si el lienzo recibe eventos de puntero. Por defecto `false`: la pieza es
   * decorativa y no debe interceptar clics de lo que tenga encima o detrás.
   * El seguimiento del cursor no lo necesita, porque se mide sobre la ventana.
   * @default false
   */
  capturePointerEvents?: boolean;
  /**
   * Selector CSS del elemento que marca dónde debe dibujarse el objeto dentro
   * del lienzo. Sirve para que el lienzo pueda ser mucho mayor que el
   * dispositivo —en la portada cubre la intro entera— sin que el vaporizador
   * se vaya al centro de todo el bloque.
   *
   * Se vuelve a medir cuando cambia el tamaño del contenedor o del hueco, así
   * que el anclaje sigue a la maqueta en cualquier punto de corte. Si el
   * selector no encuentra nada, el objeto se centra en el lienzo.
   */
  anchorSelector?: string;
  /**
   * Texto para lectores de pantalla. Sin él, la pieza se marca como decorativa
   * y desaparece del árbol de accesibilidad.
   */
  label?: string;
  /** Alternativa cuando no hay WebGL. Sin ella se usa la marca VP®. */
  fallback?: ReactNode;
  className?: string;
}

/** Lo que se mide una sola vez al montar, porque no cambia en la sesión. */
interface Environment {
  webgl: boolean;
  budgetFactor: number;
  dpr: [number, number];
  finePointer: boolean;
}

/**
 * Techo de píxeles del búfer de dibujo.
 *
 * Con el lienzo ocupando el ancho completo de la pantalla, respetar un
 * `devicePixelRatio` de 2 significaría un búfer de ocho o nueve millones de
 * píxeles para dibujar un objeto que ocupa una esquina. El recorte mantiene el
 * coste cerca del que tenía el lienzo pequeño; en puntos con halo la pérdida
 * de nitidez no se aprecia.
 */
const MAX_DRAW_PIXELS = 2_600_000;

/** Lo que cambia con la maqueta: hueco del objeto y resolución del lienzo. */
interface Layout {
  anchor: SceneAnchor | null;
  dpr: [number, number];
}

export function VaporizerPointCloud({
  modelPath = DEFAULT_MODEL_PATH,
  particleCount = 55000,
  ambientParticles = true,
  ambientParticleCount = 1400,
  color,
  scale = 1.25,
  pointSize = 2.4,
  glow = 0.8,
  opacity = 1,
  rotationSpeed = 0.3,
  wave = 0.012,
  tilt = -0.1,
  initialRotation = [0, 0.6, 0],
  interactive = true,
  pointerStrength = 0.2,
  cursorRadius = 0.08,
  cursorScatter = 2.25,
  burstRadius = 4,
  capturePointerEvents = false,
  anchorSelector,
  label,
  fallback,
  className,
}: VaporizerPointCloudProps) {
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef<PointerState>({ x: 0, y: 0, inside: false, burst: 0 });

  const [layout, setLayout] = useState<Layout | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [resolvedColor, setResolvedColor] = useState<string | null>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Medición del entorno y suscripción a la preferencia de movimiento. Nada de
  // esto existe en el servidor, así que se hace tras el montaje; hasta
  // entonces el componente solo reserva el hueco.
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setMotionAllowed(!motion.matches);

    const measure = () =>
      setEnvironment({
        webgl: isWebGLAvailable(),
        budgetFactor: deviceBudgetFactor(),
        dpr: canvasDpr(),
        finePointer: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
      });

    measure();
    syncMotion();
    motion.addEventListener("change", syncMotion);
    return () => motion.removeEventListener("change", syncMotion);
  }, []);

  // El color se lee del CSS, así que depende de que las hojas ya estén
  // aplicadas: de ahí que sea un efecto y no un valor calculado en el render.
  useEffect(() => {
    const resolve = () => setResolvedColor(color ?? readColorToken("--color-action"));
    resolve();
  }, [color]);

  // Maqueta: dónde cae el hueco del objeto dentro del lienzo y qué resolución
  // admite el lienzo a ese tamaño. Las dos cosas dependen de lo mismo —las
  // medidas reales en pantalla— y cambian a la vez, así que se miden juntas.
  const baseDpr = environment?.dpr;

  useEffect(() => {
    const node = container.current;
    if (!node || !baseDpr) return;

    const target = anchorSelector
      ? document.querySelector<HTMLElement>(anchorSelector)
      : null;

    const measure = () => {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;

      const ceiling = Math.sqrt(MAX_DRAW_PIXELS / (box.width * box.height));
      const dpr: [number, number] = [
        Math.min(baseDpr[0], Math.max(0.75, ceiling)),
        Math.min(baseDpr[1], Math.max(0.75, ceiling)),
      ];

      if (!target) {
        setLayout({ anchor: null, dpr });
        return;
      }

      const rect = target.getBoundingClientRect();
      setLayout({
        anchor: {
          // Normalizado contra la ALTURA del lienzo en los dos ejes: es la
          // magnitud con la que trabaja el `fov` vertical de three.js, y
          // mezclar ancho y alto descuadraría el desplazamiento horizontal.
          x: (rect.left + rect.width / 2 - (box.left + box.width / 2)) / box.height,
          y: (box.top + box.height / 2 - (rect.top + rect.height / 2)) / box.height,
          span: Math.min(rect.width, rect.height) / box.height,
        },
        dpr,
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (target) observer.observe(target);

    return () => observer.disconnect();
  }, [anchorSelector, baseDpr]);

  // Visibilidad real: fuera de pantalla o en una pestaña de fondo, el bucle de
  // render se para. Es la diferencia entre un adorno y una fuga de batería.
  useEffect(() => {
    const node = container.current;
    if (!node) return;

    let onScreen = false;
    const sync = () => setVisible(onScreen && document.visibilityState === "visible");

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  /**
   * El cursor táctil también es un puntero.
   *
   * `finePointer` se mide una sola vez al montar y en un teléfono vale
   * `false`: sin esto, la pieza no reaccionaría nunca al cursor virtual, que
   * es precisamente una de las animaciones que el gesto viene a rescatar. Los
   * eventos que llegan son los sintéticos del cursor —`pointermove` sobre el
   * elemento que hay bajo su punta, y burbujean hasta `window`—, así que el
   * efecto de abajo no necesita saber de dónde vienen.
   */
  const cursorMode = useSyncExternalStore(
    subscribeCursorMode,
    isCursorMode,
    isCursorModeOnServer,
  );

  const pointerEnabled =
    interactive && motionAllowed && (environment?.finePointer === true || cursorMode);

  // El cursor se sigue sobre la ventana y no sobre el lienzo: así la escena
  // reacciona al puntero sin tener que capturar eventos, y nada de lo que haya
  // alrededor pierde sus clics.
  useEffect(() => {
    if (!pointerEnabled) {
      pointer.current.x = 0;
      pointer.current.y = 0;
      pointer.current.inside = false;
      return;
    }

    const onMove = (event: PointerEvent) => {
      const node = container.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // -1..1 respecto al centro de la pieza, con tope: el cursor al otro lado
      // de la página no debe seguir empujando el objeto.
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      pointer.current.x = Math.max(-1.5, Math.min(1.5, x));
      pointer.current.y = Math.max(-1.5, Math.min(1.5, y));

      // La dispersión sí exige estar dentro: la inclinación puede responder al
      // cursor desde cualquier punto de la página, pero desarmar la nube es un
      // gesto deliberado sobre la pieza.
      pointer.current.inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
    };

    // El puntero puede abandonar la ventana sin un último `pointermove` dentro
    // del contenedor; sin esto la nube se quedaría desarmada.
    const onLeave = () => {
      pointer.current.inside = false;
    };

    // Clic: un contador, no una marca de tiempo. La escena solo necesita saber
    // que hay uno nuevo, y un entero evita depender de relojes distintos.
    const onDown = (event: PointerEvent) => {
      const node = container.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) return;

      // Pulsar un botón o un enlace del hero no es jugar con la nube: la
      // explosión ahí distraería de lo que la persona está haciendo.
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("a, button, input, select, textarea, [role='button']")
      ) {
        return;
      }

      onMove(event);
      pointer.current.burst += 1;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [pointerEnabled]);

  const counts = useMemo(() => {
    const factor = environment?.budgetFactor ?? 1;
    return {
      particles: Math.max(3000, Math.round(particleCount * factor)),
      ambient: ambientParticles ? Math.max(200, Math.round(ambientParticleCount * factor)) : 0,
    };
  }, [environment, particleCount, ambientParticles, ambientParticleCount]);

  const accessibility = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };

  const ready = environment !== null && resolvedColor !== null && layout !== null;

  return (
    <div
      ref={container}
      {...accessibility}
      className={cn(
        "relative isolate h-full w-full overflow-hidden",
        !capturePointerEvents && "pointer-events-none",
        className,
      )}
    >
      {ready && environment.webgl ? (
        <VaporizerCanvas
          modelPath={modelPath}
          particleCount={counts.particles}
          ambientCount={counts.ambient}
          dpr={layout.dpr}
          active={visible}
          pointer={pointer}
          anchor={layout.anchor}
          color={resolvedColor}
          scale={scale}
          pointSize={pointSize}
          glow={glow}
          opacity={opacity}
          rotationSpeed={rotationSpeed}
          wave={wave}
          twinkle={1}
          tilt={tilt}
          // NI `pointerStrength` NI `cursorScatter` SE PONEN A CERO AL QUEDARSE
          // SIN PUNTERO, y la razón está en el shader: `cursorScatter` acaba en
          // `uScatter`, que es la AMPLITUD del desplazamiento
          // (`point-material.ts`: `escape * (uScatter * influence)`). Cortarla
          // teletransporta a su sitio cualquier partícula suelta, por mucho que
          // su estado siga decayendo en la textura; es exactamente el tirón que
          // `scatter-field.ts` se propuso quitar.
          //
          // Lo que apaga la interacción es el efecto de más arriba, que pone
          // `inside` en falso y el puntero en el centro: con eso `active` pasa
          // a falso, deja de soltarse nada nuevo y el campo devuelve lo que
          // había poco a poco (`CURSOR_RELEASE`). La inclinación vuelve por su
          // amortiguación, igual.
          //
          // Esto no se notaba cuando `pointerEnabled` se medía una sola vez al
          // montar —en un teléfono nacía en falso y ahí se quedaba—. Con el
          // cursor táctil la condición cambia en caliente, y el corte se veía
          // al apagarlo.
          pointerStrength={pointerStrength}
          cursorRadius={cursorRadius}
          cursorScatter={cursorScatter}
          burstRadius={burstRadius}
          initialRotation={initialRotation}
          animate={motionAllowed}
        />
      ) : null}

      {/* Alternativa sin WebGL. No se muestra mientras se mide el entorno para
          evitar un parpadeo de la marca antes de que entre la nube. */}
      {ready && !environment.webgl ? (
        <div className="flex h-full w-full items-center justify-center">
          {fallback ?? (
            <span className="font-display text-7xl font-bold text-action sm:text-8xl">VP®</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
