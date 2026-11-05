import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Preparación de geometría para el muestreo de puntos.
 *
 * Todo lo que llega aquí (un GLB cargado o la silueta provisional) sale como
 * **una sola** `BufferGeometry` no indexada, centrada en el origen y escalada a
 * un tamaño conocido. El sistema de partículas no sabe de dónde vino: por eso
 * cambiar el modelo no obliga a tocar el muestreo ni el material.
 */

/** Arista mayor del modelo ya normalizado, en unidades de escena. */
const TARGET_SIZE = 2;

/**
 * Deja una geometría en el formato que `mergeGeometries` acepta: no indexada y
 * con exactamente los atributos `position` + `normal`.
 *
 * POR QUÉ NO INDEXADA: `mergeGeometries` falla si unas geometrías traen índice
 * y otras no, y un GLB arbitrario mezcla las dos formas. Convertirlo todo es la
 * única vía que no depende de cómo exportaron el modelo. Cuesta ~3x vértices,
 * pero es un cálculo único en CPU que nunca entra al bucle de render.
 *
 * POR QUÉ SE BORRAN LOS DEMÁS ATRIBUTOS: uv, color, skinIndex o tangentes no se
 * usan para muestrear, y basta con que un mesh del GLB no los tenga para que la
 * fusión se caiga.
 */
function prepare(source: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry | null {
  if (!source.getAttribute("position")) return null;

  const geometry = source.index ? source.toNonIndexed() : source.clone();

  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
  }

  geometry.applyMatrix4(matrix);
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  geometry.morphAttributes = {};

  return geometry;
}

/**
 * Funde todos los meshes de un subárbol en una geometría única en espacio de
 * mundo.
 *
 * El recorrido aplica `matrixWorld` de cada mesh: un GLB con jerarquía (piezas
 * rotadas o desplazadas respecto al nodo raíz) se aplana conservando su pose,
 * que es justo lo que hace falta para que la nube siga la forma real y no las
 * piezas apiladas en el origen.
 */
export function mergeSceneGeometry(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateWorldMatrix(true, true);

  const parts: THREE.BufferGeometry[] = [];

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const prepared = prepare(mesh.geometry, mesh.matrixWorld);
    if (prepared) parts.push(prepared);
  });

  if (parts.length === 0) return null;

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) for (const part of parts) part.dispose();

  return merged;
}

/**
 * Centra la geometría en el origen y la escala de forma **uniforme** hasta que
 * su arista mayor mide `TARGET_SIZE`.
 *
 * Escala uniforme, no por eje: deformar el vaporizador para que llene un cubo
 * lo haría irreconocible. Se devuelve el radio de la esfera envolvente porque
 * la cámara se coloca a partir de él; como el objeto rota alrededor de su
 * centro, ese radio no cambia durante la animación y por eso la rotación no
 * puede provocar recortes.
 */
export function normalizeGeometry(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return 1;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;

  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(TARGET_SIZE / largest, TARGET_SIZE / largest, TARGET_SIZE / largest);

  geometry.computeBoundingSphere();
  return geometry.boundingSphere?.radius ?? 1;
}

/**
 * Silueta provisional de vaporizador, por si `/models/vaporizer.glb` todavía no
 * existe.
 *
 * NO es decoración de relleno: tiene que pasar por el mismo muestreo que el
 * modelo real para que el hueco del hero se vea terminado antes de que llegue
 * el asset, y para que el día que llegue el único cambio sea dejar el archivo
 * en su sitio. Un dispositivo tipo pod: cuerpo de sección ovalada, boquilla,
 * anillo, visor y botón.
 */
export function createPlaceholderGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const matrix = new THREE.Matrix4();

  const push = (geometry: THREE.BufferGeometry, transform: THREE.Matrix4) => {
    const prepared = prepare(geometry, transform);
    geometry.dispose();
    if (prepared) parts.push(prepared);
  };

  // Cuerpo: cilindro aplastado en Z → sección ovalada, como un pod real.
  push(
    new THREE.CylinderGeometry(0.32, 0.32, 1.5, 28, 1, false),
    matrix.clone().makeScale(1, 1, 0.58),
  );

  // Boquilla, ligeramente cónica.
  push(
    new THREE.CylinderGeometry(0.16, 0.22, 0.32, 22, 1, false),
    matrix.clone().makeScale(1, 1, 0.6).setPosition(0, 0.9, 0),
  );

  // Anillo de separación entre pod y batería.
  push(
    new THREE.CylinderGeometry(0.338, 0.338, 0.06, 28, 1, false),
    matrix.clone().makeScale(1, 1, 0.585).setPosition(0, 0.26, 0),
  );

  // Visor del depósito, embebido en la cara frontal.
  push(
    new THREE.BoxGeometry(0.22, 0.52, 0.04),
    matrix.clone().makeTranslation(0, 0.56, 0.17),
  );

  // Botón de disparo.
  const button = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  button.setPosition(0, -0.1, 0.18);
  push(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18, 1, false), button);

  // Base.
  push(
    new THREE.CylinderGeometry(0.3, 0.26, 0.07, 28, 1, false),
    matrix.clone().makeScale(1, 1, 0.58).setPosition(0, -0.78, 0),
  );

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();

  return merged;
}
