"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ProductPrism } from "@/components/product-prism";
import { PixelLabel } from "@/components/ui/pixel-label";
import { CardField } from "@/components/ui/card-field";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/product";

/**
 * Lo que tarda el panel de información en entrar o salir.
 *
 * Largo a propósito: es un cambio de escena, no un desplegable. Con 1,4 s y la
 * curva sinusoidal de `--ease-vp-slide` el panel arranca y se posa despacio,
 * y casi todo el recorrido se ve en movimiento en vez de en los extremos.
 * Vive en JS y no en una clase `duration-*` porque el mismo número decide
 * cuándo se puede parar el prisma: si se parase antes de quedar tapado del
 * todo, se vería congelarse mientras el panel todavía lo está cubriendo.
 */
const SLIDE_MS = 1400;

/** Destino de `aria-controls` del tirador INFO. */
const PANEL_ID = "vp-informacion";

/** Nombres de las dos escenas, para `aria-labelledby`. */
export const SHOWCASE_TITLE_ID = "vp-destacados-titulo";
const INFO_TITLE_ID = "vp-informacion-titulo";

/** Marca de los tiradores, para encontrar el visible al mover el foco. */
const TAB_ATTRIBUTE = "data-stage-tab";

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
 * Escenario dual de la portada: vitrina 3D e información de compra.
 *
 * DOS ESCENAS EN LA MISMA CELDA. La de partida es la vitrina —título
 * «Productos destacados» y el prisma—; la otra, «Información», trae las tres
 * tarjetas de garantía y entra deslizándose desde el borde derecho POR ENCIMA
 * del prisma. Antes las tarjetas compartían la banda con el prisma, al lado en
 * escritorio y en un cajón en móvil, y la sección no tenía un único tema que
 * poner en el título.
 *
 * Las dos escenas se apilan en la misma celda de una rejilla (`col-start-1
 * row-start-1`) y no con `absolute`: así el escenario mide lo que mida la más
 * alta. En un teléfono en vertical las tres tarjetas apiladas pueden pedir más
 * alto que la vitrina, y con el panel en posición absoluta se habrían
 * recortado.
 *
 * LOS TIRADORES. `INFO ▶` en el borde derecho de la vitrina, `◀ VOLVER` en el
 * izquierdo de la información; texto en vertical, a ras del borde de la
 * pantalla. Cada uno viaja con su escena, de modo que el panel que entra trae
 * su tirador y tapa el otro: es el mismo gesto en los dos sentidos.
 *
 * Su altura cambia con la orientación, no con el ancho:
 *
 * - en vertical, a la altura del título de la escena (en la cabecera);
 * - en horizontal, a media altura del área del prisma (en el cuerpo).
 *
 * Son dos posiciones que no se resuelven moviendo un solo nodo con CSS, así
 * que cada escena pinta su tirador dos veces y oculta uno con `portrait:hidden`
 * o `landscape:hidden`. `display: none` lo saca también del tabulador y del
 * árbol de accesibilidad, de modo que nunca hay dos a la vez. Las cabeceras de
 * las dos escenas tienen el mismo alto fijo (`min-h-28`, el del tirador), y es
 * lo que garantiza que INFO y VOLVER caigan exactamente a la misma altura
 * aunque un título ocupe dos líneas y el otro una.
 *
 * SIN JS NO HAY INFORMACIÓN. Las tarjetas están en el HTML —los rastreadores
 * las ven— pero el panel queda en `visibility: hidden`. Es el mismo trato que
 * ya tienen el catálogo, el prisma y el modal +18.
 */
export function TrustStage({ showcase, children }: TrustStageProps) {
  const [open, setOpen] = useState(false);

  /**
   * Si el panel ya cubre el prisma del todo.
   *
   * No es lo mismo que `open`: al abrir, el prisma sigue a la vista durante
   * todo el deslizamiento y tiene que seguir girando; solo se para cuando el
   * panel termina de taparlo. Al cerrar se reanuda en el acto, antes de que se
   * le vea asomar.
   */
  const [covered, setCovered] = useState(false);

  const showcaseRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  /** Si ya hubo un cambio de escena. En el montaje el foco no se toca. */
  const switched = useRef(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setCovered(true), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  /*
    EL FOCO PASA AL TIRADOR DE LA ESCENA NUEVA. El que se acaba de pulsar queda
    en una escena `inert`, y un foco dentro de un subárbol inerte se pierde al
    `body`: quien navega con teclado tendría que volver a recorrer la página
    entera para encontrar VOLVER.

    `preventScroll` es obligatorio: el panel está a medio camino, dentro de un
    contenedor recortado, y sin él el navegador intentaría desplazar la página
    para enseñar un botón que de todos modos ya está llegando.
  */
  useEffect(() => {
    if (!switched.current) return;
    const scene = open ? infoRef.current : showcaseRef.current;
    const tab = Array.from(
      scene?.querySelectorAll<HTMLButtonElement>(`[${TAB_ATTRIBUTE}]`) ?? [],
    ).find((node) => node.getClientRects().length > 0);
    tab?.focus({ preventScroll: true });
  }, [open]);

  const show = (next: boolean) => {
    switched.current = true;
    setOpen(next);
    if (!next) setCovered(false);
  };

  const onInfoKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) show(false);
  };

  return (
    /*
      `h-full`: la sección recibe su alto de la rejilla de `app/page.tsx`, que
      la iguala con la intro, y sin él ese alto se quedaría en la sección. La
      fila implícita de la rejilla se estira hasta él, y las dos escenas con
      ella.

      `overflow-clip` y no `overflow-hidden`: el panel fuera de pantalla está
      desplazado con `translate`, y eso cuenta como desbordamiento
      desplazable. Con `hidden` el contenedor no muestra barra pero sí se
      puede desplazar por programa —lo hace el navegador al enfocar algo de
      dentro—, y con `clip` no.
    */
    <div className="relative grid h-full overflow-clip">
      {/* ESCENA 1 — VITRINA */}
      <div
        ref={showcaseRef}
        inert={open}
        // `isolate`: los tiradores llevan `z-20` para quedar sobre el lienzo,
        // y sin contexto de apilamiento propio ese número competía con el
        // `z-10` del panel de información y el tirador INFO se quedaba
        // flotando encima de la escena que debería taparlo.
        className="isolate col-start-1 row-start-1 flex flex-col"
      >
        <StageHeader
          id={SHOWCASE_TITLE_ID}
          tag="[ VITRINA ]"
          title="Productos destacados"
          side="right"
          tab={
            <StageTab
              side="right"
              label="Info"
              onClick={() => show(true)}
              aria-expanded={open}
              aria-controls={PANEL_ID}
              placement="header"
            />
          }
        />

        <div className="relative min-h-[18rem] flex-1">
          {/*
            El prisma, dentro de la columna de la página en escritorio y a
            sangre en móvil (`max-w-vp` solo actúa cuando hay ancho de sobra).
            Va en posición absoluta porque el motor mide su caja con un
            `ResizeObserver` y necesita un alto definido, que una caja en el
            flujo de una columna flexible no tiene.

            Es un lienzo WebGL propio, aparte del de la portada: aquel cubre esta
            banda entera y dibuja el vaporizador anclado a la columna del hero,
            con los eventos de puntero desactivados. Los dos se superponen con
            fondo transparente y se ven a la vez.
          */}
          <div className="absolute inset-x-0 top-0 bottom-10 mx-auto max-w-vp sm:bottom-16">
            <ProductPrism
              products={showcase}
              label="Vitrina 3D de productos destacados"
              className="absolute inset-0"
              // Tapado por el panel no se ve, pero seguiría girando: el
              // observador de la pieza mide si está en pantalla, no si algo
              // opaco se le ha puesto encima.
              paused={covered}
            />
          </div>

          <StageTab
            side="right"
            label="Info"
            onClick={() => show(true)}
            aria-expanded={open}
            aria-controls={PANEL_ID}
            placement="body"
          />
        </div>
      </div>

      {/*
        ESCENA 2 — INFORMACIÓN.

        `bg-background` no es decoración: es lo que tapa el prisma del todo,
        incluidos los huecos entre tarjetas, por donde el dedo llegaría al
        lienzo de detrás.

        `invisible` cuando está fuera, y no solo desplazado: un bloque fuera de
        un recorte sigue siendo tabulable y lo siguen leyendo los lectores de
        pantalla. `visibility` se transiciona a saltos, y el salto cae al
        principio al abrir y al final al cerrar, así que el panel se ve entrar
        y salir entero. `inert` cubre el tramo del cierre, en el que todavía es
        visible pero ya no es la escena activa.
      */}
      <div
        ref={infoRef}
        id={PANEL_ID}
        role="region"
        aria-labelledby={INFO_TITLE_ID}
        inert={!open}
        onKeyDown={onInfoKeyDown}
        style={{ transitionDuration: `${SLIDE_MS}ms` }}
        className={cn(
          "relative z-10 col-start-1 row-start-1 flex flex-col bg-background",
          // `translate` y no `transform`: en Tailwind v4 `translate-x-*` escribe
          // la propiedad `translate`, y una transición de `transform` no la
          // anima. Con `transform` el panel saltaba de golpe.
          "transition-[translate,visibility] ease-vp-slide motion-reduce:transition-none",
          open ? "visible translate-x-0" : "invisible translate-x-full",
        )}
      >
        <StageHeader
          id={INFO_TITLE_ID}
          tag="[ INFO ]"
          title="Información"
          side="left"
          tab={
            <StageTab
              side="left"
              label="Volver"
              onClick={() => show(false)}
              placement="header"
            />
          }
        />

        {/*
          EN HORIZONTAL EL RELLENO ES SIMÉTRICO, y no solo abajo: el tirador
          VOLVER se centra en el alto de este bloque (`top-1/2`), y las
          tarjetas se centran en el del `CardField`. Con 64 px solo abajo, el
          centro de la fila quedaba 32 px por encima del de VOLVER. Con el
          mismo relleno arriba y abajo los dos centros coinciden.
        */}
        <div className="relative flex flex-1 flex-col portrait:pb-10 sm:portrait:pb-16 landscape:py-6">
          {/*
            Las tarjetas: apiladas en vertical, en fila en horizontal.

            El campo de fondo continuo va en este contenedor, que viaja con el
            panel: las tarjetas no se mueven respecto a él durante el
            deslizamiento, así que basta con la medición por cambio de tamaño
            que el campo ya hace solo. Ver `.vp-card` en `globals.css` y
            `ui/card-field.tsx`.

            EN VERTICAL, EL ANCHO DEL PRISMA. La columna de tarjetas ocupa el
            mismo ancho que el hueco del prisma de la vitrina —de borde a borde
            de la pantalla—, con solo el margen de 16 px por lado que piden el
            borde y la sombra dura para verse. Antes reservaba 64 px a la
            izquierda para VOLVER, pero en vertical ese tirador vive en la
            cabecera, no a la altura de las tarjetas: era hueco perdido y
            descentraba la columna respecto al prisma.

            En horizontal el margen sí deja sitio a VOLVER, a los dos lados
            para que la fila siga centrada. Desde `xl` la columna de la página
            ya queda lejos del borde y vuelve al margen de las demás secciones.
          */}
          <CardField
            className={cn(
              "mx-auto flex w-full max-w-vp flex-1 flex-col justify-center gap-8 pl-3.5 pr-[1.125rem] sm:gap-4 sm:pl-[1.375rem] sm:pr-[1.625rem]",
              "landscape:grid landscape:grid-cols-3 landscape:content-center landscape:gap-6 lg:landscape:gap-3 landscape:px-16 xl:landscape:px-10",
            )}
          >
            {children}
          </CardField>

          <StageTab
            side="left"
            label="Volver"
            onClick={() => show(false)}
            placement="body"
          />
        </div>
      </div>
    </div>
  );
}

interface StageHeaderProps {
  id: string;
  /** Etiqueta pixel sobre el título, como en el resto de secciones. */
  tag: string;
  title: string;
  /** Lado del tirador, para reservarle el hueco junto al título. */
  side: "left" | "right";
  /** Tirador de la cabecera, el que se ve en vertical. */
  tab: ReactNode;
}

/**
 * Cabecera de una escena.
 *
 * Etiqueta pixel y título, con los mismos tamaños y separaciones que el
 * catálogo y las preguntas frecuentes (`py-section`, 64 px, repartido entre la cabecera y
 * el pie del cuerpo, `mt-4` entre etiqueta y título).
 *
 * El alto mínimo es el del tirador (`min-h-28`) y el bloque va centrado en él.
 * Que las dos cabeceras midan lo mismo es lo que deja a INFO y VOLVER a la
 * misma altura, en vertical porque los dos viven aquí y en horizontal porque
 * los cuerpos de debajo empiezan en el mismo punto.
 */
function StageHeader({ id, tag, title, side, tab }: StageHeaderProps) {
  return (
    <div className="vp-glitch pt-10 sm:pt-16">
      <div className="relative flex min-h-28 items-center">
        <div
          className={cn(
            "mx-auto w-full max-w-vp px-inline",
            side === "right" ? "portrait:pr-16" : "portrait:pl-16",
          )}
        >
          <PixelLabel variant="outline">{tag}</PixelLabel>
          <h2
            id={id}
            className="mt-4 text-[1.75rem] font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:text-[2.5rem]"
          >
            {title}
          </h2>
        </div>
        {tab}
      </div>
    </div>
  );
}

interface StageTabProps {
  side: "left" | "right";
  label: string;
  onClick: () => void;
  /**
   * `header`: el de vertical, a la altura del título y con el alto entero de
   * la cabecera. `body`: el de horizontal, centrado en el área del prisma.
   */
  placement: "header" | "body";
  "aria-expanded"?: boolean;
  "aria-controls"?: string;
}

/**
 * Tirador arcade de borde de pantalla.
 *
 * Un riel de 44px de ancho —el mínimo de un objetivo táctil— y 112px de alto,
 * a ras del borde y sin borde por ese lado, como una pestaña que asoma. Texto
 * en Press Start 2P puesto en vertical, paralelo al borde, y una flecha de
 * píxeles que parpadea a saltos.
 *
 * Los dos son el mismo objeto girado media vuelta: el derecho lee de arriba
 * abajo con la flecha al pie apuntando a su borde; el izquierdo, de abajo
 * arriba con la flecha arriba apuntando al suyo. Así cada texto mira hacia su
 * lado de la pantalla y la pareja se lee simétrica.
 *
 * Cada escena lo pinta dos veces, una por `placement`, y la orientación de la
 * pantalla oculta la que no toca.
 */
function StageTab({ side, label, onClick, placement, ...aria }: StageTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...{ [TAB_ATTRIBUTE]: "" }}
      {...aria}
      className={cn(
        "absolute z-20 flex w-11 items-center justify-center border-2 border-line bg-surface text-action",
        "transition-colors duration-200 ease-vp hover:bg-action hover:text-action-ink",
        side === "right" ? "right-0 border-r-0" : "left-0 border-l-0",
        placement === "body"
          ? "top-1/2 h-28 -translate-y-1/2 portrait:hidden"
          : "inset-y-0 landscape:hidden",
      )}
    >
      <span
        className={cn("flex flex-col items-center gap-2.5", side === "left" && "rotate-180")}
      >
        {/* `vp-label` impone la fuente pixel y las mayúsculas. */}
        <span className="vp-label leading-none [writing-mode:vertical-rl]">{label}</span>
        <PixelArrow />
      </span>
    </button>
  );
}

/** Flecha ▶ dibujada en píxeles: cuatro columnas escalonadas. */
function PixelArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 4 7"
      shapeRendering="crispEdges"
      className="h-3.5 w-2 fill-current animate-vp-blink motion-reduce:animate-none"
    >
      <rect x="0" y="0" width="1" height="7" />
      <rect x="1" y="1" width="1" height="5" />
      <rect x="2" y="2" width="1" height="3" />
      <rect x="3" y="3" width="1" height="1" />
    </svg>
  );
}
