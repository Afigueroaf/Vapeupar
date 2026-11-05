import * as THREE from "three";
import type { Silhouette } from "./silhouette";

/**
 * El cuerpo de una cara: la foto y su canto.
 *
 * Son DOS GEOMETRÍAS, y el reparto es la decisión importante de este archivo:
 *
 * - `photo`: dos cuadriláteros, uno por cara, separados por el grosor. Llevan
 *   la foto con su alfa intacto.
 * - `wall`: la cinta que recorre el contorno de la silueta y une las dos caras.
 *   Lleva un color plano, el del canto.
 *
 * POR QUÉ SEPARADAS, que es lo que arregla el borde. El intento anterior extruía
 * el contorno con `ExtrudeGeometry` y la foto iba sobre las tapas de ese sólido,
 * así que EL BORDE VISIBLE DE LA FOTO ERA EL POLÍGONO. Y un polígono trazado
 * sobre una máscara de unos cientos de píxeles no puede competir con el alfa de
 * la textura: medido sobre las fotos del catálogo, sus aristas caían entre 10 y
 * 40 píxeles de pantalla, o sea una silueta facetada donde antes había un borde
 * liso. Apretar la tolerancia no lo arregla —el facetado baja, pero el borde
 * sigue siendo una aproximación de algo que ya se tenía exacto—.
 *
 * Con el reparto de arriba, el borde de la foto vuelve a ser el de la textura,
 * idéntico al de antes de todo esto, y el polígono solo decide por dónde va la
 * pared. Eso cambia a qué se expone un error del contorno: ya no deforma la
 * silueta del producto, solo el perfil de una banda oscura que se ve al girar.
 *
 * Y de paso: la foto ya no depende del contorno para dibujarse. Una silueta que
 * no se pueda medir, o una mancha que se pierda, cuesta la pared de esa zona,
 * nunca un trozo de producto.
 *
 * NO HAY TRIANGULACIÓN. Al no necesitar tapas recortadas desaparecen
 * `ExtrudeGeometry`, su generador de UV y sus grupos de material: una cinta
 * alrededor del contorno son dos triángulos por arista, y las tapas son dos
 * cuadriláteros.
 */

/**
 * Oscurecimiento del canto respecto al color medio del producto.
 *
 * La escena no tiene luces y el material es `basic` a propósito, así que el
 * volumen hay que pintarlo: una pared al mismo brillo que la cara deja la pieza
 * como un bloque plano de color, y demasiado oscura la deja flotando sobre el
 * fondo negro de la página sin que se vea el grueso.
 *
 * VA EN ESPACIO LINEAL, que es donde three guarda los colores. 0,22 lineal es
 * aproximadamente la mitad de brillo APARENTE: es la cuenta que importa, porque
 * el ojo compara la pared con la cara, no sus números. Un 0,55 lineal —que
 * parece medio— deja el canto al 76% de la cara y no se lee como canto.
 */
const EDGE_SHADE = 0.22;

/**
 * Suelo de brillo del canto, también lineal.
 *
 * Un producto negro sobre fondo transparente da un tinte casi negro, y el canto
 * se perdería contra el fondo de la página, que también es casi negro. Este
 * suelo —un gris apagado, en torno al 23% aparente— le garantiza que se vea.
 */
const EDGE_FLOOR = 0.045;

export interface FaceBody {
  /** Las dos caras planas, con la foto. */
  photo: THREE.BufferGeometry;
  /**
   * La pared lateral, o `null` cuando no hay silueta que recorrer y la cara se
   * queda plana como antes. Es el respaldo honesto: sin contorno fiable, mejor
   * sin canto que con un canto inventado alrededor del producto.
   */
  wall: THREE.BufferGeometry | null;
  /** Color base de la pared. */
  edgeColor: THREE.Color;
}

/** El rectángulo de la foto, para cuando la silueta ES el rectángulo. */
const RECTANGLE: Array<[number, number]> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

/**
 * Las dos tapas: la foto por delante y por detrás, separadas por el grosor.
 *
 * Mismas UV en las dos, que es lo que ya hacía el plano de doble cara al que
 * sustituyen: por detrás la foto se ve en espejo, igual que antes.
 */
function photoGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const face of [z, -z]) {
    const base = positions.length / 3;

    positions.push(-x, -y, face, x, -y, face, x, y, face, -x, y, face);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return geometry;
}

/**
 * La cinta de la pared: dos triángulos por cada arista del contorno.
 *
 * Sin UV y sin normales: su material es un color plano, así que no muestrea
 * textura, y `basic` no lee normales. El raycast tampoco la toca, porque señalar
 * va por su propia superficie (`scene.ts`).
 */
function wallGeometry(
  outlines: Array<Array<[number, number]>>,
  width: number,
  height: number,
  depth: number,
): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const indices: number[] = [];
  const z = depth / 2;

  for (const outline of outlines) {
    if (outline.length < 3) continue;

    for (let i = 0; i < outline.length; i++) {
      const from = outline[i];
      const to = outline[(i + 1) % outline.length];

      const ax = from[0] * width;
      const ay = from[1] * height;
      const bx = to[0] * width;
      const by = to[1] * height;

      const base = positions.length / 3;
      positions.push(ax, ay, -z, bx, by, -z, bx, by, z, ax, ay, z);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  if (indices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  return geometry;
}

/**
 * Construye el cuerpo de una foto.
 *
 * `width` y `height` son los del rectángulo que la foto ocupa DENTRO de la cara,
 * o sea el encaje ya resuelto por quien llama: los contornos vienen normalizados
 * de -0.5 a 0.5 y aquí se llevan a unidades de escena.
 */
export function faceBody(
  silhouette: Silhouette | null,
  width: number,
  height: number,
  depth: number,
): FaceBody {
  const photo = photoGeometry(width, height, depth);

  // Una foto opaca no tiene silueta que seguir: su canto es el del rectángulo,
  // o sea la tarjeta con grosor. Sin silueta medible, ninguna pared.
  const outlines = silhouette?.rectangular ? [RECTANGLE] : (silhouette?.outlines ?? []);
  const wall = wallGeometry(outlines, width, height, depth);

  const tint = silhouette?.tint;
  const edgeColor = new THREE.Color();

  if (tint) {
    // DECLARANDO EL ESPACIO, que no es un detalle. El tinte sale de
    // `getImageData`, o sea sRGB, y el constructor de `THREE.Color` toma sus
    // componentes como LINEALES: sin convertir, un verde de 0,71 en sRGB entra
    // como 0,71 lineal y se dibuja como un 0,86, así que el canto salía lavado
    // y desteñido en lugar de parecerse al producto. Lo mismo que ya declara la
    // textura con `SRGBColorSpace` en `scene.ts`.
    edgeColor.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
    edgeColor.multiplyScalar(EDGE_SHADE);
  } else {
    edgeColor.setRGB(EDGE_SHADE, EDGE_SHADE, EDGE_SHADE);
  }

  // El suelo se aplica a la LUMINANCIA y no canal a canal. Canal a canal
  // levantaría los que están bajos —el rojo de un verde, multiplicado por diez—
  // y el canto perdería el color del producto justo cuando más lo necesita:
  // subiendo el conjunto, el tono se conserva y solo cambia el brillo. Un
  // producto literalmente negro no tiene tono que conservar y cae al gris.
  const luminance = 0.2126 * edgeColor.r + 0.7152 * edgeColor.g + 0.0722 * edgeColor.b;
  if (luminance < EDGE_FLOOR) {
    if (luminance > 1e-3) {
      edgeColor.multiplyScalar(EDGE_FLOOR / luminance);
    } else {
      edgeColor.setRGB(EDGE_FLOOR, EDGE_FLOOR, EDGE_FLOOR);
    }
  }

  return { photo, wall, edgeColor };
}
