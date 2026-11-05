"use client";

import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ProductPrism } from "@/components/product-prism";
import { CardField } from "@/components/ui/card-field";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/product";

/**
 * Lo que tarda el cajón en entrar o salir.
 *
 * Vive en JS y no en una clase `duration-*` porque el mismo número decide
 * cuánto tiempo hay que volver a medir el campo de las tarjetas: con dos
 * fuentes, una se queda corta y el campo se congela a mitad del recorrido.
 */
const SLIDE_MS = 320;

/** Destino de `aria-controls` del tirador. */
const PANEL_ID = "vp-garantias";

interface TrustStageProps {
  /**
   * Productos de los que el prisma saca sus caras. La selección ya viene hecha
   * de `app/page.tsx`; aquí solo se presta el hueco.
   */
  showcase: Product[];
  /** Las tres tarjetas de garantía, que las compone `TrustBand`. */
  children: ReactNode;
}

/**
 * Hueco de la banda de confianza: el prisma y las tres tarjetas.
 *
 * DOS COLOCACIONES, UN SOLO ÁRBOL. De `lg` para arriba es lo de siempre: dos
 * celdas de la rejilla, el prisma a la izquierda y las tarjetas a la derecha.
 * Por debajo las dos cosas se superponen —el prisma ocupa el hueco que antes
 * era de las tarjetas, y las tarjetas pasan a un cajón que entra desde el
 * borde derecho— porque en un teléfono no hay ancho que repartir y apilarlas
 * costaba unos 580px de scroll antes de llegar al catálogo.
 *
 * El cambio de colocación lo hace `lg:contents` en el escenario: con
 * `display: contents` el envoltorio no genera caja, así que su altura fija, su
 * recorte y su posicionamiento desaparecen y sus dos hijos pasan a ser celdas
 * de la rejilla de arriba. Es lo que permite que el mismo marcado sirva para
 * las dos, sin preguntar el ancho a JS: preguntarlo obligaría a elegir una
 * colocación en el servidor y a corregirla después de hidratar, con el salto
 * visible que eso trae.
 *
 * ESTO ES UN COMPONENTE DE CLIENTE, y lo es por tres cosas que necesitan
 * estado: la posición del cajón, parar el prisma cuando queda tapado y volver
 * a medir el campo de las tarjetas mientras se desliza.
 *
 * SIN JS EL CAJÓN NO ABRE. Las tarjetas están en el HTML —los rastreadores las
 * ven— pero quedan en `visibility: hidden`, que es lo que las saca del árbol de
 * accesibilidad y del tabulador cuando están fuera de pantalla. Se acepta
 * porque es el mismo trato que ya tienen el catálogo, el prisma y el modal +18.
 */
export function TrustStage({ showcase, children }: TrustStageProps) {
  const [open, setOpen] = useState(false);

  /**
   * Contador que fuerza una nueva medición del campo de tarjetas.
   *
   * POR QUÉ HACE FALTA. El campo es una sola imagen anclada al contenedor, y
   * cada tarjeta pinta la porción que le toca a partir de su posición medida
   * con `getBoundingClientRect`. Esa medida incluye la transformación, así que
   * un cajón desplazado con `translate` deja a sus tarjetas creyendo que están
   * fuera del campo: con `background-repeat: no-repeat`, lo que pintan es nada,
   * y las tarjetas entrarían planas, sin las rayas ni el lavado violeta.
   *
   * Midiendo en cada fotograma del recorrido, en cambio, sale el efecto que el
   * campo busca: la superficie se queda quieta y las tarjetas la recorren como
   * ventanas. Son tres rectángulos y seis variables por fotograma durante
   * 320ms, y solo cuando alguien toca el tirador.
   */
  const [slideTick, setSlideTick] = useState(0);
  const frame = useRef(0);
  const handle = useRef<HTMLButtonElement>(null);

  const trackSlide = useCallback(() => {
    // Dos fotogramas de propina: el último los recoge ya en reposo.
    const until = performance.now() + SLIDE_MS + 32;
    const step = () => {
      setSlideTick((tick) => tick + 1);
      frame.current = performance.now() < until ? requestAnimationFrame(step) : 0;
    };

    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const toggle = () => {
    setOpen((value) => !value);
    trackSlide();
  };

  const close = (event: KeyboardEvent<HTMLDivElement>) => {
    // Escape no es obligatorio en un desplegable —no es un modal—, pero el
    // cajón tapa la pieza de detrás y devolver el foco al tirador cuesta esto.
    if (event.key !== "Escape" || !open) return;
    setOpen(false);
    trackSlide();
    handle.current?.focus();
  };

  return (
    /*
      `h-full` y la fila `1fr`: la sección recibe su alto de la rejilla de
      `app/page.tsx`, que la iguala con la intro. Sin las dos, ese alto se
      quedaría en la sección y el contenido seguiría midiendo lo suyo, con el
      sobrante como hueco al pie. Con `h-full` la rejilla interior ocupa la
      sección entera, y con una fila `1fr` —alto ya definido, así que la
      fracción resuelve— esa altura llega a las dos celdas.

      LAS DOS SIN PREFIJO, y antes eran `lg:`. Ahora la rejilla de `page.tsx`
      iguala las dos bandas a todos los anchos, así que por debajo de `lg` hay
      un sobrante que repartir que antes no existía; sin `h-full` aquí, ese
      sobrante se quedaría como franja negra al pie de la banda en vez de
      llegar al escenario.

      `py-8` por debajo de `lg` en vez de los 40px de antes: en un teléfono
      cada píxel de esta banda es scroll hasta el catálogo.
    */
    <CardField
      watch={slideTick}
      className="mx-auto grid h-full max-w-vp grid-rows-[minmax(0,1fr)] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-x-16 lg:py-10 xl:px-10"
    >
      {/*
        EL ESCENARIO. Solo existe por debajo de `lg` (ver `lg:contents` arriba).

        A sangre (`-mx-4`) por dos razones: una pieza 3D de borde a borde se lee
        como escenario y no como ilustración metida en una columna, y el tirador
        del cajón puede quedar pegado al borde de la pantalla, que es donde el
        pulgar lo alcanza sin estirarse. El `overflow-hidden` es lo que recorta
        el cajón cuando está fuera: sin él habría barra horizontal.

        SIN ALTO PROPIO, y el de dónde le viene cambió. Antes se lo daba el
        cajón, que va en el flujo: el escenario medía lo que midieran las tres
        tarjetas, unos 386px en un teléfono. Ahora lo recibe de la fila `1fr`
        de arriba, que a su vez lo recibe de la rejilla de `page.tsx`, así que
        mide lo mismo que la intro —unos 674px útiles en una pantalla de
        390px— y el prisma, en posición absoluta, se lo queda entero.

        Lo que NO cambia es que no hay ningún número escrito a mano: el suelo
        lo sigue poniendo el contenido, porque la fila es `minmax(auto, 1fr)`
        y su mínimo son las tarjetas. Si algún día la intro adelgazara por
        debajo de ellas, la banda dejaría de encogerse ahí en vez de
        recortarlas.
      */}
      <div className="relative -mx-4 overflow-hidden sm:-mx-6 lg:contents">
        {/*
          Celda del prisma.

          Es un lienzo WebGL propio, aparte del de la portada: aquel cubre esta
          banda entera y dibuja el vaporizador anclado a la columna del hero,
          con los eventos de puntero desactivados. El prisma, en cambio, sí se
          arrastra y se pulsa, y vive dentro de esta celda, que es lo que
          delimita su área sensible. Los dos se superponen con fondo
          transparente y se ven a la vez.

          `xl:min-w-[var(--vp-lead)]` es lo que alinea las tarjetas con el
          vaporizador, y conviene saber por qué hace falta. Las dos bandas
          comparten `grid-cols-[1.1fr_0.9fr]`, pero eso NO basta para que
          resuelvan igual: en el hero la columna izquierda la estira el
          logotipo hasta 770px —más que su fracción— y la pista se congela ahí;
          la derecha queda como única flexible con factor 0.9, y por
          especificación un factor menor que 1 reparte solo esa proporción del
          espacio libre (0.9 x 622 = 559.8), dejando 62px sin usar antes del
          margen. La banda, cuyo prisma no tiene ancho propio, repartiría
          765.6 / 626.4 y empezaría la columna derecha 5px antes. Dándole a esta
          celda el mismo ancho mínimo que al texto del hero (`--vp-lead`), las
          dos rejillas pasan por el mismo camino y las columnas derechas salen
          idénticas: 1059 -> 1618 a 1920px.

          El `lg:min-h` queda como suelo para el caso de que la fila salga
          corta —por ejemplo si algún día la intro adelgaza—, porque una
          rendija es peor que una pieza pequeña. Hoy no actúa.
        */}
        <div className="absolute inset-0 lg:relative lg:inset-auto lg:min-h-[24rem] xl:min-w-[var(--vp-lead)]">
          <ProductPrism
            products={showcase}
            label="Vitrina 3D de productos destacados"
            className="absolute inset-0"
            // Tapado por el cajón no se ve, pero seguiría girando: el
            // observador de la pieza mide si está en pantalla, no si algo
            // opaco se le ha puesto encima.
            paused={open}
          />
        </div>

        {/*
          EL CAJÓN.

          `bg-background` no es decoración: es lo que cubre el prisma del todo
          —incluidos los huecos entre tarjetas, por donde el dedo llegaría al
          lienzo de detrás— que es lo que se pidió.

          VA EN EL FLUJO, no en posición absoluta. El desplazamiento es
          `translate`, que no toca el flujo: el hueco se queda reservado
          aunque el cajón esté fuera, así que la banda no cambia de alto al
          abrirlo y cerrarlo y el prisma de debajo tampoco se redimensiona.

          `h-full` Y `justify-center` SIN PREFIJO, que antes eran el alto
          natural de las tarjetas y `lg:justify-center`. Desde que el
          escenario mide lo que la intro, el cajón ya no lo llena solo con
          crecer: sin `h-full` tapaba la parte de arriba del prisma y dejaba
          el resto del lienzo al aire por debajo —visible, y además
          alcanzable con el dedo, que es justo lo que `bg-background` viene a
          evitar—. Con el alto completo vuelve a cubrirlo entero, y
          `justify-center` deja las tres tarjetas centradas en vez de
          apelotonadas arriba.

          `invisible` cuando está fuera, y no solo desplazado: un bloque
          desplazado fuera de un `overflow-hidden` sigue siendo tabulable y lo
          siguen leyendo los lectores de pantalla, y al enfocarlo el navegador
          arrastra el recorte. `visibility` se transiciona a saltos y el salto
          cae AL FINAL, así que al cerrarse el cajón se ve salir entero.
        */}
        <div
          id={PANEL_ID}
          onKeyDown={close}
          style={{ transitionDuration: `${SLIDE_MS}ms` }}
          className={cn(
            "relative z-10 flex h-full flex-col justify-center gap-3 bg-background px-4 py-4 pr-14 transition-[transform,visibility] ease-vp motion-reduce:transition-none",
            "sm:gap-4 sm:px-6 sm:pr-16",
            "lg:z-auto lg:mx-auto lg:w-3/4 lg:visible lg:translate-x-0 lg:gap-6 lg:bg-transparent lg:p-0",
            open ? "visible translate-x-0" : "invisible translate-x-full",
          )}
        >
          {children}
        </div>

        {/*
          EL TIRADOR. Un riel de 44px pegado al borde derecho, que es el mínimo
          que pide un objetivo táctil, y 96px de alto para que se vea como una
          pestaña y no como un botón perdido.

          Se queda donde está al abrirse, con la flecha girada: mover el
          tirador al otro lado obligaría a buscarlo dos veces, y el cajón
          reserva `pr-14` para que ninguna tarjeta quede debajo.

          El nombre accesible es fijo y el estado lo da `aria-expanded`, que es
          lo que un lector de pantalla anuncia como «contraído» o «expandido».
          Una flecha sola no dice qué hay dentro, de ahí el nombre.
        */}
        <button
          ref={handle}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={PANEL_ID}
          aria-label="Garantías de compra"
          className="absolute right-0 top-1/2 z-20 flex h-24 w-11 -translate-y-1/2 items-center justify-center border-2 border-r-0 border-muted bg-surface text-action transition-colors duration-150 ease-vp hover:border-line lg:hidden"
        >
          <ChevronLeft
            aria-hidden="true"
            className={cn("size-5 transition-transform duration-200 ease-vp", open && "rotate-180")}
          />
        </button>
      </div>
    </CardField>
  );
}
