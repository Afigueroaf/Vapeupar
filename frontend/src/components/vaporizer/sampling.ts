import * as THREE from "three";

/**
 * Conversión de una superficie en una nube de puntos.
 *
 * El criterio de todo este archivo es uno: la silueta del vaporizador tiene que
 * seguir siendo reconocible. Dos consecuencias prácticas:
 *
 * 1. El muestreo es **proporcional al área**, no por triángulo. Un cilindro
 *    tiene 28 triángulos diminutos en la tapa y 28 enormes en el lateral; con
 *    un punto por triángulo saldrían dos coronas brillantes y un cuerpo vacío.
 * 2. Las **aristas** se muestrean aparte y con más brillo. Una nube uniforme
 *    sobre una superficie no dibuja bordes: el ojo pierde el contorno y el
 *    objeto se lee como una mancha. Los puntos de arista son los que devuelven
 *    la lectura de proyección holográfica.
 */

/** Grados a partir de los cuales dos caras cuentan como arista dura. */
const EDGE_THRESHOLD_DEG = 24;

/** Buffers listos para `BufferGeometry`. Un solo bloque por atributo. */
export interface PointCloudBuffers {
  position: Float32Array;
  /** Dirección de empuje de la onda. En aristas es la radial desde el centro. */
  normal: Float32Array;
  /** Multiplicador de tamaño por punto. */
  size: Float32Array;
  /** Brillo base. Las aristas van por encima de 1. */
  intensity: Float32Array;
  /** Semilla estable por punto: desfasa parpadeo y onda. */
  seed: Float32Array;
  /**
   * Hacia dónde sale despedido el punto cuando el cursor lo alcanza, y cuánto.
   *
   * Se sortea aquí y no en el shader porque tiene que ser **estable**: si la
   * dirección se recalculara cada fotograma el punto temblaría en vez de
   * desplazarse, y al retirar el cursor no volvería por donde salió.
   */
  scatter: Float32Array;
  count: number;
}

function allocate(count: number): PointCloudBuffers {
  return {
    position: new Float32Array(count * 3),
    normal: new Float32Array(count * 3),
    size: new Float32Array(count),
    intensity: new Float32Array(count),
    seed: new Float32Array(count),
    scatter: new Float32Array(count * 3),
    count,
  };
}

/**
 * Sortea la huida de un punto: dirección uniforme sobre la esfera y alcance
 * variable.
 *
 * El alcance desigual es lo que hace que la nube se **desarme** en lugar de
 * inflarse como un globo: unos puntos se van lejos y otros apenas se separan.
 */
function writeScatter(buffers: PointCloudBuffers, index: number): void {
  const z = Math.random() * 2 - 1;
  const angle = Math.random() * Math.PI * 2;
  const ring = Math.sqrt(1 - z * z);
  const reach = 0.2 + Math.random() * 0.8;

  buffers.scatter[index] = ring * Math.cos(angle) * reach;
  buffers.scatter[index + 1] = z * reach;
  buffers.scatter[index + 2] = ring * Math.sin(angle) * reach;
}

/**
 * Busca el primer índice cuyo acumulado supera `value`.
 *
 * Binaria y no lineal porque esto se ejecuta una vez por punto: con 30.000
 * puntos sobre 50.000 triángulos, el recorrido lineal serían 1.500 millones de
 * comparaciones y el hilo principal se quedaría clavado varios segundos.
 */
function pick(cumulative: Float64Array, value: number): number {
  let low = 0;
  let high = cumulative.length - 1;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] < value) low = mid + 1;
    else high = mid;
  }

  return low;
}

/**
 * Reparte `count` puntos sobre la superficie de la geometría, con densidad
 * proporcional al área.
 *
 * El acumulado de áreas convierte un número aleatorio en un triángulo, y las
 * coordenadas baricéntricas plegadas reparten uniformemente dentro de él.
 */
function sampleSurface(
  geometry: THREE.BufferGeometry,
  count: number,
  buffers: PointCloudBuffers,
  offset: number,
): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const triangles = Math.floor(position.count / 3);

  if (triangles === 0 || count <= 0) return;

  const cumulative = new Float64Array(triangles);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  let total = 0;
  for (let i = 0; i < triangles; i++) {
    a.fromBufferAttribute(position, i * 3);
    b.fromBufferAttribute(position, i * 3 + 1);
    c.fromBufferAttribute(position, i * 3 + 2);
    total += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
    cumulative[i] = total;
  }

  if (total <= 0) return;

  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const nc = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const tri = pick(cumulative, Math.random() * total);

    let u = Math.random();
    let v = Math.random();
    // Pliega la mitad exterior del cuadrado sobre el triángulo: reparto plano.
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;

    a.fromBufferAttribute(position, tri * 3);
    b.fromBufferAttribute(position, tri * 3 + 1);
    c.fromBufferAttribute(position, tri * 3 + 2);

    na.fromBufferAttribute(normal, tri * 3);
    nb.fromBufferAttribute(normal, tri * 3 + 1);
    nc.fromBufferAttribute(normal, tri * 3 + 2);

    const index = (offset + i) * 3;
    buffers.position[index] = a.x * w + b.x * u + c.x * v;
    buffers.position[index + 1] = a.y * w + b.y * u + c.y * v;
    buffers.position[index + 2] = a.z * w + b.z * u + c.z * v;

    na.multiplyScalar(w).addScaledVector(nb, u).addScaledVector(nc, v).normalize();
    buffers.normal[index] = na.x;
    buffers.normal[index + 1] = na.y;
    buffers.normal[index + 2] = na.z;

    buffers.size[offset + i] = 0.7 + Math.random() * 0.5;
    buffers.intensity[offset + i] = 0.3 + Math.random() * 0.24;
    buffers.seed[offset + i] = Math.random();
    writeScatter(buffers, index);
  }
}

/**
 * Reparte `count` puntos a lo largo de las aristas duras, con densidad
 * proporcional a la longitud de cada segmento.
 *
 * `EdgesGeometry` descarta las aristas entre caras casi coplanares, así que en
 * un cilindro de 28 lados no marca las 28 generatrices (ahí no hay borde que
 * ver) pero sí los dos aros de las tapas, que es la parte del contorno que el
 * ojo usa para situar el volumen.
 *
 * Devuelve cuántos puntos escribió: cero si el modelo no tiene aristas duras
 * (una esfera suave), y en ese caso el presupuesto se lo queda la superficie.
 */
function sampleEdges(
  geometry: THREE.BufferGeometry,
  count: number,
  buffers: PointCloudBuffers,
  offset: number,
): number {
  if (count <= 0) return 0;

  const edges = new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_DEG);
  const position = edges.getAttribute("position");
  const segments = position ? Math.floor(position.count / 2) : 0;

  if (segments === 0) {
    edges.dispose();
    return 0;
  }

  const cumulative = new Float64Array(segments);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  let total = 0;
  for (let i = 0; i < segments; i++) {
    a.fromBufferAttribute(position, i * 2);
    b.fromBufferAttribute(position, i * 2 + 1);
    total += a.distanceTo(b);
    cumulative[i] = total;
  }

  if (total <= 0) {
    edges.dispose();
    return 0;
  }

  const point = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const segment = pick(cumulative, Math.random() * total);

    a.fromBufferAttribute(position, segment * 2);
    b.fromBufferAttribute(position, segment * 2 + 1);
    point.lerpVectors(a, b, Math.random());

    const index = (offset + i) * 3;
    buffers.position[index] = point.x;
    buffers.position[index + 1] = point.y;
    buffers.position[index + 2] = point.z;

    // Las aristas no tienen normal propia (son el cruce de dos caras). La
    // radial desde el centro mantiene la onda coherente con la superficie.
    point.normalize();
    buffers.normal[index] = point.x;
    buffers.normal[index + 1] = point.y;
    buffers.normal[index + 2] = point.z;

    buffers.size[offset + i] = 1.0 + Math.random() * 0.4;
    buffers.intensity[offset + i] = 0.56 + Math.random() * 0.22;
    buffers.seed[offset + i] = Math.random();
    writeScatter(buffers, index);
  }

  edges.dispose();
  return count;
}

/**
 * Nube completa del dispositivo: superficie + refuerzo de contorno.
 *
 * `edgeShare` es la fracción del presupuesto que se va a las aristas. Por
 * debajo de ~0,15 el contorno deja de leerse; por encima de ~0,35 el objeto se
 * convierte en un alambrado y pierde volumen.
 */
export function sampleModel(
  geometry: THREE.BufferGeometry,
  count: number,
  edgeShare = 0.18,
): PointCloudBuffers {
  const buffers = allocate(count);

  const written = sampleEdges(geometry, Math.round(count * edgeShare), buffers, 0);
  sampleSurface(geometry, count - written, buffers, written);

  return buffers;
}

/**
 * Partículas ambientales: una corona dispersa alrededor del dispositivo.
 *
 * Viven en su propio buffer y nunca se mezclan con las de superficie. Así el
 * material puede darles menos brillo y menos tamaño, y la silueta no se
 * ensucia: si compartieran atributos habría que elegir un único presupuesto
 * visual para las dos cosas.
 */
export function sampleAmbient(count: number, innerRadius: number): PointCloudBuffers {
  const buffers = allocate(count);
  const direction = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // Dirección uniforme sobre la esfera. Sortear los dos ángulos por separado
    // amontonaría las partículas en los polos.
    const z = Math.random() * 2 - 1;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    direction.set(r * Math.cos(angle), z, r * Math.sin(angle));

    const distance = innerRadius * (1.25 + Math.random() * 0.95);

    const index = i * 3;
    buffers.position[index] = direction.x * distance;
    buffers.position[index + 1] = direction.y * distance * 0.85;
    buffers.position[index + 2] = direction.z * distance;

    buffers.normal[index] = direction.x;
    buffers.normal[index + 1] = direction.y;
    buffers.normal[index + 2] = direction.z;

    buffers.size[i] = 0.4 + Math.random() * 0.5;
    buffers.intensity[i] = 0.14 + Math.random() * 0.26;
    buffers.seed[i] = Math.random();
    writeScatter(buffers, index);
  }

  return buffers;
}

/** Monta los buffers en una `BufferGeometry` de puntos. */
export function toBufferGeometry(buffers: PointCloudBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.position, 3));
  geometry.setAttribute("aNormal", new THREE.BufferAttribute(buffers.normal, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(buffers.size, 1));
  geometry.setAttribute("aIntensity", new THREE.BufferAttribute(buffers.intensity, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(buffers.seed, 1));
  geometry.setAttribute("aScatter", new THREE.BufferAttribute(buffers.scatter, 3));

  return geometry;
}
