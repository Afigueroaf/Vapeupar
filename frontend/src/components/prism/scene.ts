import * as THREE from "three";
import {
  FIT_PADDING,
  FIT_PADDING_COMPACT,
  HOVER_SCALE,
  PANEL_SEPARATION_COMPACT,
  faceAngle,
  fitDistance,
  prismLayout,
  type PrismLayout,
} from "./geometry";
import { GLITCH_MAX_SHIFT, readGlitchShift } from "@/lib/glitch";
import { createGhost } from "./ghost";
import { faceBody, type FaceBody } from "./solid";
import { readSilhouette } from "./silhouette";
import type { PrismFace } from "./faces";

/**
 * Motor del prisma de productos.
 *
 * Imperativo y sin React a propósito. El giro no es estado de la interfaz: es
 * un ángulo que cambia sesenta veces por segundo y que nadie fuera de este
 * archivo necesita leer. Pasarlo por `useState` provocaría un render por
 * fotograma, y por `useRef` daría el mismo código de aquí con el ruido de los
 * hooks encima. El componente de React (`stage.tsx`) se limita a montar esto y
 * a desmontarlo.
 *
 * El resto del 3D del proyecto usa React Three Fiber. Aquí no, porque lo que
 * hay —un bucle, un raycast y una cola de rotación— no se beneficia del
 * reconciliador, y traducirlo a `useFrame` era reescribir la lógica de giro,
 * que es justo la parte delicada.
 */

/** Campo de visión vertical, en grados. */
const FOV = 42;

/**
 * Delta máximo admitido por fotograma, en segundos.
 *
 * Al volver de una pestaña en segundo plano o de un salto del hilo principal,
 * el reloj entrega el hueco entero. Sin tope, el giro de reposo avanza esos
 * segundos de golpe y la pieza aparece dando un tirón. Con tope se pierde algo
 * de tiempo real y no se nota.
 */
const MAX_DELTA = 1 / 30;

/* --- Giro ---------------------------------------------------------------- */

/** Giro en reposo: una vuelta cada 24 segundos. */
const IDLE_TURN_PER_SECOND = (Math.PI * 2) / 24;
/** Tope de velocidad, en radianes por fotograma. */
const MAX_ANGULAR_VELOCITY = 0.016;
/** Fracción de velocidad que sobrevive a cada fotograma. */
const INERTIA = 0.94;
/** Velocidad máxima del seguimiento del cursor, en radianes por fotograma. */
const FOLLOW_MAX = 0.011;
/** Franja central donde el cursor no empuja: deja señalar una cara sin girarla. */
const FOLLOW_DEAD_ZONE = 0.05;
/** Con cuánta prontitud la velocidad alcanza a la que pide el cursor. */
const FOLLOW_RESPONSE = 0.22;
/** Radianes de giro por píxel arrastrado. */
const DRAG_SENSITIVITY = 0.0015;

/* --- Clic ---------------------------------------------------------------- */

/** Recorrido a partir del cual el gesto deja de ser un clic y pasa a ser arrastre. */
const CLICK_DRAG_THRESHOLD_PX = 8;
/** Cuánto se queda quieta la cara elegida antes de reanudarse el giro. */
const CLICK_LOCK_MS = 3000;
/** Tope de duración del centrado, por si la interpolación no converge. */
const SNAP_MAX_MS = 1200;
/** Prontitud del centrado. */
const SNAP_SPEED = 8;
/** Diferencia angular por debajo de la cual el centrado se da por terminado. */
const SNAP_EPSILON = 0.0008;

/* --- Resalte ------------------------------------------------------------- */

/** Prontitud de la transición de brillo y tamaño. */
const HOVER_LERP_SPEED = 8;
/** Brillo de las caras que no están señaladas. */
const DIMMED_BRIGHTNESS = 0.38;

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface PrismSceneOptions {
  faces: PrismFace[];
  /** Relación de aspecto de las caras (ancho / alto). */
  faceAspect: number;
  /** Tope de `devicePixelRatio` que se le permite al lienzo. */
  maxPixelRatio: number;
  /**
   * `false` con movimiento reducido: desaparecen el giro de reposo y el
   * seguimiento del cursor. El arrastre y el centrado al clic se mantienen,
   * porque los pide la persona.
   */
  animate: boolean;
  /** Rótulo del título. El motor le escribe texto y opacidad en cada fotograma. */
  label: HTMLElement | null;
}

export interface PrismSceneHandle {
  /** `false` detiene el bucle: fuera de pantalla no se gasta GPU ni batería. */
  setActive(active: boolean): void;
  dispose(): void;
}

/**
 * Encaje de la foto en la cara: proporción del panel que la CONTIENE entera.
 *
 * POR QUÉ NO SE RECORTA. Antes esto ajustaba `repeat` y `offset` de la textura
 * para cubrir la cara, el equivalente a `object-fit: cover`. Con fotos de
 * producto eso se come el producto: `one.webp` (LifePod ONE) mide 220x514, una
 * proporción de 0.43 contra los 0.75 de la cara, así que perdía el 43% del
 * alto —boquilla y base— y se veía como un recorte. Las cuadradas de 700x700
 * perdían un 25% por los lados. La tarjeta del catálogo ya resolvió lo mismo
 * con `object-contain` por esta razón (`product-card.tsx`), y aquí había
 * quedado la única superficie del sitio que recortaba.
 *
 * Contener en lugar de recortar se hace con la GEOMETRÍA, no con la textura:
 * el mapa se queda en 1:1 y es el panel el que se estrecha o se achata hasta
 * la proporción de la foto. Por la textura no se puede —`repeat` por debajo de
 * 1 amplía, y por encima de 1 sacaría los bordes fuera del rango, que con
 * `ClampToEdgeWrapping` se ven como el último píxel estirado—. Y el material
 * es transparente, así que un panel más pequeño que su cara deja ver el fondo
 * exactamente como el `contain` de CSS.
 *
 * Los números salen iguales a los del recorte anterior, aplicados al otro
 * lado: es el mismo factor, o reduciendo el panel o recortando el mapa. Y la
 * cara no es una superficie que haya que tapar —solo existe el cuerpo de la
 * foto—, así que un cuerpo más estrecho que su cara deja ver el fondo igual que
 * el `contain` de CSS.
 *
 * Devuelve `null` mientras la imagen no esté cargada: no hay proporción que
 * medir todavía, y el panel se queda a tamaño de cara hasta que la haya.
 */
function containFit(texture: THREE.Texture, faceAspect: number): THREE.Vector2 | null {
  const image = texture.image as { width?: number; height?: number } | undefined;
  if (!image?.width || !image?.height) return null;

  const sourceAspect = image.width / image.height;

  // Más apaisada que la cara: manda el ancho y el panel se achata.
  if (sourceAspect > faceAspect) {
    return new THREE.Vector2(1, faceAspect / sourceAspect);
  }
  // Más vertical: manda el alto y el panel se estrecha.
  return new THREE.Vector2(sourceAspect / faceAspect, 1);
}

export function createPrismScene(host: HTMLElement, options: PrismSceneOptions): PrismSceneHandle {
  const { faces, faceAspect, maxPixelRatio, animate, label } = options;

  /**
   * DOS GEOMETRÍAS, Y SOLO SE DIFERENCIAN EN LO RADIAL.
   *
   * En el hueco vertical del teléfono los paneles van un 20% más juntos
   * (`PANEL_SEPARATION_COMPACT`), que es la mitad de lo que hace que las fotos
   * se vean mayores allí. La elige `resize()` por la forma del hueco.
   *
   * Lo único que cambia entre las dos es `radialDistance` —y el `boundRadius`
   * que sale de ella—: alto, ancho de cara, radio del polígono, grosor y
   * ángulos son idénticos. De ahí que el resto del motor siga tirando de
   * `layout` sin preguntar cuál está puesta: lo que lee de él no depende de la
   * separación. Lo que sí depende son las posiciones de los paneles, y por eso
   * `resize()` las reescribe.
   */
  const layout: PrismLayout = prismLayout(faces.length, faceAspect);
  const compactLayout: PrismLayout = prismLayout(
    faces.length,
    faceAspect,
    PANEL_SEPARATION_COMPACT,
  );

  /* --- Lienzo ------------------------------------------------------------ */

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  // EN TÁCTIL O CON DPR ≥ 2, SIN MSAA NI GPU DEDICADA. Con densidad de píxel
  // alta el escalonado ya no se aprecia y el MSAA multiplica el coste de cada
  // píxel de un lienzo que se redibuja a 60 fps; y en un teléfono o una
  // tableta pedir `high-performance` no aporta nada y en portátiles con dos
  // GPU despierta la dedicada sin motivo.
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const denseScreen = (window.devicePixelRatio || 1) >= 2;

  const renderer = new THREE.WebGLRenderer({
    antialias: !coarsePointer && !denseScreen,
    // El negro lo pone la página: el lienzo se superpone a la banda de
    // confianza y a la nube de puntos de la intro, y un fondo opaco las taparía.
    alpha: true,
    powerPreference: coarsePointer ? "default" : "high-performance",
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  renderer.setClearColor(0x000000, 0);

  /*
    EL TAMAÑO CSS DEL LIENZO LO PONE CSS, NO three.js.

    `setSize(w, h, false)` —el `false` de la función de abajo— escribe los
    atributos `width`/`height` del lienzo en PÍXELES DE DISPOSITIVO y deja su
    estilo en blanco a propósito. Pero un `<canvas>` sin tamaño en CSS se
    maqueta a su tamaño intrínseco, que es justo el de esos atributos: con
    `devicePixelRatio` por encima de 1 el lienzo salía tantas veces más grande
    que su hueco como valiera la densidad, y el `overflow-hidden` del escenario
    se comía el resto. Medido en un teléfono de 390px con densidad 3 (el tope
    de `canvasDpr()` en puntero grueso es 1,5): hueco de 390x386 y lienzo de
    585x579, o sea que se veía el cuadrante de arriba a la izquierda y nada
    más. En escritorio, con densidad 1, los dos números coinciden y por eso
    allí nunca se notó.

    En porcentaje y una sola vez, en lugar de pasarle `true` a `setSize` y que
    three.js escriba píxeles en cada cambio de tamaño: así el lienzo sigue a su
    hueco aunque la maqueta cambie entre dos avisos del `ResizeObserver`. Es lo
    mismo que hace R3F con la nube de puntos de la intro, que por eso nunca
    tuvo este problema.

    `display: block` porque un `<canvas>` es en línea por defecto y arrastra el
    hueco del interlineado bajo la línea base: cuatro o cinco píxeles de barra
    negra al pie del escenario.
  */
  /**
   * Huella del glitch.
   *
   * El lienzo de la vitrina YA NO VA DENTRO DE UN BLOQUE CON `filter`: la
   * separación de canales la hace esta pieza, dentro de la escena. Ver
   * `ghost.ts` para el porqué y `trust-band.tsx` para el reparto del filtro CSS
   * en la banda.
   */
  const ghost = createGhost(renderer);

  /** Segundos vividos, solo para que las bandas de la huella se rebarajen. */
  let elapsed = 0;

  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";

  host.appendChild(renderer.domElement);

  /**
   * Geometría y encuadre que le tocan a un hueco de esta forma.
   *
   * LA CONDICIÓN ES LA FORMA DEL HUECO y no un punto de ruptura escrito aquí
   * en píxeles. Las dos cosas señalan hoy al mismo sitio —el escenario del
   * teléfono mide 390x640 (0,61) y la celda de escritorio 770x585 (1,32)— pero
   * la forma es la que explica el porqué: en un hueco más alto que ancho la
   * cota que manda es la del ancho, así que la pieza sobra de alto por
   * construcción y lo que se le quita a lo ancho —juntando los paneles y
   * dejando que los cantos se salgan— se convierte en tamaño. En uno apaisado
   * manda el alto, la silueta sí llega arriba y abajo, y tanto la separación
   * como la holgura se ganan su sitio: por eso escritorio se queda EXACTAMENTE
   * como estaba.
   *
   * Repetir aquí el `lg` de `trust-stage.tsx` habría obligado a mantener el
   * mismo número en dos sitios, que es justo lo que el resto de esta pieza
   * evita (ver el cierre del observador en `product-prism.tsx`).
   */
  function framingFor(aspect: number) {
    const vertical = aspect < 1;
    return {
      geometry: vertical ? compactLayout : layout,
      padding: vertical ? FIT_PADDING_COMPACT : FIT_PADDING,
    };
  }

  /**
   * Coloca los paneles a la distancia radial de la geometría que toque.
   *
   * ES UNA VARIABLE Y NO UNA FUNCIÓN porque `resize()` corre antes de que los
   * paneles existan —la primera llamada es la de aquí abajo, que deja la
   * cámara puesta antes de construir nada— y nombrar el array desde dentro
   * reventaría en esa primera pasada. Se rellena en cuanto los paneles están,
   * y hasta entonces no hay nada que recolocar.
   */
  let placePanels: ((geometry: PrismLayout) => void) | null = null;

  function resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;

    camera.aspect = width / height;
    const { geometry, padding } = framingFor(camera.aspect);

    camera.position.set(0, 0, fitDistance(geometry, FOV, camera.aspect, padding));
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);

    // Girar el teléfono cambia la forma del hueco, y con ella la separación:
    // los paneles tienen que mudarse, no solo la cámara.
    placePanels?.(geometry);
  }

  const startRect = host.getBoundingClientRect();
  resize(startRect.width, startRect.height);

  /* --- Paneles ----------------------------------------------------------- */

  const prismGroup = new THREE.Group();
  scene.add(prismGroup);

  const textureLoader = new THREE.TextureLoader();
  /** Una textura por URL: con menos productos que caras, las imágenes se repiten. */
  const textureCache = new Map<string, THREE.Texture>();

  /**
   * El cuerpo de cada foto, cacheado por URL.
   *
   * La geometría ya NO puede ser una sola para las seis caras: cada foto tiene
   * su silueta y su encaje, así que cada una da un cuerpo distinto. Lo que sí se
   * comparte es el cuerpo entre las caras que repiten la misma foto, que es el
   * caso de menos productos que caras.
   *
   * Se construye cuando la imagen llega, porque hasta entonces no hay ni alfa
   * que leer ni proporción que encajar.
   */
  const solidCache = new Map<string, { body: FaceBody; fit: THREE.Vector2 }>();

  /**
   * Geometría de arranque de los paneles.
   *
   * Un panel no puede existir sin geometría, y la suya no se conoce hasta que
   * carga su foto. Este triángulo degenerado le ocupa el sitio mientras tanto;
   * nunca se dibuja, porque el panel nace apagado.
   */
  const placeholder = new THREE.BufferGeometry();
  placeholder.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));

  /**
   * La cara: las dos tapas con la foto. Es el objeto que el bucle gira, escala y
   * atenúa, y del que cuelgan la pared y la superficie de selección.
   */
  const panels: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>> = [];

  /**
   * La pared lateral de cada cara, hija de su panel.
   *
   * MALLA APARTE Y NO OTRO GRUPO DE LA MISMA, porque los dos lados quieren
   * materiales incompatibles: la foto tiene que ser TRANSPARENTE para que su
   * borde sea el del alfa —liso, el de siempre— y la pared tiene que ser OPACA
   * para taparse bien con las demás caras. Siendo hija hereda el giro y el
   * crecimiento del resalte sin sincronizar nada.
   *
   * Su geometría puede quedarse en `null`: una foto cuya silueta no se ha podido
   * medir se dibuja plana, como antes de todo esto.
   */
  const walls: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>> = [];

  /**
   * Color base de la foto y de la pared de cada cara, en paralelo a `panels`.
   *
   * El bucle atenúa y resalta multiplicando, y el canto parte de un color ya
   * teñido con el del producto: sin guardar la base, el primer fotograma del
   * resalte se lo llevaría por delante y todos los cantos acabarían grises.
   */
  const baseColors: Array<[THREE.Color, THREE.Color]> = [];

  /**
   * Superficie de SELECCIÓN, una por cara. No se dibuja.
   *
   * POR QUÉ NO SE SEÑALA EL CUERPO DIRECTAMENTE. Lo primero es que señalar la
   * silueta no es lo que se quiere: un producto estrecho —un vaporizador de
   * 220x514— dejaría un área sensible de unos pocos píxeles de ancho y acertar
   * con el cursor sería un juego de habilidad. Lo segundo es el coste: el
   * raycast devuelve un acierto por cada triángulo que atraviesa y un contorno
   * simplificado trae decenas, cada uno con su objeto, su punto, su UV y su
   * normal recién creados; eso es basura por fotograma mientras el cursor está
   * encima, que es justo lo que el resto de este archivo se cuida de no generar
   * (ver los temporales del bucle).
   *
   * Un plano suelto del tamaño de la FOTO, a ras de la cara delantera del
   * cuerpo, resuelve las dos cosas. Va como hijo del panel, así que hereda su
   * posición y su giro sin que haya que sincronizar nada, y lleva el encaje en
   * su propia escala para que el área sensible sea el rectángulo de la foto.
   */
  const pickers: THREE.Mesh[] = [];
  const pickerGeometry = new THREE.PlaneGeometry(layout.faceWidth, layout.height);
  // De doble cara a propósito: así el reverso de una cara del otro lado del
  // prisma sigue registrando el acierto que luego descarta la prueba de la
  // normal en `pickPanel`, que es el comportamiento que ya había.
  const pickerMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  /**
   * Construye el cuerpo de una foto, o lo saca de la caché.
   *
   * EL ENCAJE SE HORNEA EN LA GEOMETRÍA en lugar de aplicarse como escala del
   * panel, que es lo que se hacía con el plano, y tiene que ser así: una escala
   * no uniforme deformaría también el canto —un producto estrecho tendría el
   * canto fino por arriba y grueso por los lados—, mientras que un cuerpo
   * construido ya a la medida de la foto tiene el mismo grosor por los cuatro
   * costados, que es lo que hace que se lea como un objeto.
   */
  function solidFor(image: string, texture: THREE.Texture) {
    const cached = solidCache.get(image);
    if (cached) return cached;

    const fit = containFit(texture, faceAspect);
    if (!fit) return null;

    const entry = {
      body: faceBody(
        readSilhouette(texture.image as CanvasImageSource & { width: number; height: number }),
        layout.faceWidth * fit.x,
        layout.height * fit.y,
        layout.bodyDepth,
      ),
      fit,
    };

    solidCache.set(image, entry);
    return entry;
  }

  /**
   * Da cuerpo y ENCIENDE todas las caras que comparten esa foto.
   *
   * Con menos productos que caras la misma foto va en varias, y la carga se
   * dispara una sola vez (`textureCache`): dar cuerpo solo a la cara que la pidió
   * dejaría a sus gemelas sin geometría, o sea apagadas para siempre.
   *
   * Las caras nacen apagadas y es esto lo que las enciende. Antes de la foto no
   * hay ni silueta que leer ni proporción que encajar, así que tampoco hay cuerpo
   * que dibujar; y si la imagen no llega —el optimizador devuelve 400 con un host
   * que no esté en `images.remotePatterns`— la cara se queda apagada, que es
   * mejor que un bloque blanco en la vitrina.
   */
  function revealTexture(image: string, texture: THREE.Texture) {
    const entry = solidFor(image, texture);
    if (!entry) return;

    faces.forEach((face, index) => {
      if (face.image !== image) return;

      // Guarda de orden: las texturas se piden mientras se crean los paneles, y
      // aunque el cargador siempre responde después del bucle, esto no depende
      // de que siga siendo así.
      const panel = panels[index];
      if (!panel) return;

      panel.geometry = entry.body.photo;
      baseColors[index][1].copy(entry.body.edgeColor);

      const wall = walls[index];
      wall.visible = entry.body.wall !== null;
      if (entry.body.wall) wall.geometry = entry.body.wall;

      pickers[index].scale.set(entry.fit.x, entry.fit.y, 1);
      panel.visible = true;
    });
  }

  faces.forEach((face, index) => {
    let texture = textureCache.get(face.image);

    if (!texture) {
      texture = textureLoader.load(
        face.image,
        (loaded) => revealTexture(face.image, loaded),
        undefined,
        () => console.error("[ProductPrism] no se pudo cargar la textura", face.image),
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      // Sin mipmaps: el panel se ve casi a tamaño nativo y nunca minificado en
      // la distancia, así que generarlos es un tercio más de memoria para nada.
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      textureCache.set(face.image, texture);
    }

    // Material "basic" y no "standard": la cara ES la foto, no una superficie a
    // la que haya que dar luz. Por eso la escena no tiene ninguna, y por eso el
    // volumen del canto se pinta (`solid.ts`) en lugar de iluminarse.
    //
    // TRANSPARENTE, que es lo que le devuelve el borde bueno. El borde visible
    // del producto vuelve a ser el alfa de la textura, suavizado por el propio
    // muestreo, en lugar del polígono de la silueta. Recortarlo con `alphaTest`
    // lo dejaría duro y escalonado para no ganar nada: el orden entre las seis
    // caras ya lo resolvía bien el reparto por distancia del motor, porque no se
    // atraviesan entre ellas.
    const faceMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const panel = new THREE.Mesh(placeholder, faceMaterial);

    // Apagada hasta que llegue la foto (`revealTexture`).
    panel.visible = false;

    // La pared: color plano y OPACA. Opaca se dibuja antes que las caras y
    // escribe profundidad, así que las fotos de delante la tapan y las de detrás
    // quedan tapadas por ella, sin depender de ningún orden.
    const edgeMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const wall = new THREE.Mesh(placeholder, edgeMaterial);
    wall.visible = false;
    panel.add(wall);
    walls.push(wall);

    baseColors.push([faceMaterial.color.clone(), edgeMaterial.color.clone()]);

    const picker = new THREE.Mesh(pickerGeometry, pickerMaterial);
    picker.visible = false;
    // A ras de la cara delantera del cuerpo. La escala del panel no toca la Z,
    // así que esta distancia no se mueve con el resalte.
    picker.position.z = layout.bodyDepth / 2;
    panel.add(picker);
    pickers.push(picker);

    // Cada panel, paralelo a la pared del prisma que le corresponde. El GIRO
    // se queda aquí porque no depende de la separación; la POSICIÓN sí, y la
    // pone `placePanels` justo debajo.
    panel.rotation.y = Math.PI / 2 - faceAngle(layout, index);

    prismGroup.add(panel);
    panels.push(panel);
  });

  placePanels = (geometry) => {
    panels.forEach((panel, index) => {
      const theta = faceAngle(geometry, index);
      panel.position.set(
        Math.cos(theta) * geometry.radialDistance,
        0,
        Math.sin(theta) * geometry.radialDistance,
      );
    });
  };

  // La primera colocación: `resize()` ya corrió, pero entonces no había
  // paneles que mover y su llamada se quedó sin efecto.
  placePanels(framingFor(camera.aspect).geometry);

  // Por si alguna textura llegara ya cargada: el cargador de imágenes siempre
  // responde de forma asíncrona, así que hoy esto no hace nada, pero deja de
  // depender de ese detalle para que las caras se enciendan.
  textureCache.forEach((texture, image) => {
    if ((texture.image as { width?: number } | undefined)?.width) revealTexture(image, texture);
  });

  /* --- Estado del puntero ------------------------------------------------ */

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  let pointerInside = false;
  let pointerDown = false;
  let lastX = 0;
  let downX = 0;
  let downY = 0;
  /** Posición del cursor, de -1 a 1, respecto al radio del prisma en pantalla. */
  let pointerNormX = 0;

  let hoveredIndex = -1;
  /** Panel detectado al pulsar, antes de que el bucle gire la pieza. */
  let pressedIndex = -1;
  /** Progreso de 0 a 1 del resalte de cada panel. */
  const hoverT = new Array<number>(layout.sides).fill(0);

  /* --- Estado del giro --------------------------------------------------- */

  let angularVelocity = 0;

  /**
   * Ángulo acumulado en Y. Se lleva aquí y NUNCA en `prismGroup.rotation.y`.
   *
   * three.js guarda la orientación como cuaternión y la descompone a ángulos de
   * Euler con un `asin()`, que solo cubre de -π/2 a π/2. Pasado ese cuarto de
   * vuelta, `rotation.x` y `rotation.z` saltan a π, y entonces escribir
   * `rotation.y` compone Rx(π)·Ry(θ)·Rz(π) en lugar del giro que se pedía: la
   * pieza se ve volcada. Fijando el cuaternión desde el eje y el ángulo, el
   * problema no llega a existir.
   */
  let yAngle = 0;

  let lockedIndex = -1;
  let lockEndsAt = 0;
  let snapping = false;
  let snapTarget = 0;
  let snapStartedAt = 0;

  /* --- Temporales del bucle ---------------------------------------------- */
  // Reservados una sola vez: crearlos dentro del bucle genera basura sesenta
  // veces por segundo, y el recolector se nota como tirones.

  const centerWorld = new THREE.Vector3();
  const centerNdc = new THREE.Vector3();
  const edgeWorld = new THREE.Vector3();
  const edgeNdc = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const hitNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  function updatePointerNDC(event: PointerEvent) {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Posición del cursor normalizada contra el RADIO DEL PRISMA en pantalla, no
   * contra el ancho del lienzo. Es lo que hace que el empuje se mida desde el
   * eje de la pieza y responda igual en un hueco estrecho que en uno ancho.
   */
  function updatePointerNorm(event: PointerEvent) {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    prismGroup.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);

    prismGroup.getWorldPosition(centerWorld);
    centerNdc.copy(centerWorld).project(camera);

    cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    edgeWorld.copy(centerWorld).addScaledVector(cameraRight, layout.radius);
    edgeNdc.copy(edgeWorld).project(camera);

    const centerX = (centerNdc.x * 0.5 + 0.5) * rect.width;
    const centerY = (-centerNdc.y * 0.5 + 0.5) * rect.height;
    const edgeX = (edgeNdc.x * 0.5 + 0.5) * rect.width;
    const edgeY = (-edgeNdc.y * 0.5 + 0.5) * rect.height;

    const radiusPx = Math.max(1, Math.hypot(edgeX - centerX, edgeY - centerY));
    pointerNormX = THREE.MathUtils.clamp((event.clientX - rect.left - centerX) / radiusPx, -1, 1);
  }

  /**
   * Panel bajo el cursor, o -1.
   *
   * Se señala contra las superficies de selección, no contra los cuerpos (ver
   * `pickers`). Son de doble cara, así que el rayo también acierta en las del
   * fondo que se ven por los huecos. La comprobación de la normal contra la
   * cámara descarta las que están de espaldas: señalar el reverso de una cara
   * que está al otro lado del prisma no es señalar esa cara.
   */
  function pickPanel(): number {
    prismGroup.updateWorldMatrix(true, true);
    raycaster.setFromCamera(pointerNDC, camera);

    const hits = raycaster.intersectObjects(pickers);
    if (hits.length === 0) return -1;

    const hit = hits[0];
    if (!hit.face) return -1;

    hitNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    toCamera.copy(camera.position).sub(hit.point).normalize();
    if (hitNormal.dot(toCamera) <= 0) return -1;

    const index = pickers.indexOf(hit.object as THREE.Mesh);
    // Las superficies de selección no se dibujan, así que el motor no las salta
    // por tener el panel apagado: una cara cuya foto no ha llegado se podría
    // señalar y rotular sin que se vea nada.
    return index >= 0 && panels[index].visible ? index : -1;
  }

  /* --- Eventos ----------------------------------------------------------- */

  function onPointerEnter(event: PointerEvent) {
    pointerInside = true;
    updatePointerNorm(event);
    updatePointerNDC(event);
  }

  function onPointerDown(event: PointerEvent) {
    // Botón secundario del ratón: eso es el menú contextual, no un gesto sobre
    // la pieza.
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;

    updatePointerNDC(event);
    pointerDown = true;
    lastX = event.clientX;
    downX = event.clientX;
    downY = event.clientY;

    // La captura mantiene el arrastre vivo cuando el puntero se sale del
    // lienzo. ES UNA MEJORA, NO UN REQUISITO, y puede fallar: el cursor táctil
    // (`components/touch-cursor.tsx`) despacha su secuencia de clic con un
    // identificador de puntero propio, que no es ningún puntero activo del
    // navegador, y ahí `setPointerCapture` lanza `NotFoundError`. Sin esta
    // guarda la excepción abortaba el manejador en esta misma línea, justo
    // antes de resolver el panel pulsado, así que desde un teléfono el toque
    // había dejado de centrar la cara.
    try {
      host.setPointerCapture(event.pointerId);
    } catch {
      // Sin captura el gesto sigue sirviendo mientras no abandone el lienzo, y
      // el cursor táctil nunca lo abandona: pulsa donde ya estaba señalando.
    }

    // El panel se resuelve AQUÍ y no al soltar: entre una cosa y otra el bucle
    // habrá girado el prisma, y bajo el cursor habría ya otro distinto.
    pressedIndex = pickPanel();
  }

  function onPointerMove(event: PointerEvent) {
    pointerInside = true;
    updatePointerNorm(event);
    updatePointerNDC(event);

    if (!pointerDown) return;

    angularVelocity = THREE.MathUtils.clamp(
      angularVelocity + (event.clientX - lastX) * DRAG_SENSITIVITY,
      -MAX_ANGULAR_VELOCITY,
      MAX_ANGULAR_VELOCITY,
    );
    lastX = event.clientX;
  }

  function onPointerUp(event: PointerEvent) {
    const dragged =
      Math.hypot(event.clientX - downX, event.clientY - downY) > CLICK_DRAG_THRESHOLD_PX;

    if (pointerDown && !dragged && pressedIndex >= 0) {
      // Para que el panel quede de frente (mirando a Z+) hace falta que su
      // ángulo menos el giro del grupo valga π/2.
      const target = faceAngle(layout, pressedIndex) - Math.PI / 2;

      // Camino corto desde el ángulo actual: sin esto, centrar la cara de al
      // lado podría dar la vuelta entera por el otro sentido.
      let delta = (target - yAngle) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;

      snapTarget = yAngle + delta;
      lockedIndex = pressedIndex;
      snapping = true;
      snapStartedAt = performance.now();
      angularVelocity = 0;
    }

    pointerDown = false;
    pressedIndex = -1;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
  }

  function onPointerOut(event: PointerEvent) {
    pointerInside = false;
    pointerNormX = 0;
    hoveredIndex = -1;
    pointerDown = false;
    pressedIndex = -1;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
  }

  host.addEventListener("pointerenter", onPointerEnter);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointerleave", onPointerOut);
  host.addEventListener("pointercancel", onPointerOut);

  const resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) resize(entry.contentRect.width, entry.contentRect.height);
  });
  resizeObserver.observe(host);

  /* --- Bucle ------------------------------------------------------------- */

  const timer = new THREE.Timer();
  timer.connect(document);

  let raf = 0;
  let running = false;

  function step() {
    raf = requestAnimationFrame(step);

    timer.update();
    const delta = Math.min(timer.getDelta(), MAX_DELTA);
    const frameScale = THREE.MathUtils.clamp(delta * 60, 0.2, 2.5);
    const damping = Math.pow(INERTIA, frameScale);
    const now = performance.now();

    if (snapping) {
      yAngle = THREE.MathUtils.lerp(yAngle, snapTarget, Math.min(SNAP_SPEED * delta, 1));

      // El tope de duración es un seguro: la interpolación se acerca al
      // objetivo de forma asintótica y, con fotogramas muy cortos, podría
      // rondar el umbral sin llegar a cruzarlo.
      if (Math.abs(yAngle - snapTarget) < SNAP_EPSILON || now - snapStartedAt > SNAP_MAX_MS) {
        yAngle = snapTarget;
        snapping = false;
        // Los 3 s empiezan con la cara YA centrada, no al soltar el clic.
        lockEndsAt = now + CLICK_LOCK_MS;
      }
      angularVelocity = 0;
    } else if (lockedIndex >= 0) {
      if (now >= lockEndsAt) lockedIndex = -1;
      angularVelocity = 0;
    } else {
      if (pointerDown) {
        // El arrastre ya ha fijado la velocidad en `onPointerMove`; aquí solo
        // se frena, para que la pieza no siga acelerando mientras se insiste.
        angularVelocity *= damping;
      } else if (animate && pointerInside) {
        const distance = Math.abs(pointerNormX);
        const reach =
          distance <= FOLLOW_DEAD_ZONE ? 0 : (distance - FOLLOW_DEAD_ZONE) / (1 - FOLLOW_DEAD_ZONE);
        // Exponente mayor que 1: cerca del centro el empuje es muy suave y solo
        // se vuelve decidido hacia los bordes.
        const target = -Math.sign(pointerNormX) * FOLLOW_MAX * Math.pow(reach, 1.4);

        angularVelocity = THREE.MathUtils.lerp(
          angularVelocity,
          target,
          Math.min(FOLLOW_RESPONSE * frameScale, 1),
        );
      } else if (animate) {
        angularVelocity = THREE.MathUtils.lerp(
          angularVelocity,
          IDLE_TURN_PER_SECOND * delta,
          0.14 * frameScale,
        );
      }
      // Con movimiento reducido y sin arrastre no se toca la velocidad: queda
      // solo la inercia de abajo, que es la continuación de un gesto humano.

      angularVelocity = THREE.MathUtils.clamp(
        angularVelocity,
        -MAX_ANGULAR_VELOCITY,
        MAX_ANGULAR_VELOCITY,
      );
      yAngle += angularVelocity;
      angularVelocity *= damping;
    }

    prismGroup.quaternion.setFromAxisAngle(Y_AXIS, yAngle);

    // El raycast va después del giro: las matrices que acaba de dejar el
    // cuaternión son las que se ven en este fotograma.
    hoveredIndex = pointerInside ? pickPanel() : -1;

    /* --- Resalte y rótulo ------------------------------------------------ */

    // La cara bloqueada por un clic manda sobre la que esté bajo el cursor: se
    // ha pedido verla, y el cursor pasando por encima no lo deshace.
    const focused = lockedIndex >= 0 ? lockedIndex : hoveredIndex;
    const lerp = Math.min(HOVER_LERP_SPEED * delta, 1);

    let maxHoverT = 0;
    let labelIndex = -1;

    for (let i = 0; i < panels.length; i++) {
      hoverT[i] = THREE.MathUtils.lerp(hoverT[i], i === focused ? 1 : 0, lerp);
      if (hoverT[i] > maxHoverT) {
        maxHoverT = hoverT[i];
        labelIndex = i;
      }
    }

    // Segunda pasada: el atenuado de las demás depende del resalte máximo del
    // fotograma, que no se conoce hasta terminar la primera.
    for (let i = 0; i < panels.length; i++) {
      const dimmed = THREE.MathUtils.lerp(1, DIMMED_BRIGHTNESS, maxHoverT);
      const brightness = THREE.MathUtils.lerp(dimmed, 1, hoverT[i]);

      // Los dos materiales de la cara, cada uno sobre su color base: el de la
      // foto es blanco y el del canto viene teñido, y multiplicar en lugar de
      // asignar es lo que mantiene el tinte mientras la cara se atenúa.
      panels[i].material.color.copy(baseColors[i][0]).multiplyScalar(brightness);
      walls[i].material.color.copy(baseColors[i][1]).multiplyScalar(brightness);

      // El encaje de la foto ya está horneado en la geometría, así que la escala
      // solo lleva el resalte. La Z se queda en 1: el canto mide lo mismo
      // señalado que en reposo, como el grueso de una pieza de verdad.
      const grow = 1 + (HOVER_SCALE - 1) * hoverT[i];
      panels[i].scale.set(grow, grow, 1);
    }

    if (label) {
      if (labelIndex >= 0 && maxHoverT > 0.01) {
        // El texto solo se escribe cuando cambia: asignar `textContent` en cada
        // fotograma invalidaría la maquetación del rótulo sesenta veces por
        // segundo aunque el valor fuese siempre el mismo.
        const title = faces[labelIndex].title;
        if (label.textContent !== title) label.textContent = title;
        label.style.opacity = String(Math.min(maxHoverT * 1.4, 1));
      } else {
        label.style.opacity = "0";
      }
    }

    renderer.render(scene, camera);

    /*
      La huella va encima de la escena ya dibujada, y el prisma acaba de girar
      su parte de este fotograma como cualquier otro: la animación principal no
      se interrumpe durante la ráfaga, el glitch solo se superpone.
    */
    elapsed += delta;
    ghost.draw(scene, camera, {
      shift: Math.min(readGlitchShift(), GLITCH_MAX_SHIFT),
      time: elapsed,
    });
  }

  return {
    setActive(active: boolean) {
      if (active === running) return;
      running = active;

      if (active) {
        // Sin esto, el primer delta tras la pausa sería todo el rato que la
        // pieza ha estado fuera de pantalla.
        timer.reset();
        step();
      } else {
        cancelAnimationFrame(raf);
      }
    },

    dispose() {
      running = false;
      cancelAnimationFrame(raf);

      resizeObserver.disconnect();
      host.removeEventListener("pointerenter", onPointerEnter);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointerleave", onPointerOut);
      host.removeEventListener("pointercancel", onPointerOut);

      timer.dispose();
      // Las geometrías van por foto y las de selección son una sola para todas,
      // así que se liberan desde sus propias colecciones y no una vez por panel,
      // que las repetiría.
      placeholder.dispose();
      solidCache.forEach((entry) => {
        entry.body.photo.dispose();
        entry.body.wall?.dispose();
      });
      solidCache.clear();
      pickerGeometry.dispose();
      pickerMaterial.dispose();
      panels.forEach((panel) => panel.material.dispose());
      walls.forEach((wall) => wall.material.dispose());
      textureCache.forEach((texture) => texture.dispose());
      textureCache.clear();

      ghost.dispose();
      renderer.dispose();
      // Un contexto WebGL vivo es un recurso contado (del orden de 8 a 16 por
      // pestaña) y el navegador no lo devuelve al quitar el lienzo del DOM.
      // Esta misma página ya mantiene otro abierto para la nube de puntos.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
