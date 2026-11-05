"use client";

/*
 * `react-hooks/immutability` está desactivado en este archivo, y solo en este.
 *
 * La regla protege el modelo de memoización de React: nada que salga de un
 * hook debería mutarse después del render. Pero aquí los objetos mutados
 * (cámara, materiales) no son estado de React: son objetos de three.js que
 * viven en la GPU y cuyo ciclo de vida es el `<Canvas>`, no el árbol de
 * componentes. Escribir un uniform sesenta veces por segundo es precisamente
 * la forma en que R3F anima; la alternativa —volver a crear el material en
 * cada frame— recompilaría el shader y destruiría el rendimiento.
 *
 * El alcance es deliberadamente este archivo. El resto del componente sigue
 * las reglas sin excepciones.
 */
/* eslint-disable react-hooks/immutability */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLITCH_MAX_SHIFT, readGlitchShift } from "@/lib/glitch";
import { createPointMaterial } from "./point-material";
import { ScatterField } from "./scatter-field";
import type { PointCloud } from "./use-point-cloud";

/**
 * Contenido de la escena: cámara, nube y animación.
 *
 * Este archivo solo se ejecuta dentro de un `<Canvas>`; el montaje, la
 * detección de WebGL y el contenedor viven en `vaporizer-point-cloud.tsx`.
 */

/** Holgura entre el objeto y el borde del lienzo. */
const FIT_MARGIN = 1.14;

/**
 * Tope del delta de frame, en segundos.
 *
 * Al volver de una pestaña en segundo plano el primer delta puede valer varios
 * segundos. Sin tope, el objeto reaparecería girado media vuelta de golpe.
 */
const MAX_DELTA = 0.05;

/**
 * Altura de lienzo, en píxeles CSS, para la que `pointSize` vale tal cual.
 *
 * El tamaño del punto se escala respecto a esta referencia porque, en píxeles
 * fijos, la misma nube en un lienzo de la mitad de lado dibuja cuatro veces
 * más densidad aparente: en un teléfono el dispositivo se convertía en una
 * mancha saturada mientras en escritorio se veía bien.
 */
const REFERENCE_HEIGHT = 560;

/** Tamaño de las partículas ambientales respecto a las de superficie. */
const AMBIENT_SIZE = 0.7;

/**
 * Velocidad a la que un punto suelto regresa a su sitio, en 1/segundo.
 *
 * Gobierna el **retorno**, y solo el retorno: la salida es inmediata, porque
 * el estado del punto salta al valor que marca el cursor en cuanto lo alcanza.
 * A 0,5 un punto tarda unos tres segundos en recomponerse del todo. Subirla
 * acelera el regreso; bajarla deja la nube abierta más tiempo.
 */
const CURSOR_RELEASE = 0.5;

/**
 * Velocidad de salida, en 1/segundo.
 *
 * Un punto alcanzado por el cursor tarda medio segundo en llegar a su alcance
 * máximo, así que la nube se abre con cuerpo en lugar de saltar. Sigue siendo
 * cuatro veces la de regreso: salir se nota, volver cuesta.
 *
 * Al pasar rápido por encima, el cursor solo arranca a los puntos la parte de
 * recorrido que le dé tiempo; es lo que hace que un roce despeine y una
 * pasada lenta desarme.
 */
const CURSOR_GRAB = 2;

/**
 * Velocidad de salida añadida durante una explosión, en 1/segundo.
 *
 * El clic no solo abre más la esfera: también empuja mucho más rápido. Sin
 * esto, con una salida pensada para que la nube se abra con calma, el estallido
 * se vería como un bostezo.
 */
const BURST_GRAB = 14;

/**
 * Velocidad a la que se apaga la explosión, en 1/segundo.
 *
 * Unos ocho décimas de segundo hasta recuperar el radio normal. Los puntos que
 * salieron despedidos siguen volviendo a su ritmo, que es el lento.
 */
const BURST_RELEASE = 3.2;

/**
 * Cuánto se desplaza una banda desgarrada, respecto al glitch de la página.
 *
 * Cinco veces la separación de canales: el filtro RGB mueve copias de color
 * unos píxeles, pero para que una nube de puntos se lea como rota hace falta
 * un corte franco. A plena intensidad son unos 70 px de desgarro.
 */
const GLITCH_TEAR = 5;

/** Altura de cada banda del desgarro, en píxeles CSS. */
const GLITCH_BAND_HEIGHT = 26;

/** Barajados de banda por segundo. Entero: el glitch va a tirones, no fluido. */
const GLITCH_SHUFFLE = 18;

/**
 * Hueco del lienzo que ocupa el objeto.
 *
 * Existe porque el lienzo del hero es mucho mayor que el dispositivo: el marco
 * abarca la intro entera y la banda de confianza, mientras que el vaporizador
 * tiene que seguir donde estaba, en la columna derecha. Sin esto, el objeto se
 * centraría en todo el bloque.
 *
 * Las tres cifras van normalizadas respecto a la **altura** del lienzo, que es
 * la magnitud con la que trabaja el `fov` vertical de three.js.
 */
export interface SceneAnchor {
  /** Desplazamiento del centro del objeto respecto al del lienzo. */
  x: number;
  /** Igual en vertical, positivo hacia arriba. */
  y: number;
  /** Lado del hueco donde debe caber el objeto. */
  span: number;
}

export interface SceneConfig {
  color: string;
  /** Tamaño del objeto respecto al hueco del ancla. 1 lo ajusta justo. */
  scale: number;
  pointSize: number;
  glow: number;
  opacity: number;
  rotationSpeed: number;
  wave: number;
  twinkle: number;
  tilt: number;
  pointerStrength: number;
  /**
   * Radio de acción del cursor, en fracción de la altura del lienzo. Los
   * puntos que caigan dentro se desprenden de la superficie.
   */
  cursorRadius: number;
  /**
   * Hasta dónde llegan esos puntos, también en fracción de la altura del
   * lienzo. A 0 el cursor no desarma nada.
   */
  cursorScatter: number;
  /** Cuánto crece el radio al hacer clic, como múltiplo del normal. */
  burstRadius: number;
  initialRotation: [number, number, number];
  /** `false` bajo `prefers-reduced-motion`: la nube se dibuja quieta. */
  animate: boolean;
}

/** Estado del cursor que publica el contenedor en cada movimiento. */
export interface PointerState {
  /** Posición normalizada a -1..1 respecto al centro del lienzo. */
  x: number;
  y: number;
  /** Si el cursor está dentro del contenedor. */
  inside: boolean;
  /** Clics acumulados sobre la pieza. Cada incremento dispara una explosión. */
  burst: number;
}

interface SceneProps extends SceneConfig {
  cloud: PointCloud;
  pointer: React.RefObject<PointerState>;
  /** Hueco donde anclar el objeto. `null` lo centra en el lienzo. */
  anchor: SceneAnchor | null;
}

export function Scene({ cloud, pointer, anchor, ...config }: SceneProps) {
  const tiltGroup = useRef<THREE.Group>(null);
  const spinGroup = useRef<THREE.Group>(null);
  /** Cursor en el plano del objeto, reutilizado cada fotograma. */
  const cursor = useRef(new THREE.Vector2(1e6, 1e6));
  /** Fuerza de la explosión en curso, de 1 a 0. */
  const burst = useRef(0);
  /** Último clic atendido, para detectar los nuevos. */
  const lastBurst = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const dpr = useThree((state) => state.viewport.dpr);
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  /**
   * Encuadre: a qué distancia va la cámara y cuánto se descentra.
   *
   * El tamaño sale del radio de la esfera envolvente, no de la caja: una
   * esfera no cambia al rotar, así que una distancia válida en una orientación
   * lo es en todas. Por eso girar no puede recortar el modelo.
   *
   * `span` es el lado del hueco donde el objeto debe caber, en unidades de
   * altura de lienzo. Sin ancla vale el lado menor del lienzo, que es el
   * comportamiento de centrarlo; `Math.min` con la relación de aspecto es lo
   * que evita que un lienzo apaisado recorte los lados, porque el `fov` de
   * three.js es siempre vertical.
   *
   * De `span` salen las dos cosas a la vez —distancia y tamaño de punto—, así
   * que encuadre y densidad visual no pueden descoordinarse.
   *
   * `scale` agranda el objeto sin moverlo: solo cambia la distancia de la
   * cámara, y el desplazamiento del ancla se recalcula en la misma proporción,
   * de modo que el centro del vaporizador se queda clavado donde estaba.
   */
  const framing = useMemo(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || height === 0) {
      return {
        distance: 6,
        offsetX: 0,
        offsetY: 0,
        pixels: REFERENCE_HEIGHT,
        worldPerCanvasHeight: 1,
        aspect: 1,
      };
    }

    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const span = (anchor ? anchor.span : Math.min(1, width / height)) * config.scale;

    // Radio angular que debe tener el objeto para ocupar `span` con holgura.
    const angle = Math.atan((span * tangent) / FIT_MARGIN);
    const distance = cloud.radius / Math.sin(angle);

    // Unidades de mundo que mide el lienzo de arriba abajo a esa distancia:
    // el factor que convierte el desplazamiento del ancla en una traslación.
    const worldPerCanvasHeight = 2 * distance * tangent;

    return {
      distance,
      offsetX: (anchor?.x ?? 0) * worldPerCanvasHeight,
      offsetY: (anchor?.y ?? 0) * worldPerCanvasHeight,
      pixels: span * height,
      worldPerCanvasHeight,
      aspect: width / height,
    };
  }, [camera, cloud.radius, width, height, anchor, config.scale]);

  // Los materiales se crean una vez por combinación de ajustes. Recrearlos en
  // cada render de React recompilaría el shader y provocaría un tirón visible.
  const modelMaterial = useMemo(
    () =>
      createPointMaterial({
        color: config.color,
        size: config.pointSize,
        glow: config.glow,
        opacity: config.opacity,
        wave: config.animate ? config.wave : 0,
        twinkle: config.animate ? config.twinkle : 0,
      }),
    [
      config.color,
      config.pointSize,
      config.glow,
      config.opacity,
      config.wave,
      config.twinkle,
      config.animate,
    ],
  );

  const ambientMaterial = useMemo(
    () =>
      cloud.ambient
        ? createPointMaterial({
            color: config.color,
            // Más pequeñas y con más halo que las de superficie: así se leen
            // como polvo suspendido y no compiten con la silueta.
            size: config.pointSize * AMBIENT_SIZE,
            glow: config.glow * 1.4,
            opacity: config.opacity * 0.7,
            wave: config.animate ? config.wave * 3 : 0,
            twinkle: config.animate ? config.twinkle : 0,
          })
        : null,
    [
      cloud.ambient,
      config.color,
      config.pointSize,
      config.glow,
      config.opacity,
      config.wave,
      config.twinkle,
      config.animate,
    ],
  );

  /**
   * Estado de dispersión por punto.
   *
   * Se crea junto a la geometría —y solo con ella— porque la textura de
   * posiciones en reposo es un retrato de esa nube concreta. El atributo
   * `aState` dice a cada punto qué texel le toca leer.
   */
  const modelField = useMemo(() => {
    const position = cloud.model.getAttribute("position");
    const field = new ScatterField(position.array as Float32Array, position.count);
    cloud.model.setAttribute("aState", new THREE.BufferAttribute(field.uv, 2));
    return field;
  }, [cloud.model]);

  const ambientField = useMemo(() => {
    if (!cloud.ambient) return null;
    const position = cloud.ambient.getAttribute("position");
    const field = new ScatterField(position.array as Float32Array, position.count);
    cloud.ambient.setAttribute("aState", new THREE.BufferAttribute(field.uv, 2));
    return field;
  }, [cloud.ambient]);

  useEffect(() => {
    return () => {
      modelMaterial.dispose();
      ambientMaterial?.dispose();
    };
  }, [modelMaterial, ambientMaterial]);

  useEffect(() => {
    return () => {
      modelField.dispose();
      ambientField?.dispose();
    };
  }, [modelField, ambientField]);

  // Encuadre de la cámara y referencia de tamaño de los puntos: lo mismo, así
  // que se aplica junto. `gl_PointSize` está además en píxeles de dibujo y no
  // en píxeles CSS, de ahí el factor de densidad de pantalla.
  useEffect(() => {
    // Radio y alcance llegan en fracciones de la altura del lienzo, así que el
    // efecto se siente igual en cualquier pantalla; aquí pasan a unidades de
    // mundo, que es lo que entienden el shader y la simulación.
    const scatter = config.cursorScatter * framing.worldPerCanvasHeight;

    if (camera instanceof THREE.PerspectiveCamera) {
      // La cámara se desplaza en paralelo y NO gira hacia el objeto. Girarla
      // lo dejaría en el mismo sitio de la pantalla, sí, pero visto desde un
      // ángulo distinto: el dispositivo se vería escorado. Trasladando el eje
      // de visión el objeto se mueve por el encuadre conservando su pose.
      camera.position.set(-framing.offsetX, -framing.offsetY, framing.distance);
      camera.rotation.set(0, 0, 0);
      // Los planos de recorte cuentan con la dispersión: un punto que sale
      // despedido hacia la cámara o hacia el fondo recorre `scatter`, y si se
      // saliera del tronco de visión desaparecería de golpe en mitad del
      // vuelo. Dar aire aquí no cuesta nada: con `depthWrite` apagado la
      // precisión del buffer de profundidad no interviene en el dibujo.
      camera.near = Math.max(0.1, framing.distance - cloud.radius * 2 - scatter);
      camera.far = framing.distance + cloud.radius * 6 + scatter * 2;
      camera.updateProjectionMatrix();
    }

    // El tamaño del punto se mide contra el tamaño **aparente del objeto**, no
    // contra el del lienzo: con el marco a pantalla completa son cosas muy
    // distintas, y atarlo al lienzo inflaría los puntos sin que el vaporizador
    // creciera.
    const sizeScale = THREE.MathUtils.clamp(framing.pixels / REFERENCE_HEIGHT, 0.6, 1.4);

    modelMaterial.uniforms.uSize.value = config.pointSize * sizeScale;
    if (ambientMaterial) {
      ambientMaterial.uniforms.uSize.value = config.pointSize * AMBIENT_SIZE * sizeScale;
    }

    for (const material of [modelMaterial, ambientMaterial]) {
      if (!material) continue;
      material.uniforms.uReference.value = framing.distance;
      material.uniforms.uPixelRatio.value = dpr;
    }

    modelMaterial.uniforms.uScatter.value = scatter;
    // Las ambientales ya flotan sueltas: con el alcance completo se irían de
    // paseo y le quitarían protagonismo al dispositivo al desarmarse.
    if (ambientMaterial) ambientMaterial.uniforms.uScatter.value = scatter * 0.45;

    invalidate();
  }, [
    camera,
    framing,
    cloud.radius,
    dpr,
    config.pointSize,
    config.cursorRadius,
    config.cursorScatter,
    modelMaterial,
    ambientMaterial,
    invalidate,
  ]);

  // Con la animación apagada el bucle está en modo `demand`: hay que pedir
  // explícitamente el único fotograma que se va a dibujar.
  useEffect(() => {
    if (!config.animate) invalidate();
  }, [config.animate, cloud, invalidate]);

  useFrame((_, rawDelta) => {
    if (!config.animate) return;

    const delta = Math.min(rawDelta, MAX_DELTA);

    modelMaterial.uniforms.uTime.value += delta;
    if (ambientMaterial) ambientMaterial.uniforms.uTime.value += delta;

    if (spinGroup.current) {
      spinGroup.current.rotation.y += delta * config.rotationSpeed;
    }

    if (tiltGroup.current) {
      const { x, y } = pointer.current;
      const targetX = config.tilt + y * config.pointerStrength;
      const targetZ = x * config.pointerStrength;

      // Amortiguación exponencial: independiente de la tasa de refresco y sin
      // rebote. El objeto se acerca a la orientación objetivo, nunca la
      // persigue de golpe.
      const factor = 1 - Math.exp(-delta * 3.2);
      tiltGroup.current.rotation.x += (targetX - tiltGroup.current.rotation.x) * factor;
      tiltGroup.current.rotation.z += (targetZ - tiltGroup.current.rotation.z) * factor;
    }

    // --- Cursor que desarma la nube ---

    // El cursor llega normalizado al lienzo; se traduce al plano del objeto.
    // El centro de ese plano no es el origen del mundo, sino la posición a la
    // que el anclaje desplazó la cámara.
    const half = framing.worldPerCanvasHeight / 2;
    cursor.current.set(
      -framing.offsetX + pointer.current.x * half * framing.aspect,
      -framing.offsetY - pointer.current.y * half,
    );

    // La simulación necesita la orientación de este mismo fotograma: las
    // rotaciones se acaban de tocar unas líneas más arriba y las matrices de
    // mundo todavía no se han recalculado.
    const group = spinGroup.current;
    if (!group) return;
    group.updateWorldMatrix(true, false);

    // Explosión. Un clic nuevo la pone a 1; desde ahí se apaga sola.
    if (pointer.current.burst !== lastBurst.current) {
      lastBurst.current = pointer.current.burst;
      burst.current = 1;
    } else if (burst.current > 0) {
      burst.current = burst.current < 0.002 ? 0 : burst.current * Math.exp(-delta * BURST_RELEASE);
    }

    const step = {
      model: group.matrixWorld,
      cursor: cursor.current,
      // El radio crece con la explosión y vuelve solo. El centro es el del
      // clic, porque el cursor ya está ahí.
      radius:
        config.cursorRadius *
        framing.worldPerCanvasHeight *
        (1 + (config.burstRadius - 1) * burst.current),
      decay: Math.exp(-delta * CURSOR_RELEASE),
      rise: delta * (CURSOR_GRAB + BURST_GRAB * burst.current),
      active: pointer.current.inside && config.cursorScatter > 0,
    };

    modelField.update(gl, step);
    modelMaterial.uniforms.uState.value = modelField.texture;

    if (ambientField && ambientMaterial) {
      ambientField.update(gl, step);
      ambientMaterial.uniforms.uState.value = ambientField.texture;
    }

    // --- Glitch de la página ---

    // La señal es la misma que mueve el filtro RGB del resto de la portada, de
    // modo que la nube se rompe en el mismo instante y con la misma fuerza. En
    // píxeles CSS; aquí se pasa a unidades de mundo con el factor del encuadre.
    const shift = Math.min(readGlitchShift(), GLITCH_MAX_SHIFT);
    const perPixel = height > 0 ? framing.worldPerCanvasHeight / height : 0;
    const tear = shift * GLITCH_TEAR * perPixel;
    const bands = perPixel > 0 ? 1 / (GLITCH_BAND_HEIGHT * perPixel) : 1;
    const seed = Math.floor(modelMaterial.uniforms.uTime.value * GLITCH_SHUFFLE);

    for (const material of [modelMaterial, ambientMaterial]) {
      if (!material) continue;
      material.uniforms.uGlitch.value = tear;
      material.uniforms.uGlitchBands.value = bands;
      material.uniforms.uGlitchSeed.value = seed;
    }
  });

  return (
    <>
      <group ref={tiltGroup} rotation={[config.tilt, 0, 0]}>
        <group ref={spinGroup} rotation={config.initialRotation}>
          <points geometry={cloud.model} material={modelMaterial} frustumCulled={false} />
          {cloud.ambient && ambientMaterial && (
            <points geometry={cloud.ambient} material={ambientMaterial} frustumCulled={false} />
          )}
        </group>
      </group>
    </>
  );
}
