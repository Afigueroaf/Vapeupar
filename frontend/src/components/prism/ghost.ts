import * as THREE from "three";

/**
 * Huella de glitch: la proyección congelada de una escena 3D.
 *
 * QUÉ PROBLEMA RESUELVE. La ráfaga de glitch de la portada separaba los canales
 * de color con un filtro CSS aplicado al bloque que contiene el lienzo. Eso
 * obliga al navegador a rasterizar el bloque entero en una superficie aparte, y
 * un lienzo que anima a 60 fps la invalida sesenta veces por segundo: medido en
 * un Moto G15, un `FinishPaintRenderPass` de 450 ms en la GPU cada vez que una
 * ráfaga coincidía con el scroll. Haciendo el efecto DENTRO de la escena, el
 * lienzo sale del filtro y ese coste desaparece.
 *
 * QUÉ ES, EXACTAMENTE. Al arrancar la ráfaga se guarda una foto de la escena en
 * una textura. Durante los ~420 ms siguientes, esa foto se vuelve a dibujar
 * encima de la escena VIVA, con los canales separados y cortada en franjas.
 * El resultado es un rastro de dónde estaban las piezas en el instante en que
 * saltó el glitch, sobre las piezas moviéndose de verdad.
 *
 * LA ANIMACIÓN NO SE PAUSA, Y ESE ES EL PUNTO. Las animaciones propias de cada
 * componente son lo principal y el glitch es un efecto secundario encima: el
 * prisma sigue girando a su ritmo durante toda la ráfaga. Una versión anterior
 * congelaba la escena —más barata— y se descartó porque la pausa se leía como
 * un tirón, que era justo lo que se intentaba quitar.
 *
 * El desgarro por bandas es el mismo que ya usa la nube de puntos
 * (`vaporizer/scene.tsx`): bandas horizontales de ~26 px de las que solo se
 * desplaza una de cada tres, con la semilla avanzando en el tiempo. Aquí se
 * aplica en espacio de pantalla sobre una imagen plana en vez de por vértice,
 * que es más barato y da el mismo dibujo.
 */

/** Alto de cada banda, en píxeles CSS. Igual que en la nube de puntos. */
const BAND_HEIGHT = 26;

/** Cuánto se desplaza una banda, en múltiplos de `--glitch-shift`. */
const TEAR = 5;

/** Velocidad a la que se reparten las bandas, en barajadas por segundo. */
const SHUFFLE = 18;

/**
 * Opacidad máxima de la huella.
 *
 * No llega a 1 a propósito: la gracia es que se lea como un rastro POR ENCIMA
 * de la pieza viva, no como un cuadro congelado que la tapa. A 0,85 el rastro
 * domina durante el pico de la ráfaga y deja ver el movimiento por debajo.
 */
const MAX_OPACITY = 0.85;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/*
  Cinco muestras: el rojo desplazado a un lado, el azul al otro, y el verde en
  su sitio, que es la misma descomposición que hace el filtro SVG de la página
  (`page-glitch.tsx`). La alfa se toma como el máximo de las tres para que el
  borde de la silueta no se deshilache por el lado que no aporta color.
*/
const FRAGMENT = /* glsl */ `
  uniform sampler2D uSnapshot;
  uniform vec2 uResolution;
  uniform float uShift;
  uniform float uBands;
  uniform float uSeed;
  uniform float uOpacity;
  varying vec2 vUv;

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  void main() {
    float px = 1.0 / uResolution.x;

    // Solo una banda de cada tres se mueve: desplazarlas todas no se lee como
    // una señal rota, sino como un desenfoque de movimiento.
    float band = floor(vUv.y * uBands + uSeed);
    float torn = step(0.66, hash(band * 3.17 + uSeed));
    float amount = hash(band + uSeed * 1.37) * 2.0 - 1.0;

    vec2 uv = vUv + vec2(amount * uShift * ${TEAR}.0 * px * torn, 0.0);

    // Fuera de la textura no hay huella: sin esto, la banda desplazada
    // arrastraría el borde estirado a lo largo de toda su altura.
    if (uv.x < 0.0 || uv.x > 1.0) discard;

    float o = uShift * px;
    vec4 red = texture2D(uSnapshot, uv - vec2(o, 0.0));
    vec4 green = texture2D(uSnapshot, uv);
    vec4 blue = texture2D(uSnapshot, uv + vec2(o, 0.0));

    float a = max(green.a, max(red.a, blue.a));
    if (a <= 0.001) discard;

    gl_FragColor = vec4(red.r, green.g, blue.b, a * uOpacity);
  }
`;

export interface GhostStep {
  /** `--glitch-shift` de este fotograma, en píxeles CSS. 0 apaga la huella. */
  shift: number;
  /** Segundos acumulados, para que las bandas se rebarajen. */
  time: number;
}

/**
 * Crea la huella para un renderizador y una escena concretos.
 *
 * El llamante solo tiene que invocar `draw()` DESPUÉS de dibujar su escena, en
 * cada fotograma. La captura se dispara sola en el primer fotograma de cada
 * ráfaga.
 */
export function createGhost(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();

  /*
    Cámara de identidad: el vértice ya escribe `gl_Position` en coordenadas de
    recorte, así que la proyección no pinta nada aquí. Hace falta una cámara
    porque `render()` la pide, pero cualquiera sirve.
  */
  const camera = new THREE.Camera();

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uSnapshot: { value: null as THREE.Texture | null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uShift: { value: 0 },
      uBands: { value: 1 },
      uSeed: { value: 0 },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  let target: THREE.WebGLRenderTarget | null = null;
  let captured = false;

  /** Reserva o redimensiona la textura al tamaño del lienzo. */
  const ensureTarget = () => {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const width = Math.max(1, Math.floor(size.x));
    const height = Math.max(1, Math.floor(size.y));

    if (target && target.width === width && target.height === height) return target;

    target?.dispose();
    target = new THREE.WebGLRenderTarget(width, height, {
      // Sin profundidad ni plantilla: esto es una foto plana, no una escena.
      depthBuffer: false,
      stencilBuffer: false,
      // Lineal y no `NearestFilter`: las bandas se desplazan fracciones de
      // píxel y el vecino más próximo las dejaría dentadas.
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    return target;
  };

  return {
    /**
     * Dibuja la huella si hay ráfaga, y captura la foto si acaba de empezar.
     *
     * Va DESPUÉS del `render` de la escena del llamante: la huella se compone
     * encima de la pieza viva.
     */
    draw(source: THREE.Scene, sourceCamera: THREE.Camera, step: GhostStep) {
      if (step.shift <= 0) {
        // Fin de ráfaga: se arma la siguiente captura. La textura se conserva
        // para no reservar memoria otra vez dentro de la próxima.
        captured = false;
        return;
      }

      const buffer = ensureTarget();

      if (!captured) {
        // LA FOTO ES DEL INSTANTE EN QUE SALTA EL GLITCH, y se toma una sola
        // vez por ráfaga: eso es lo que la convierte en rastro de dónde
        // estaban las piezas, en vez de en una copia que las persigue.
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(buffer);
        renderer.clear();
        renderer.render(source, sourceCamera);
        renderer.setRenderTarget(previous);
        captured = true;
      }

      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const ratio = renderer.getPixelRatio();
      const cssHeight = size.y / ratio;

      material.uniforms.uSnapshot.value = buffer.texture;
      material.uniforms.uResolution.value.copy(size);
      material.uniforms.uShift.value = step.shift * ratio;
      material.uniforms.uBands.value = Math.max(1, cssHeight / BAND_HEIGHT);
      material.uniforms.uSeed.value = Math.floor(step.time * SHUFFLE);
      material.uniforms.uOpacity.value = MAX_OPACITY;

      // `autoClear` apagado: la huella se suma a lo ya dibujado en vez de
      // borrarlo. Se restaura enseguida para no alterar el bucle del llamante.
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = autoClear;
    },

    dispose() {
      target?.dispose();
      quad.geometry.dispose();
      material.dispose();
    },
  };
}
