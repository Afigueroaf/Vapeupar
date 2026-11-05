/**
 * Contorno de la silueta de una foto.
 *
 * Lee el canal alfa de la imagen y devuelve el polígono que rodea a la parte
 * opaca, que es lo que `solid.ts` extruye para darle canto a la cara. Devuelve
 * números normalizados: ni three.js ni unidades de escena, solo la forma.
 *
 * POR QUÉ SE LEEN LOS PÍXELES Y NO SE APILAN LÁMINAS. El primer intento fue
 * apilar N copias de la foto separadas a lo largo de su normal, con recorte
 * binario, y dejar que el canto emergiera del apilado. En la cuenta salía
 * invisible —la separación entre láminas quedaba por debajo del píxel— y en
 * pantalla se veía justo lo que se quería evitar: capas. La cuenta ignoraba que
 * cada lámina lleva ADEMÁS su propio brillo, así que el canto no era un
 * degradado continuo sino treinta y dos escalones de un 4% sobre un píxel de
 * ancho cada uno. Un apilado se ve siempre; lo único que cambia es si se nota
 * por los huecos o por el sombreado.
 *
 * Así que el canto se construye: un sólido de verdad, con sus dos caras y su
 * pared lateral. Eso exige el contorno, y el contorno exige los píxeles.
 *
 * LO QUE ESTE CONTORNO NO DECIDE: el borde visible de la foto. Lo decide el alfa
 * de la textura, como siempre, porque ningún polígono trazado sobre unos cientos
 * de píxeles puede igualarlo. Aquí solo se traza por dónde va la PARED
 * (`solid.ts` lo reparte). Es lo que permite que el contorno sea aproximado sin
 * que el producto salga facetado, y que una silueta que no se pueda medir cueste
 * el canto y nunca un trozo de foto.
 *
 * LA LECTURA ES POSIBLE porque las fotos llegan por `/_next/image`, o sea del
 * mismo origen que el documento (`faces.ts` lo explica, y ya lo hacía por CORS
 * para las texturas). Desde otro origen el lienzo quedaría contaminado y
 * `getImageData` lanzaría; está contemplado, y entonces se cae al rectángulo.
 */

/**
 * Lado máximo de la máscara de trabajo, en píxeles.
 *
 * ES LO QUE MANDA EN LA FINURA DEL BORDE, y 192 era poco. El contorno sale de
 * esta máscara, así que su error se mide en píxeles DE ELLA: con 192 sobre una
 * foto de 700, cada píxel de máscara valía 3,6 del original y en pantalla entre
 * 2 y 3,6 del dispositivo. Sumado al escalón del trazado, el borde del producto
 * quedaba con unos cinco píxeles de dentado donde antes había el alfa suavizado
 * de la textura, que es liso.
 *
 * A 384 el píxel de máscara baja a menos de uno de pantalla y el dentado deja
 * de poder verse. Lo que cuesta es el etiquetado y el trazado sobre cuatro veces
 * más píxeles —del orden de unos pocos milisegundos por foto, una sola vez, al
 * cargarla—, y las fotos de línea del catálogo miden entre 220 y 1000 píxeles,
 * así que a 384 la mayoría se trabaja casi a tamaño nativo.
 */
const MASK_MAX = 384;

/** Alfa a partir del cual el píxel cuenta como parte del producto. */
const ALPHA_THRESHOLD = 128;

/**
 * Píxeles que se le comen a la máscara antes de trazar.
 *
 * METE LA PARED HACIA DENTRO, y hace falta. La pared recorre el contorno, y de
 * frente se proyecta como una línea justo en el borde del producto: si el
 * polígono se va un par de píxeles hacia fuera —y se va, porque es una
 * aproximación—, esa línea asoma por delante de la foto como un filo oscuro
 * alrededor del producto, visible sin girar nada.
 *
 * Comiéndole un píxel a la máscara el contorno queda garantizado por dentro del
 * alfa. Lo que cuesta es que, al girar, la pared arranca un píxel más adentro
 * del borde de la foto, que contra los catorce píxeles de ancho que llega a
 * tener la banda del canto no se aprecia.
 */
const EROSION = 2;

/**
 * Tolerancia de la simplificación, en píxeles de la máscara.
 *
 * Es el error que se le permite al polígono respecto al contorno trazado. Con
 * `MASK_MAX` a 384 un píxel de máscara queda por debajo de uno de pantalla, así
 * que 0,6 es medio píxel de pantalla: por debajo del umbral de lo visible, y aun
 * así recorta el contorno a unos cientos de vértices.
 *
 * Va DESPUÉS del suavizado, no antes. Simplificar primero congela la escalera en
 * los vértices que sobreviven y entonces ya no hay nada que suavizar.
 */
const SIMPLIFY_TOLERANCE = 0.6;

/**
 * Pasadas de suavizado del contorno.
 *
 * POR QUÉ HACE FALTA ADEMÁS DE LA RESOLUCIÓN: el trazado recorre centros de
 * píxel, así que su contorno es literalmente una escalera de peldaños de un
 * píxel, con esquinas de 90 y 45 grados. Subir la resolución hace los peldaños
 * más pequeños pero no deja de haberlos, y en un borde casi vertical —el costado
 * de un vaporizador— una escalera fina se lee como un borde tembloroso.
 *
 * Cada pasada es un corte de esquinas de Chaikin: sustituye cada vértice por dos
 * puntos a un cuarto y tres cuartos de sus aristas. Dos pasadas bastan para que
 * el peldaño desaparezca; más empiezan a redondear las esquinas de verdad del
 * producto, que sí tienen que estar.
 */
const SMOOTH_PASSES = 2;

/**
 * Fracción de opacidad por encima de la cual la foto se considera un
 * rectángulo.
 *
 * Es el caso de los JPEG —las fotos de respaldo de Unsplash— y de cualquier
 * foto de producto sobre fondo blanco sin recortar. No hay silueta que seguir:
 * el contorno ES el borde de la imagen, y decirlo con un `null` ahorra el
 * trazado y le ahorra a `solid.ts` un polígono de cuatro puntos mal medidos.
 */
const OPAQUE_FRACTION = 0.985;

/**
 * Tamaño mínimo de una mancha, en fracción de la zona opaca.
 *
 * Por debajo de esto la mancha no recibe geometría, o sea que no se dibuja. Son
 * motas: píxeles sueltos que el reescalado deja por encima del umbral de alfa,
 * una firma, el resto de un recorte mal hecho. Darles cuerpo llenaría la cara de
 * pelusas con grosor.
 */
const MIN_BLOB_FRACTION = 0.005;

/**
 * Tope de manchas a las que se da cuerpo.
 *
 * Una foto con decenas de manchas grandes no es una foto de producto, y cada una
 * cuesta su trazado, su triangulación y sus grupos de geometría. Las más grandes
 * son las que importan, y van ordenadas por tamaño.
 */
const MAX_BLOBS = 8;

export interface Silhouette {
  /**
   * Un contorno por MANCHA, en coordenadas del rectángulo de la imagen: x de
   * -0.5 a 0.5, y de -0.5 (abajo) a 0.5 (arriba), con el eje Y ya volteado a la
   * convención de la escena.
   *
   * VARIOS Y NO UNO, y es el motivo de que esto no sea un solo polígono:
   * `ECO-PRO.webp` trae DOS productos lado a lado, dos manchas separadas del
   * 61% y el 39% de la zona opaca. Con un único contorno se seguía solo la
   * mancha donde cayera el primer píxel opaco —la de la derecha, porque empieza
   * doce filas más arriba— y el otro producto se quedaba sin pared.
   *
   * Vacío cuando no se ha podido medir ninguna: entonces la cara se queda sin
   * canto, que es mejor que rodear el producto con uno inventado.
   */
  outlines: Array<Array<[number, number]>>;
  /**
   * La foto es opaca y su contorno ES el rectángulo de la imagen.
   *
   * Es el caso de los JPEG —las fotos de respaldo de Unsplash— y de cualquier
   * foto de producto sobre fondo sin recortar. Se marca en lugar de devolver el
   * rectángulo como contorno para que `solid.ts` distinga «esta foto es una
   * tarjeta» de «no he sabido medir esta silueta», que piden cantos distintos.
   */
  rectangular: boolean;
  /**
   * Color medio de la zona opaca, de 0 a 1 por componente.
   *
   * Es lo que tiñe la pared lateral: el canto de un objeto es del material del
   * objeto, y un gris fijo para todas las caras delata que no hay volumen.
   */
  tint: [number, number, number];
}

/** Lo que `THREE.Texture.image` acaba siendo con `TextureLoader`. */
type SourceImage = CanvasImageSource & { width: number; height: number };

/**
 * Trazado de Moore: recorre el borde de la mancha en la que cae el primer
 * píxel opaco y vuelve al punto de partida.
 *
 * Ocho vecinos, en sentido horario, empezando la búsqueda justo después de la
 * dirección por la que se ha entrado. Así el recorrido no se sale de la mancha
 * ni se queda atrapado en un istmo de un píxel de ancho, que es lo que le pasa
 * al trazado ingenuo de cuatro vecinos.
 */
function traceOutline(
  labels: Int32Array,
  blob: number,
  width: number,
  height: number,
  startX: number,
  startY: number,
): Array<[number, number]> | null {
  // Se comprueba la ETIQUETA y no el alfa: así el recorrido no puede saltar a
  // una mancha vecina que pase cerca, y cada producto da su propio contorno.
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === blob;

  // Los ocho vecinos en sentido horario, empezando por el este.
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const points: Array<[number, number]> = [[startX, startY]];
  let x = startX;
  let y = startY;
  // El píxel de partida es el primero de la mancha al barrer por filas, o sea el
  // más alto y, dentro de su fila, el más a la izquierda: lo que queda a su oeste
  // no es de la mancha. Entrar por ahí es lo que orienta el recorrido.
  let backtrack = 4;

  // Cada píxel del borde se visita unas pocas veces; el tope corta cualquier
  // recorrido que no cierre, en lugar de colgar el hilo principal.
  let guard = width * height * 4;

  while (guard-- > 0) {
    let moved = false;

    for (let step = 1; step <= 8; step++) {
      const direction = (backtrack + step) % 8;
      const nextX = x + dx[direction];
      const nextY = y + dy[direction];

      if (solid(nextX, nextY)) {
        // La nueva dirección de entrada es la contraria a la de salida.
        backtrack = (direction + 4) % 8;
        x = nextX;
        y = nextY;
        points.push([x, y]);
        moved = true;
        break;
      }
    }

    // Píxel aislado: no hay borde que recorrer.
    if (!moved) return null;

    if (x === startX && y === startY) {
      // El punto de partida ya está al principio de la lista.
      points.pop();
      break;
    }
  }

  return points.length >= 3 ? points : null;
}

/**
 * Come `amount` píxeles del borde de la máscara (erosión morfológica).
 *
 * Cuatro vecinos y no ocho: con ocho se comen también las diagonales y una pieza
 * fina —la boquilla de un vaporizador— adelgaza el doble de rápido por sus
 * esquinas.
 */
function erode(mask: Uint8Array, width: number, height: number, amount: number): Uint8Array {
  let current = mask;

  for (let pass = 0; pass < amount; pass++) {
    const next = new Uint8Array(current.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        if (current[pixel] !== 1) continue;

        // El borde de la imagen cuenta como relleno: un producto que llega al
        // canto de la foto —`one.webp` toca los cuatro— no tiene por qué perder
        // ahí su pared.
        const left = x === 0 || current[pixel - 1] === 1;
        const right = x === width - 1 || current[pixel + 1] === 1;
        const up = y === 0 || current[pixel - width] === 1;
        const down = y === height - 1 || current[pixel + width] === 1;

        if (left && right && up && down) next[pixel] = 1;
      }
    }

    current = next;
  }

  return current;
}

/**
 * Reparte la máscara en manchas conexas y devuelve, por cada una, su tamaño y el
 * píxel por el que empieza el trazado.
 *
 * Ocho vecinos, igual que el trazado: si el recorrido puede pasar por una
 * diagonal, dos píxeles unidos en diagonal tienen que ser la misma mancha. Con
 * cuatro vecinos un producto con una cintura fina se partiría en dos y cada
 * mitad recibiría su propio cuerpo.
 *
 * La inundación lleva pila explícita y no recursión: una mancha puede ser la
 * imagen entera, y eso son decenas de miles de píxeles de profundidad.
 */
function labelBlobs(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(mask.length).fill(-1);
  const blobs: Array<{ id: number; size: number; startX: number; startY: number }> = [];

  // Pila tipada con puntero, y no un array con `push`/`pop`. Cada píxel opaco
  // pasa por ella, así que en una máscara de 384 son más de cien mil
  // operaciones: con un array normal el etiquetado costaba unos 27 ms por foto
  // y es casi todo lo que cuesta medir una silueta. Nunca puede desbordarse,
  // porque un píxel se apila cuando se etiqueta y se etiqueta una sola vez.
  const stack = new Int32Array(mask.length);
  let top = 0;

  for (let seed = 0; seed < mask.length; seed++) {
    if (mask[seed] !== 1 || labels[seed] >= 0) continue;

    const id = blobs.length;
    const startX = seed % width;
    const startY = (seed - startX) / width;
    let size = 0;

    labels[seed] = id;
    stack[top++] = seed;

    while (top > 0) {
      const pixel = stack[--top];
      const x = pixel % width;
      const y = (pixel - x) / width;
      size++;

      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;

          const next = nextY * width + nextX;
          if (mask[next] === 1 && labels[next] < 0) {
            labels[next] = id;
            stack[top++] = next;
          }
        }
      }
    }

    blobs.push({ id, size, startX, startY });
  }

  return { labels, blobs };
}

/**
 * Suavizado de Chaikin sobre un contorno CERRADO.
 *
 * Cerrado importa: el último punto es vecino del primero, así que la pasada se
 * da en ciclo. Tratándolo como abierto quedaría un pico en la costura, justo
 * donde el trazado empezó.
 *
 * Cada pasada duplica los puntos. Los que sobran los quita la simplificación de
 * después, que es el orden correcto.
 */
function smooth(points: Array<[number, number]>, passes: number): Array<[number, number]> {
  let current = points;

  for (let pass = 0; pass < passes; pass++) {
    const next: Array<[number, number]> = [];

    for (let i = 0; i < current.length; i++) {
      const from = current[i];
      const to = current[(i + 1) % current.length];

      next.push([from[0] * 0.75 + to[0] * 0.25, from[1] * 0.75 + to[1] * 0.25]);
      next.push([from[0] * 0.25 + to[0] * 0.75, from[1] * 0.25 + to[1] * 0.75]);
    }

    current = next;
  }

  return current;
}

/** Distancia perpendicular del punto al segmento, al cuadrado. */
function squaredDistanceToSegment(
  point: [number, number],
  from: [number, number],
  to: [number, number],
): number {
  const vx = to[0] - from[0];
  const vy = to[1] - from[1];
  const lengthSquared = vx * vx + vy * vy;

  let t = 0;
  if (lengthSquared > 0) {
    t = ((point[0] - from[0]) * vx + (point[1] - from[1]) * vy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
  }

  const px = from[0] + t * vx - point[0];
  const py = from[1] + t * vy - point[1];
  return px * px + py * py;
}

/**
 * Simplificación de Douglas-Peucker.
 *
 * Con pila explícita y no por recursión: la recursión baja tanto como puntos
 * tenga el tramo en el peor caso, y el contorno de una máscara de 192 píxeles
 * de lado trae varios cientos.
 */
function simplify(points: Array<[number, number]>, tolerance: number): Array<[number, number]> {
  if (points.length < 3) return points;

  const toleranceSquared = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const pending: Array<[number, number]> = [[0, points.length - 1]];

  while (pending.length > 0) {
    const span = pending.pop();
    if (!span) break;
    const [first, last] = span;

    let worst = -1;
    let worstDistance = 0;

    for (let i = first + 1; i < last; i++) {
      const distance = squaredDistanceToSegment(points[i], points[first], points[last]);
      if (distance > worstDistance) {
        worstDistance = distance;
        worst = i;
      }
    }

    if (worst > 0 && worstDistance > toleranceSquared) {
      keep[worst] = 1;
      pending.push([first, worst], [worst, last]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

/**
 * Lee la silueta de la imagen.
 *
 * Devuelve `null` si no se puede medir —imagen sin dimensiones, sin lienzo 2D o
 * de otro origen—, y entonces quien llama se queda con el rectángulo.
 */
export function readSilhouette(image: SourceImage): Silhouette | null {
  try {
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(1, MASK_MAX / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(2, Math.round(sourceWidth * scale));
    const height = Math.max(2, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);

    const opaqueMask = new Uint8Array(width * height);
    let opaque = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let i = 0, pixel = 0; pixel < opaqueMask.length; pixel++, i += 4) {
      if (data[i + 3] < ALPHA_THRESHOLD) continue;

      opaqueMask[pixel] = 1;
      opaque++;
      red += data[i];
      green += data[i + 1];
      blue += data[i + 2];

      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (opaque === 0) return null;

    const tint: [number, number, number] = [
      red / opaque / 255,
      green / opaque / 255,
      blue / opaque / 255,
    ];

    // Foto opaca: el contorno es el rectángulo y no hay nada que trazar.
    if (opaque / opaqueMask.length > OPAQUE_FRACTION) {
      return { outlines: [], rectangular: true, tint };
    }

    // La erosión va ANTES del etiquetado: así una mancha que no sobreviva a
    // perder su píxel de borde —una mota de dos píxeles— desaparece aquí y no
    // llega a dar un contorno de tres puntos.
    const mask = erode(opaqueMask, width, height, EROSION);
    const { labels, blobs } = labelBlobs(mask, width, height);

    const outlines: Array<Array<[number, number]>> = [];
    const eroded = blobs.reduce((total, blob) => total + blob.size, 0);
    const chosen = blobs
      .filter((blob) => blob.size / Math.max(eroded, 1) >= MIN_BLOB_FRACTION)
      .sort((a, b) => b.size - a.size)
      .slice(0, MAX_BLOBS);

    for (const blob of chosen) {
      const traced = traceOutline(labels, blob.id, width, height, blob.startX, blob.startY);
      if (!traced) continue;

      // Suavizar y LUEGO simplificar: ver `SIMPLIFY_TOLERANCE`.
      const simplified = simplify(smooth(traced, SMOOTH_PASSES), SIMPLIFY_TOLERANCE);
      if (simplified.length < 3) continue;

      // A coordenadas del rectángulo de la imagen, con el eje Y volteado: en la
      // máscara la fila 0 es la de arriba y en la escena la Y crece hacia arriba.
      outlines.push(
        simplified.map(
          ([x, y]) => [(x + 0.5) / width - 0.5, 0.5 - (y + 0.5) / height] as [number, number],
        ),
      );
    }

    // Ninguna mancha ha dado un polígono utilizable: la cara se queda plana.
    // La foto se dibuja igual, que es lo que importa.
    return { outlines, rectangular: false, tint };
  } catch {
    // Lienzo contaminado por una imagen de otro origen, o un `drawImage` que no
    // acepta la fuente. El rectángulo sigue siendo una cara válida.
    return null;
  }
}
