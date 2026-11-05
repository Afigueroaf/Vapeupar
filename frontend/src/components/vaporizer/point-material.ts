import * as THREE from "three";

/**
 * Material de las partículas.
 *
 * `ShaderMaterial` y no `PointsMaterial` por tres cosas que el material de
 * serie no sabe hacer y que, resueltas en CPU, obligarían a reescribir decenas
 * de miles de posiciones en cada frame:
 *
 * - tamaño distinto por punto (las aristas son mayores que la superficie),
 * - parpadeo y onda desfasados por semilla,
 * - un halo radial que simula resplandor sin pasar por un post-proceso.
 *
 * SOBRE EL BLOOM: se descartó a propósito. Un `EffectComposer` añade otra
 * dependencia y un par de pasadas a pantalla completa, y su efecto típico aquí
 * es fundir los puntos en una mancha luminosa; justo lo que hay que evitar. El
 * resplandor sale del halo del fragment shader más `AdditiveBlending`, así que
 * los puntos son visibles por sí mismos y el detalle se conserva.
 */

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uReference;
  uniform float uPixelRatio;
  uniform float uSpread;
  uniform float uWave;
  uniform float uTwinkle;
  uniform sampler2D uState;
  uniform float uScatter;
  uniform float uGlitch;
  uniform float uGlitchBands;
  uniform float uGlitchSeed;

  attribute vec3 aNormal;
  attribute float aSize;
  attribute float aIntensity;
  attribute float aSeed;
  attribute vec3 aScatter;
  attribute vec2 aState;

  varying float vIntensity;
  varying float vSeed;
  varying float vLoose;
  varying float vTorn;

  // Ruido barato y estable: la misma banda devuelve siempre el mismo valor
  // mientras no cambie la semilla.
  float hash(float n) {
    return fract(sin(n * 91.3458) * 47453.5453);
  }

  void main() {
    // Respiración a lo largo de la normal. Amplitud en unidades de escena:
    // con el modelo normalizado a 2, 0.01 es medio punto de desplazamiento.
    // La partícula nunca se despega de la superficie, solo late sobre ella.
    float phase = aSeed * 6.2831853;
    vec3 resting = position + aNormal * sin(uTime * 0.9 + phase) * uWave;

    // Cuánto está suelto este punto. Lo decide ScatterField, que simula un
    // estado por partícula en una textura: aquí solo se lee. Que la memoria
    // sea del punto y no del recorrido del cursor es lo que permite soltar
    // media nube y que cada parte vuelva a su ritmo, sin tirones.
    float influence = texture2D(uState, aState).r;

    // La huida se suma sobre la posición en reposo, nunca sobre la anterior:
    // por eso el punto vuelve exactamente a su sitio aunque el modelo siga
    // rotando mientras tanto. aScatter va en espacio local y gira con él.
    //
    // El desplazamiento se aplica ya en espacio de vista para poder frenar su
    // componente de profundidad. Con alcances de más de dos alturas de
    // contenedor, un punto que huyera de frente hacia la cámara la rebasaría:
    // crecería hasta el tope y desaparecería al cruzar el plano cercano, un
    // destello en mitad del vuelo. Aplastando esa componente la nube se abre
    // sobre todo a lo ancho y alto, que es por donde se ve.
    vec4 viewPosition = modelViewMatrix * vec4(resting, 1.0);
    vec3 escape = (modelViewMatrix * vec4(aScatter, 0.0)).xyz;
    escape.z *= 0.3;
    viewPosition.xyz += escape * (uScatter * influence);

    // Glitch. El filtro RGB de la página ya atraviesa el lienzo y le pone su
    // aberración cromática, pero la geometría no se enteraba: la nube seguía
    // entera mientras el resto de la portada se rompía. Esto la desgarra.
    //
    // Las bandas se cortan sobre la Y de la vista y no sobre la del modelo,
    // para que el desgarro salga horizontal en pantalla y acompañe al de la
    // página aunque el vaporizador esté girando.
    vTorn = 0.0;
    if (uGlitch > 0.0) {
      float band = floor(viewPosition.y * uGlitchBands + uGlitchSeed);

      // Solo una banda de cada tres se mueve. Desplazarlas todas no se leería
      // como una rotura, sino como un temblor del objeto entero.
      float torn = step(0.66, hash(band * 3.17 + uGlitchSeed));
      float amount = hash(band + uGlitchSeed * 1.37) * 2.0 - 1.0;

      viewPosition.x += amount * uGlitch * torn;
      vTorn = torn;
    }

    float twinkle = 0.78 + 0.22 * sin(uTime * 1.9 + phase * 2.0);
    vIntensity = aIntensity * mix(1.0, twinkle, uTwinkle);
    vSeed = aSeed;
    vLoose = influence;

    // Perspectiva: lo lejano se dibuja más pequeño, y eso es lo que da
    // profundidad a una nube sin iluminación.
    //
    // uReference es la distancia a la que la cámara encuadra el objeto, así
    // que un punto en el plano central mide exactamente uSize píxeles CSS.
    // Sin ese anclaje el tamaño dependería de la escala interna de la escena y
    // habría que recalibrarlo con cada modelo.
    //
    // uSpread agranda el cuadrado del punto, no el núcleo: el resplandor
    // necesita píxeles donde desvanecerse. Sin ese margen el halo se recorta
    // al borde del punto y el conjunto se ve plano, sin importar el valor de
    // uGlow. El fragment shader vuelve a dividir por uSpread para que el
    // núcleo conserve exactamente uSize píxeles.
    //
    // El punto suelto encoge un poco: al separarse de la superficie deja de
    // formar parte del volumen y se lee como mota de polvo.
    //
    // El tope de la perspectiva es por la dispersión: con un alcance de la
    // altura del contenedor, un punto puede salir despedido hacia la cámara y
    // quedarse a una fracción de la distancia de encuadre. Sin tope crecería
    // decenas de veces y cruzaría la pantalla como un borrón blanco.
    float perspective = min(uReference / max(0.001, -viewPosition.z), 4.0);
    gl_PointSize =
      uSize * aSize * uPixelRatio * perspective * uSpread * mix(1.0, 0.75, vLoose);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColorAlt;
  uniform float uGlow;
  uniform float uSpread;
  uniform float uOpacity;

  varying float vIntensity;
  varying float vSeed;
  varying float vLoose;
  varying float vTorn;

  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float distance = length(offset);
    if (distance > 0.5) discard;

    // Radio en unidades del núcleo, deshaciendo el margen que el vertex
    // shader reservó para el halo.
    float radius = distance * uSpread;

    // Núcleo duro + halo exponencial. El núcleo mantiene el punto definido
    // (requisito: puntos pequeños y legibles); el halo es el resplandor.
    float core = smoothstep(0.5, 0.14, radius);
    float halo = exp(-radius * 4.0) * uGlow;

    float alpha = clamp((core + halo) * vIntensity * uOpacity, 0.0, 1.0);
    vec3 tint = mix(uColor, uColorAlt, fract(vSeed * 7.31));

    // El punto disperso se enciende un poco: la nube se abre y pierde
    // densidad justo donde el cursor actúa, así que sin este realce el efecto
    // se leería como un agujero apagado en vez de como algo que se desarma.
    float lift = 1.0 + 0.6 * vLoose;

    // La banda arrancada se enciende: en una señal rota, el trozo desplazado
    // es el que pega el fogonazo.
    lift *= 1.0 + 0.5 * vTorn;

    gl_FragColor = vec4(tint * (0.65 + 0.35 * vIntensity) * lift, alpha);
  }
`;

export interface PointMaterialOptions {
  color: THREE.ColorRepresentation;
  /** Tamaño base en píxeles CSS, medido en el plano central del objeto. */
  size: number;
  /** Multiplicador del halo. 0 deja solo el núcleo. */
  glow: number;
  opacity: number;
  /** Amplitud de la onda, en unidades de escena. 0 congela la superficie. */
  wave: number;
  /** Peso del parpadeo, de 0 a 1. */
  twinkle: number;
}

export function createPointMaterial(options: PointMaterialOptions): THREE.ShaderMaterial {
  const base = new THREE.Color(options.color);
  // Segundo tono derivado del primero, no fijado a mano: así la variación
  // cromática sigue funcionando sea cual sea el color que reciba el componente.
  const alt = base.clone().offsetHSL(0.045, -0.08, 0.06);

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: options.size },
      // Lo fija la escena en cuanto conoce el encuadre de la cámara.
      uReference: { value: 1 },
      uPixelRatio: { value: 1 },
      // Margen para el halo. Con uGlow a 0 el punto es solo su núcleo.
      uSpread: { value: 1 + options.glow * 1.5 },
      // Dispersión: la textura de estado y el alcance los pone la escena.
      uState: { value: null },
      uScatter: { value: 0 },
      // Glitch: lo sincroniza la escena con el de la página.
      uGlitch: { value: 0 },
      uGlitchBands: { value: 1 },
      uGlitchSeed: { value: 0 },
      uWave: { value: options.wave },
      uTwinkle: { value: options.twinkle },
      uColor: { value: base },
      uColorAlt: { value: alt },
      uGlow: { value: options.glow },
      uOpacity: { value: options.opacity },
    },
    transparent: true,
    // Aditivo: los puntos que se solapan suman luz, que es como se comporta una
    // proyección. `depthWrite: false` evita que un punto tape a los de detrás y
    // deje agujeros negros en la nube.
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
}
