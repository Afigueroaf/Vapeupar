/**
 * Medidas del prisma.
 *
 * Todo lo que aquí se calcula son números puros: ni three.js ni DOM. El motor
 * (`scene.ts`) los consume para colocar los paneles y para encuadrar la cámara.
 *
 * El prisma en sí no se dibuja. Lo que se ve son N cuerpos sueltos, uno por
 * cara, flotando un poco por fuera de donde estaría la pared del sólido. El
 * prisma solo existe como la geometría que decide dónde va cada cuerpo y con qué
 * orientación.
 *
 * Cada cuerpo tiene grosor y una pared lateral que sigue la silueta de la foto;
 * de eso se ocupan `silhouette.ts` y `solid.ts`. Aquí solo se reserva su
 * profundidad, porque el encuadre tiene que contarla.
 */

/**
 * Alto del prisma, en unidades de escena.
 *
 * El valor concreto es indiferente: la cámara se aleja o se acerca hasta que la
 * pieza llena el lienzo (`fitDistance`), así que lo único que se ve en pantalla
 * son las PROPORCIONES. Se fija en 2 —el modelo canónico de three.js— en lugar
 * de arrastrar la escala calibrada a mano del original.
 */
const PRISM_HEIGHT = 2;

/**
 * Cuánto crece el panel bajo el cursor.
 *
 * Vive aquí y no en el motor porque el encuadre tiene que reservarle el sitio:
 * si la cámara ciñe la silueta en reposo, el panel se sale justo al señalarlo.
 */
export const HOVER_SCALE = 1.07;

/**
 * Grosor del cuerpo de cada cara, en fracción de su ancho.
 *
 * Vive aquí, con las demás medidas puras, porque la silueta que el encuadre
 * tiene que hacer caber ya no es la de un plano sin espesor: el cuerpo sobresale
 * media profundidad por delante de donde estaba el panel. Quien lo construye es
 * `solid.ts`.
 *
 * El 5,5% del ancho de la cara es el grueso de una tarjeta: se aprecia al girar
 * sin que la pieza pase de fotos con canto a cajas con una foto pegada.
 */
const BODY_DEPTH_RATIO = 0.055;

/** Holgura entre la silueta del prisma y el borde del lienzo. */
export const FIT_PADDING = 1.06;

/**
 * Encuadre del hueco vertical, que es el de móvil. POR DEBAJO DE 1 YA NO ES
 * HOLGURA: ES RECORTE.
 *
 * 0,8 quiere decir que a la silueta se le deja ocupar 1 / 0,8 = 1,25 veces el
 * ancho del lienzo, o sea que de la pieza se ve el 80% y el 20% restante se
 * sale por los lados. Se reparte solo: la cámara mira al eje del prisma, así
 * que lo que sobra se va mitad y mitad —10% por lado— y la pieza queda
 * centrada sin tener que corregir nada.
 *
 * SE RECORTA A PROPÓSITO, y es un cambio de criterio respecto a lo que había.
 * El encuadre cerrado dejaba la pieza ocupando el 38% del alto del lienzo
 * porque la silueta de un prisma de 6 caras es casi 2:1 y el hueco del
 * teléfono es 0,61:1: al ceñirla por el ancho, el alto sobra por construcción.
 * Apurar la holgura hasta 1 solo daba un 6%. Dejando que los extremos se
 * salgan, la pieza sube al 136% de su tamaño original y pasa a ocupar el 57%
 * del alto, que es lo que se buscaba.
 *
 * Lo que se pierde son los cantos de los paneles que en ese instante del giro
 * quedan de perfil contra el borde, no una cara de frente: la que mira al
 * visitante está en el centro y nunca se toca. En vertical no se corta nada
 * —la esquina más alta llega al 57% del medio lienzo—, así que el recorte es
 * solo lateral.
 */
export const FIT_PADDING_COMPACT = 0.8;

/**
 * Cuánto se despegan los paneles de la pared del sólido, en fracción de su
 * ancho.
 */
export const PANEL_SEPARATION = 1 / 3;

/**
 * La misma separación en el hueco vertical, un 20% menor.
 *
 * Juntar los paneles encoge la silueta sin encoger las fotos: el radio que la
 * cámara tiene que hacer caber baja de 2,008 a 1,916, y como en móvil la cota
 * que manda es la del ancho, todo lo que se recorta ahí se convierte en
 * tamaño. Es la mitad del aumento; la otra mitad la pone `FIT_PADDING_COMPACT`.
 *
 * El suelo de esto no es el gusto, es la geometría: en cuanto la separación
 * llega a cero los paneles tocan la pared y la pieza deja de leerse como
 * piezas sueltas girando en formación para parecer un cilindro con fotos
 * pegadas. Un 20% está lejos de ese punto.
 */
export const PANEL_SEPARATION_COMPACT = PANEL_SEPARATION * 0.8;

export interface PrismLayout {
  /** Número de caras. */
  sides: number;
  /** Alto del prisma y de cada panel. */
  height: number;
  /** Ancho de cada panel. Coincide con el lado del polígono. */
  faceWidth: number;
  /** Radio del polígono: centro a vértice. */
  radius: number;
  /** Distancia del centro a la que se sitúa cada panel. */
  radialDistance: number;
  /** Grosor del cuerpo de cada cara, a lo largo de su normal. */
  bodyDepth: number;
  /** Desfase angular del primer panel, para que una cara quede de frente. */
  baseTheta: number;
  /**
   * Radio de la esfera que envuelve a los paneles, incluido el crecimiento del
   * hover. Es lo que el encuadre tiene que hacer caber.
   */
  boundRadius: number;
}

/**
 * Deriva las medidas de un prisma de `sides` caras cuyos paneles tienen la
 * relación de aspecto `faceAspect` (ancho / alto).
 *
 * El ancho del panel ES el lado del polígono, y de ahí sale todo lo demás: el
 * radio es el que hace que N lados de esa medida cierren la figura. Hacerlo en
 * este orden —y no fijando el radio— garantiza que los paneles encajen sin
 * solaparse ni dejar hueco, sea cual sea el número de caras.
 */
export function prismLayout(
  sides: number,
  faceAspect: number,
  separation: number = PANEL_SEPARATION,
): PrismLayout {
  const height = PRISM_HEIGHT;
  const faceWidth = height * faceAspect;

  const radius = faceWidth / (2 * Math.sin(Math.PI / sides));
  /** Centro a mitad de lado: donde estaría la pared del sólido. */
  const apothem = radius * Math.cos(Math.PI / sides);

  /**
   * Cuánto se despegan los paneles de la pared, en fracción de su ancho. Es lo
   * que los hace leerse como piezas sueltas girando en formación y no como la
   * textura de un cilindro.
   */
  const radialDistance = apothem + faceWidth * separation;

  const bodyDepth = faceWidth * BODY_DEPTH_RATIO;

  return {
    sides,
    height,
    faceWidth,
    radius,
    radialDistance,
    bodyDepth,
    baseTheta: Math.PI / sides,
    // Esquina del cuerpo más alejada del eje. El crecimiento del hover afecta
    // al tamaño del panel pero no a su distancia al eje: la escala se aplica
    // alrededor del centro de la cara, no del centro del prisma. La media
    // profundidad sí cuenta: es cuanto la cara delantera del cuerpo se adelanta
    // respecto al plano donde estaba el panel.
    boundRadius: Math.hypot(radialDistance + bodyDepth / 2, (faceWidth / 2) * HOVER_SCALE),
  };
}

/** Ángulo, en radianes, al que mira el panel `index`. */
export function faceAngle(layout: PrismLayout, index: number): number {
  return layout.baseTheta + (index * Math.PI * 2) / layout.sides;
}

/**
 * Distancia de cámara a la que el prisma entra entero en un lienzo de esa
 * relación de aspecto.
 *
 * POR QUÉ EXISTE: el original tenía la cámara a una distancia fija, calibrada
 * para un lienzo que ocupaba el ancho de la pantalla. En un hueco más estrecho
 * esa misma cámara recorta la pieza por los lados. Aquí la distancia se
 * recalcula en cada cambio de tamaño, que es lo que hace al componente
 * responsive de verdad en lugar de responsive solo en el alto.
 *
 * Se resuelve por separado contra el alto y contra el ancho y se toma la
 * exigente de las dos: la vertical manda en una columna estrecha y la
 * horizontal en una banda apaisada.
 *
 * Las dos salen en cerrado, y conviene que así sea: una cota holgada —sumar el
 * radio a la distancia y dar la perspectiva por buena— deja la pieza ocupando
 * poco más de la mitad del hueco, porque la cara del fondo se proyecta mucho
 * menor que la de delante y la cuenta se hace con la grande.
 *
 * En los dos casos el punto crítico es la MISMA esquina del panel: la que está
 * a `boundRadius` del eje y a `halfHeight` del centro. Lo que cambia es dónde
 * la pilla el giro.
 *
 * `padding` LO ELIGE QUIEN LLAMA, y no esta función a partir de la relación de
 * aspecto, aunque hoy la regla sea justo esa. El encuadre es una cuenta y la
 * holgura es una decisión de diseño: dejándola en el sitio de la llamada se lee
 * de un vistazo qué hueco recibe cuál, en lugar de esconder dos encuadres
 * distintos detrás de un mismo nombre.
 */
export function fitDistance(
  layout: PrismLayout,
  fovDegrees: number,
  aspect: number,
  padding: number = FIT_PADDING,
): number {
  const tanHalfFov = Math.tan((fovDegrees * Math.PI) / 360);
  const r = layout.boundRadius;
  const halfHeight = (layout.height / 2) * HOVER_SCALE;

  /** Fracción del encuadre que se le deja ocupar a la silueta. */
  const limit = 1 / padding;

  // Ancho: para un punto que gira a radio `r`, la x proyectada es máxima
  // cuando el giro lo deja en sin(φ) = r/d, y entonces vale r/√(d²−r²).
  // Igualarlo al límite y despejar d da esto.
  const tanWidth = tanHalfFov * Math.max(aspect, 0.0001) * limit;
  const forWidth = r * Math.sqrt(1 + 1 / (tanWidth * tanWidth));

  // Alto: la y proyectada no depende del giro más que por la profundidad, así
  // que su máximo es cuando la esquina está lo más cerca posible, en z = r.
  const forHeight = r + halfHeight / (tanHalfFov * limit);

  return Math.max(forWidth, forHeight);
}
