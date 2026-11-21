"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import { createPortal } from "react-dom";
import { CashIcon, DeliveryIcon, SealIcon } from "@/components/ui/icons";
import { PixelLabel, type PixelLabelVariant } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { TRUST_BAND_ICONS, type TrustBandContent, type TrustBandIcon } from "@/lib/content/schemas";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { cn } from "@/lib/utils";

/**
 * Las tres tarjetas de la banda de confianza.
 *
 * Separadas de `TrustBand` (async, lee la API) para que la vista previa de
 * `/admin/content` (A5.4) use el mismo marcado. Van sueltas, sin contenedor:
 * en la portada las coloca el `CardField` de `TrustStage`.
 *
 * Cada tarjeta: icono pixel en una pastilla de su color, etiqueta, dato
 * destacado, título y de una a tres líneas concretas (`detail` y `points`).
 * Sin enlaces (decisión `dec-tarjetas-de-informacion-enlace-de-cada-tarjeta`):
 * solo informan, y no compiten con el CTA de la vista.
 *
 * EN UN TELÉFONO SOLO VA EL RESUMEN. Por debajo de `sm` las líneas se ocultan
 * y la tarjeta entera es un botón que despliega un clon de la propia tarjeta
 * con las líneas que faltaban (`TrustCardDialog`): apiladas, las tres con
 * todas sus líneas eran un muro de texto gris. Desde `sm` las tarjetas son las
 * de siempre y no hay botón.
 *
 * Una fila publicada con el formato antiguo no trae `icon`, `highlight` ni
 * `points`: el icono sale de la posición y lo demás no se pinta.
 */

const ICONS: Record<TrustBandIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  delivery: DeliveryIcon,
  original: SealIcon,
  payment: CashIcon,
};

/**
 * Un acento por posición, dentro de la paleta VP: lima, violeta y blanco.
 *
 * `--vp-tb-accent` pinta la sombra dura desplazada y las viñetas; la
 * pastilla del icono va rellena del acento con el icono en el color que le da
 * contraste (negro sobre lima y blanco, blanco sobre violeta: 4.9:1). El
 * violeta nunca va como color de texto: no pasa AA.
 */
const ACCENTS: { color: string; tile: string; label: PixelLabelVariant }[] = [
  { color: "var(--color-action)", tile: "bg-action text-action-ink", label: "lime" },
  { color: "var(--color-accent)", tile: "bg-accent text-foreground", label: "violet" },
  { color: "var(--color-line)", tile: "bg-line text-action-ink", label: "outline" },
];

/** El `sm` de Tailwind: desde aquí la tarjeta enseña todo y el modal sobra. */
const SM_QUERY = "(min-width: 40rem)";

/**
 * La chapa cuadrada del borde derecho del resumen. En la tarjeta es la pista
 * `+` de que hay más; en el clon es el botón de cerrar, con el `+` girado a
 * `×`. Misma caja en los dos para que el clon arranque idéntico a la tarjeta.
 */
const CHIP =
  "vp-label col-start-3 row-span-2 row-start-1 grid size-9 place-items-center rounded-vp border-2 border-muted text-[var(--vp-tb-accent)]";

type Item = TrustBandContent["items"][number];

function iconFor(item: Item, index: number): TrustBandIcon {
  return item.icon ?? TRUST_BAND_ICONS[index] ?? TRUST_BAND_ICONS[0];
}

function accentStyle(index: number): CSSProperties {
  return { "--vp-tb-accent": ACCENTS[index % ACCENTS.length].color } as CSSProperties;
}

interface CardContentProps {
  item: Item;
  index: number;
  /**
   * `card`: la de la banda, que por debajo de `sm` esconde las líneas.
   * `clone`: la del modal. El mismo resumen, con las líneas debajo (las
   * enseña o las esconde el estado del diálogo) y `action` en el sitio de la
   * chapa `+`.
   */
  mode: "card" | "clone";
  titleId?: string;
  action?: ReactNode;
}

/**
 * Lo de dentro de una tarjeta. Lo comparten la banda y el clon del modal.
 *
 * UNA REJILLA, Y NO TRES BLOQUES APILADOS, para que cada ancho reparta el
 * texto según el sitio que tiene:
 *
 * - TELÉFONO (resumen): una sola franja. Icono a la izquierda ocupando el alto
 *   de las dos filas, etiqueta + dato + título en la columna del medio y el
 *   `+` del modal a la derecha. Con las tarjetas al ancho del prisma, apilar
 *   el título debajo del icono dejaba media tarjeta vacía a la derecha.
 * - DESDE `sm`: cabecera (icono + etiqueta + dato) y, debajo, título y líneas
 *   a todo el ancho, como siempre.
 * - ESCRITORIO (`lg` y apaisado), con la tarjeta alta: el bloque entero junto
 *   y centrado en el alto, con tipos más grandes. Repartirlo (cabecera arriba,
 *   título abajo) dejaba un hueco grande en el centro de la tarjeta.
 *
 * El clon solo existe por debajo de `sm`, así que usa la misma rejilla que la
 * franja del teléfono: sus dos primeras filas caen exactamente donde las de la
 * tarjeta, y las líneas van en una tercera fila que el alto del clon recorta
 * hasta que se despliega.
 */
function CardContent({ item, index, mode, titleId, action }: CardContentProps) {
  const Icon = ICONS[iconFor(item, index)];
  const accent = ACCENTS[index % ACCENTS.length];
  // La vista previa pinta el valor mientras se escribe: una línea vacía no
  // deja una viñeta huérfana.
  const lines = [item.detail, ...(item.points ?? [])].filter((line) => line.trim());
  const highlight = item.highlight?.trim();
  const clone = mode === "clone";

  return (
    <div
      className={cn(
        "grid flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3",
        clone
          ? // El clon fija el alto de la rejilla al desplegado (lo calcula
            // `TrustCardDialog`): la cabecera queda arriba, en el mismo sitio
            // que en la tarjeta, y la tercera fila se queda con todo lo que
            // sobra para repartir las líneas.
            "grid-rows-[auto_auto_1fr] content-start"
          : "content-center sm:grid-cols-[auto_minmax(0,1fr)] sm:content-start lg:landscape:flex-none lg:landscape:gap-x-4",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "row-span-2 grid size-11 shrink-0 place-items-center rounded-vp",
          !clone && "sm:row-span-1 sm:size-10 lg:size-12 lg:landscape:size-14",
          accent.tile,
        )}
      >
        <Icon className={cn("size-6", !clone && "sm:size-5 lg:size-6 lg:landscape:size-7")} />
      </span>
      <div className="col-start-2 min-w-0">
        <PixelLabel variant={accent.label}>{item.label}</PixelLabel>
        {highlight && (
          <p
            className={cn(
              "mt-1 font-display text-lg font-bold uppercase leading-none tracking-[0.01em]",
              !clone && "sm:mt-1.5 sm:text-xl lg:text-2xl lg:landscape:text-3xl",
            )}
          >
            {highlight}
          </p>
        )}
      </div>
      <h3
        id={titleId}
        className={cn(
          "col-start-2 mt-1 text-[0.9375rem] font-bold leading-tight",
          !clone &&
            "sm:col-span-2 sm:col-start-1 sm:mt-3 sm:text-base lg:mt-4 lg:text-lg lg:landscape:mt-5 lg:landscape:text-xl",
        )}
      >
        {item.title}
      </h3>
      {lines.length > 0 && (
        <ul
          className={cn(
            "text-muted",
            clone
              ? cn(
                  // Bajo el título, no bajo el icono: se lee como la
                  // continuación del mismo bloque de texto.
                  "col-span-2 col-start-2 text-sm leading-snug",
                  // Ocupa la fila sobrante entera y reparte el aire por igual:
                  // el mismo hueco sobre la primera línea, entre líneas y bajo
                  // la última. Con el desplegado un 30% más alto que su
                  // contenido, el texto queda centrado en ese espacio en vez de
                  // amontonado arriba con un vacío al pie. El `gap` y el `py`
                  // son el mínimo si no sobrara nada.
                  "flex flex-col justify-evenly gap-1.5 self-stretch py-2",
                  // Aparece cuando el clon ya ha crecido y se va antes de que
                  // encoja. La duración de cada sentido es la del estado de
                  // llegada: 280 ms al entrar, 180 ms al salir.
                  "opacity-0 transition-opacity duration-[180ms] ease-out motion-reduce:transition-none",
                  "group-data-[state=open]:opacity-100 group-data-[state=open]:duration-[280ms]",
                )
              : "col-span-full hidden text-sm leading-snug sm:mt-2 sm:block sm:space-y-1 lg:landscape:mt-3 lg:landscape:space-y-2 lg:landscape:text-base",
          )}
        >
          {lines.map((line, lineIndex) => (
            <li key={lineIndex} className="flex gap-2">
              {/* Viñeta cuadrada, como un píxel: decorativa. */}
              <span aria-hidden="true" className="mt-[0.45em] size-1.5 shrink-0 bg-[var(--vp-tb-accent)]" />
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>
      )}
      {clone
        ? action
        : lines.length > 0 && (
            /* La pista de que hay más, solo donde las líneas no se ven: una
               chapa `+` en el borde derecho, a media altura de la franja. */
            <span aria-hidden="true" className={cn(CHIP, "sm:hidden")}>
              +
            </span>
          )}
    </div>
  );
}

export function TrustBandCards({ items }: { items: TrustBandContent["items"] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // La tarjeta pulsada, en estado y no leída del ref al pintar: de ella sale
  // y a ella vuelve el clon del modal.
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const lastIndex = useRef<number | null>(null);

  const close = useCallback(() => {
    setOpenIndex(null);
    // El foco vuelve a la tarjeta que abrió el modal, o se perdería al `body`.
    const trigger = lastIndex.current === null ? null : triggers.current[lastIndex.current];
    trigger?.focus({ preventScroll: true });
  }, []);

  const openItem = openIndex === null ? undefined : items[openIndex];

  return (
    <>
      {items.map((item, index) => {
        const hasMore = [item.detail, ...(item.points ?? [])].some((line) => line.trim());
        return (
          /* Más apretadas por debajo de `sm` y de `lg`: apiladas en un
             teléfono en vertical, las tres tienen que caber en el alto del
             escenario. Desde `sm` las medidas son las de siempre.

             MÁS ALTAS EN ESCRITORIO (`lg` y apaisado): la fila de tres ocupa
             algo más de un tercio del alto de la pantalla, con un mínimo para
             que en un portátil bajo no se aplasten y un tope para que en un
             monitor alto no queden huecas. El texto va junto y centrado en ese
             alto, así que lo que sobra cae arriba y abajo: el margen vertical
             queda mayor que el lateral (`px-6` contra al menos `py-8`).

             UN 25% MÁS ESTRECHAS que su columna (`w-3/4`). Para que el hueco
             entre ellas no crezca con lo que pierden, se arriman al centro de
             la fila —la primera al final de su columna, la última al
             principio, la del medio centrada— y la rejilla baja el `gap` a
             12 px (`trust-stage.tsx`): la separación queda en la mitad de la
             que salía centrando cada una en su columna.

             `vp-glitch-card`: el filtro del glitch lo lleva cada tarjeta y no
             la sección, que tiene dentro el lienzo 3D.

             `vp-tb-card`: en táctil no se quedan con el estado activo pegado
             tras el toque (`globals.css`). El clon del modal sale de la
             tarjeta en reposo y vuelve a ella; si la tarjeta se quedara
             iluminada, el relevo entre las dos se vería como un salto.

             La sombra dura de su color es la profundidad en reposo; al pasar
             el puntero o enfocar, `.vp-card` la cambia por la violeta común
             del sistema, que gana por estar fuera de capa. */
          <Surface
            key={index}
            style={accentStyle(index)}
            className={cn(
              "vp-card vp-tb-card vp-glitch-card flex flex-col p-2.5 shadow-[4px_4px_0_0_var(--vp-tb-accent)] sm:p-4 lg:p-5",
              "lg:landscape:min-h-[clamp(14rem,38vh,26rem)] lg:landscape:w-3/4 lg:landscape:justify-self-center",
              "lg:landscape:first:justify-self-end lg:landscape:last:justify-self-start",
              "lg:landscape:justify-center lg:landscape:px-6 lg:landscape:py-8",
            )}
          >
            <CardContent item={item} index={index} mode="card" />
            {hasMore && (
              /* La tarjeta entera es el objetivo táctil, solo en teléfono.
                 Encima del contenido y transparente: lo que se ve sigue
                 siendo la tarjeta, y el lector de pantalla anuncia un botón
                 que abre un diálogo. */
              <button
                ref={(node) => {
                  triggers.current[index] = node;
                }}
                type="button"
                aria-haspopup="dialog"
                aria-label={`${item.label}: ${item.title}. Ver detalle`}
                onClick={(event) => {
                  lastIndex.current = index;
                  setOrigin(event.currentTarget.parentElement);
                  setOpenIndex(index);
                }}
                className="absolute inset-0 z-10 cursor-pointer sm:hidden"
              />
            )}
          </Surface>
        );
      })}
      {openItem && openIndex !== null && (
        <TrustCardDialog
          item={openItem}
          index={openIndex}
          origin={origin}
          onClose={close}
        />
      )}
    </>
  );
}

/**
 * LA ANIMACIÓN: UN CLON DE LA TARJETA QUE SE DESPLIEGA.
 *
 * Al pulsar una tarjeta aparece encima de ella un clon idéntico —el mismo
 * resumen, a su mismo tamaño y en su misma posición— y desde ahí:
 *
 *   ABRIR    1. el clon viaja hasta el centro del grupo de tarjetas (encima
 *               de la del medio) mientras el velo oscurece el resto;
 *            2. se alarga hacia arriba y hacia abajo por igual, y el `+` gira
 *               hasta quedar como `×`;
 *            3. aparece el texto que el resumen no enseñaba.
 *   CERRAR   el camino inverso: 1. se va el texto; 2. el clon encoge hasta el
 *            alto del resumen; 3. vuelve a la tarjeta de origen y, al
 *            posarse sobre ella, desaparece.
 *
 * Las fases van encadenadas, cada una cuando acaba la anterior, para que se
 * lean como pasos y no como un único gesto. Cerrar a medio abrir retoma el
 * camino de vuelta desde la fase en la que estaba.
 *
 * LO QUE SE ANIMA: el viaje es una `translateY` del envoltorio, que va por el
 * compositor; el crecimiento es el `height` del clon, con el contenido
 * recortado. Animar el alto recalcula la maquetación, pero de una caja suelta
 * con media docena de líneas: es barato, y a cambio el texto nunca se deforma,
 * que es lo que pasaba escalando. El ancho no cambia en ningún momento: el
 * clon mide siempre lo que la tarjeta.
 *
 * Con `prefers-reduced-motion` no hay viaje ni crecimiento: el clon aparece ya
 * desplegado en el centro y desaparece en el sitio.
 */
const MOVE_MS = 460;
const GROW_MS = 420;
/** Lo que tarda en irse el texto al cerrar; el de entrada vive en las clases. */
const TEXT_OUT_MS = 180;
const SHRINK_MS = 380;
const RETURN_MS = 440;
/** Entrada y salida suaves y simétricas: el clon arranca y se posa despacio. */
const EASE = "cubic-bezier(0.45, 0, 0.2, 1)";
/** Margen mínimo entre el clon desplegado y el borde de la pantalla. */
const VIEW_MARGIN = 16;
/** El desplegado mide un 30% más que su contenido: aire para repartir. */
const EXPANDED_SCALE = 1.3;

type Phase = "start" | "moving" | "growing" | "open" | "fading" | "shrinking" | "returning";

/**
 * Medidas del despliegue. `top` es el borde superior del clon desplegado; el
 * envoltorio vive ahí y todo lo demás se expresa como desplazamiento desde
 * ese punto.
 */
interface Geometry {
  top: number;
  /** Alto del resumen: el de la tarjeta de origen. */
  collapsed: number;
  /** Alto desplegado. */
  expanded: number;
  /** Padding superior desplegado: el del resumen más el aire que lo iguala al de abajo. */
  paddingTop: number;
}

/**
 * Muestra u oculta la tarjeta de la banda mientras su clon está fuera.
 * `visibility` y no `opacity`: oculta también el botón que la cubre, que no
 * debe poder pulsarse ni enfocarse a través del velo.
 */
function setVisible(card: HTMLElement | null, visible: boolean) {
  if (card) card.style.visibility = visible ? "" : "hidden";
}

/** Centro vertical del grupo de tarjetas: el de la tarjeta del medio. */
function groupCenter(origin: HTMLElement | null): number | null {
  const cards = origin?.parentElement?.querySelectorAll<HTMLElement>(":scope > .vp-card");
  if (!cards?.length) return null;
  const middle = cards[Math.floor(cards.length / 2)].getBoundingClientRect();
  return middle.top + middle.height / 2;
}

/**
 * El fondo de `.vp-card` es una ventana sobre una imagen común a todo el campo
 * (`ui/card-field.tsx`). El clon vive fuera del campo, así que se lleva las
 * medidas de su tarjeta para arrancar con el mismo trozo de fondo.
 */
function copyFieldWindow(origin: HTMLElement | null, target: HTMLElement) {
  if (!origin) return;
  const style = getComputedStyle(origin);
  for (const name of ["--vp-fx", "--vp-fy", "--vp-fw", "--vp-fh"]) {
    const value = style.getPropertyValue(name);
    if (value) target.style.setProperty(name, value);
  }
}

interface TrustCardDialogProps {
  item: Item;
  index: number;
  /** La tarjeta de la banda que se pulsó: el clon sale de ella y vuelve a ella. */
  origin: HTMLElement | null;
  onClose: () => void;
}

/**
 * Modal con la tarjeta completa, presentado como un clon de la tarjeta pulsada
 * (ver «LA ANIMACIÓN» arriba).
 *
 * Va por portal al `body`: la banda está dentro de un panel con `translate` y
 * de tarjetas con `filter` del glitch, y cualquiera de los dos anclaría un
 * `position: fixed` a ellos en vez de a la pantalla.
 *
 * EL FOCO VA AL DIÁLOGO Y NO AL BOTÓN DE CERRAR. Con el foco dentro, el clon
 * tomaría el aspecto activo de `.vp-card` (borde lima, otra sombra, salto de
 * 2 px) y ya no sería idéntico a la tarjeta de la que sale. El lector de
 * pantalla anuncia el diálogo igual, y el tabulador lleva a cerrar.
 *
 * `z-[44]`, la capa del carrito: por encima del botón de WhatsApp (`z-40`) y
 * por debajo del cursor táctil (`z-[45]`) y de la puerta +18 (`z-50`).
 */
function TrustCardDialog({ item, index, origin, onClose: dismiss }: TrustCardDialogProps) {
  /**
   * Cierre definitivo: la tarjeta de la banda vuelve a verse en el mismo
   * instante en que el clon desaparece, posado encima de ella. Va ANTES de
   * avisar al padre, que devuelve el foco a esa tarjeta, y un elemento
   * oculto no puede recibirlo.
   */
  const onClose = useCallback(() => {
    setVisible(origin, true);
    dismiss();
  }, [origin, dismiss]);

  // Red de seguridad: si el diálogo se desmonta por otro camino (navegar a
  // otra página), la tarjeta no se queda invisible.
  useEffect(
    () => () => {
      setVisible(origin, true);
    },
    [origin],
  );

  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const [phase, setPhaseState] = useState<Phase>("start");
  // La fase también en un ref: la leen los manejadores y los temporizadores,
  // que no deben depender de cuándo se repinta el componente.
  const phaseRef = useRef<Phase>("start");
  const geometry = useRef<Geometry | null>(null);
  // Lo que hay que deshacer si el diálogo cambia de rumbo o se desmonta:
  // temporizadores y escuchas de `transitionend` pendientes.
  const pending = useRef<(() => void)[]>([]);
  const frame = useRef(0);
  const reduced = useRef(false);
  useScrollLock(true);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const cancelPending = useCallback(() => {
    pending.current.forEach((cancel) => cancel());
    pending.current = [];
  }, []);

  const after = useCallback((ms: number, run: () => void) => {
    const timer = window.setTimeout(run, ms);
    pending.current.push(() => window.clearTimeout(timer));
  }, []);

  /**
   * Sigue con `run` cuando termina DE VERDAD la transición de `property` en
   * `element`, y no a los `ms` de reloj que debería durar.
   *
   * MEDIDO EN UN MOTO G15: con temporizadores fijos las fases se solapaban. El
   * teléfono arranca cada transición uno o dos fotogramas tarde, así que al
   * vencer el temporizador del encogimiento el clon aún medía 109 px de los
   * 99 del resumen, y el viaje de vuelta empezaba con la tarjeta a medio
   * encoger. El temporizador queda solo como red de seguridad, con margen,
   * por si la transición no llega a correr (pestaña oculta, valor sin cambio).
   */
  const whenDone = useCallback(
    (element: HTMLElement, property: string, ms: number, run: () => void) => {
      let settled = false;
      const onEnd = (event: TransitionEvent) => {
        if (event.target === element && event.propertyName === property) finish();
      };
      const cancel = () => {
        settled = true;
        element.removeEventListener("transitionend", onEnd);
        window.clearTimeout(timer);
      };
      const finish = () => {
        if (settled) return;
        cancel();
        run();
      };
      const timer = window.setTimeout(finish, ms + 250);
      element.addEventListener("transitionend", onEnd);
      pending.current.push(cancel);
    },
    [],
  );

  /** Fase 2 de la apertura: crece desde el centro y luego entra el texto. */
  const grow = useCallback(() => {
    const panel = panelRef.current;
    const card = cardRef.current;
    const geo = geometry.current;
    if (!panel || !card || !geo) return;
    setPhase("growing");
    panel.style.transition = `transform ${GROW_MS}ms ${EASE}`;
    card.style.transition = `height ${GROW_MS}ms ${EASE}, padding-top ${GROW_MS}ms ${EASE}`;
    panel.style.transform = "translateY(0px)";
    card.style.height = `${geo.expanded}px`;
    card.style.paddingTop = `${geo.paddingTop}px`;
    // Se espera la `transform` del envoltorio y no el `height` del clon, que
    // acaban a la vez: ver la nota de `shrink`.
    whenDone(panel, "transform", GROW_MS, () => setPhase("open"));
  }, [setPhase, whenDone]);

  // Antes de pintar: el primer fotograma ya tiene que estar encima de la
  // tarjeta de origen, o se vería un destello del clon en el centro.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const card = cardRef.current;
    const veil = veilRef.current;
    if (!panel || !card || !veil) return;

    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const from = origin?.getBoundingClientRect();
    const viewWidth = document.documentElement.clientWidth;
    const viewHeight = window.innerHeight;
    const width = from?.width || Math.min(viewWidth - 2 * VIEW_MARGIN, 384);
    panel.style.left = `${from ? from.left : (viewWidth - width) / 2}px`;
    panel.style.width = `${width}px`;
    copyFieldWindow(origin, card);

    // El alto desplegado se mide con el contenido entero en su sitio, todavía
    // invisible (las líneas están a opacidad cero hasta la fase `open`), y
    // se le da un 30% más: con el alto justo el texto quedaba apretado contra
    // el borde. Lo que sobra se lo queda la fila de las líneas, que lo reparte
    // (ver `CardContent`).
    //
    // La rejilla se fija al alto FINAL desde el principio y no sigue al del
    // clon mientras crece: así nada se recoloca durante la animación, y el
    // recorte del clon es lo único que cambia.
    const grid = card.firstElementChild as HTMLElement | null;
    // Sin el alto de una medición anterior: en desarrollo el modo estricto
    // ejecuta este efecto dos veces, y la segunda medía el alto ya ampliado
    // por la primera (un 69% en vez de un 30%).
    if (grid) grid.style.height = "";
    card.style.paddingTop = "";
    card.style.height = "auto";
    const natural = card.offsetHeight;
    const gridNatural = grid?.offsetHeight ?? natural;
    const chrome = natural - gridNatural; // padding y borde del clon
    const expanded = Math.min(Math.round(natural * EXPANDED_SCALE), viewHeight - 2 * VIEW_MARGIN);
    const gridExpanded = Math.max(gridNatural, expanded - chrome);
    if (grid) grid.style.height = `${gridExpanded}px`;
    const collapsed = from?.height || expanded;
    if (natural > expanded) card.style.overflowY = "auto";

    // EL MISMO AIRE ARRIBA QUE ABAJO. Repartiendo lo que sobra solo entre las
    // líneas, del borde superior a la etiqueta quedaba el padding del resumen
    // (12 px) y de la última línea al borde inferior casi el triple. Se mide
    // el desplegado tal cual y se mueve a la parte de arriba lo justo para
    // igualarlos: `lead` px más de padding superior, que la rejilla pierde de
    // alto. Las líneas reparten su fila en `n + 1` huecos iguales, así que
    // cada px que pierde la rejilla le quita al hueco de abajo 1/(n + 1):
    //
    //   arriba + lead = abajo - lead / (n + 1)
    //   lead = (abajo - arriba) · (n + 1) / (n + 2)
    //
    // El padding extra entra mientras el clon crece y sale mientras encoge:
    // el resumen de partida y de llegada sigue siendo el de la tarjeta.
    let lead = 0;
    const lastLine = card.querySelector<HTMLElement>("ul > li:last-child");
    const lineCount = card.querySelectorAll("ul > li").length;
    if (grid && lastLine && gridExpanded > gridNatural) {
      const box = card.getBoundingClientRect();
      const above = grid.getBoundingClientRect().top - box.top;
      const below = box.bottom - lastLine.getBoundingClientRect().bottom;
      lead = Math.max(0, ((below - above) * (lineCount + 1)) / (lineCount + 2));
      grid.style.height = `${gridExpanded - lead}px`;
    }
    const paddingTop = parseFloat(getComputedStyle(card).paddingTop) + lead;

    // La tarjeta de la banda desaparece mientras su clon está fuera: es la
    // misma pieza que se levanta, no una copia junto al original.
    setVisible(origin, false);

    // Centrado en el grupo de tarjetas, pero sin salirse de la pantalla: si la
    // página está desplazada y el grupo queda medio fuera, el clon se queda
    // en el trozo visible más cercano.
    const center = groupCenter(origin) ?? viewHeight / 2;
    const top = Math.min(
      Math.max(center - expanded / 2, VIEW_MARGIN),
      viewHeight - VIEW_MARGIN - expanded,
    );
    panel.style.top = `${top}px`;
    geometry.current = { top, collapsed, expanded, paddingTop };

    if (reduced.current || !from) {
      card.style.height = `${expanded}px`;
      card.style.paddingTop = `${paddingTop}px`;
      setPhase("open");
      return;
    }

    // Punto de partida: el clon, al alto del resumen, encima de su tarjeta.
    card.style.height = `${collapsed}px`;
    panel.style.transform = `translateY(${from.top - top}px)`;
    veil.style.opacity = "0";
    // Se fija el punto de partida antes de soltar la transición; sin esta
    // lectura el navegador funde las dos escrituras y no hay viaje.
    panel.getBoundingClientRect();

    // Fase 1: el viaje hasta el centro del grupo, con el alto del resumen.
    frame.current = requestAnimationFrame(() => {
      if (phaseRef.current !== "start") return;
      setPhase("moving");
      panel.style.transition = `transform ${MOVE_MS}ms ${EASE}`;
      veil.style.transition = `opacity ${MOVE_MS}ms ${EASE}`;
      const moved = (expanded - collapsed) / 2;
      panel.style.transform = `translateY(${moved}px)`;
      veil.style.opacity = "1";
      // La tarjeta del medio ya está en el centro: no hay viaje que esperar,
      // y una transición sin cambio de valor nunca emite `transitionend`.
      if (Math.abs(from.top - top - moved) < 1) after(0, grow);
      else whenDone(panel, "transform", MOVE_MS, grow);
    });
  }, [origin, after, grow, setPhase, whenDone]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      cancelPending();
    },
    [cancelPending],
  );

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  /** Cierre por el camino inverso, desde la fase en la que esté. */
  const requestClose = useCallback(() => {
    const current = phaseRef.current;
    if (current === "fading" || current === "shrinking" || current === "returning") return;

    const panel = panelRef.current;
    const card = cardRef.current;
    const veil = veilRef.current;
    const geo = geometry.current;
    if (reduced.current || !origin || !panel || !card || !veil || !geo) {
      onClose();
      return;
    }

    cancelAnimationFrame(frame.current);
    cancelPending();

    // Paso 3: de vuelta a la tarjeta, y se desmonta al posarse.
    const goBack = () => {
      setPhase("returning");
      const target = origin.getBoundingClientRect().top - geo.top;
      // Dónde está ahora, leído antes de moverlo.
      const current = new DOMMatrixReadOnly(getComputedStyle(panel).transform).m42;
      panel.style.transition = `transform ${RETURN_MS}ms ${EASE}`;
      veil.style.transition = `opacity ${RETURN_MS}ms ${EASE}`;
      panel.style.transform = `translateY(${target}px)`;
      veil.style.opacity = "0";
      // Desde la tarjeta del medio no hay recorrido, y una transición sin
      // cambio de valor no emite `transitionend`: basta con que se vaya el
      // velo, que dura lo mismo.
      if (Math.abs(current - target) < 1) after(RETURN_MS, onClose);
      else whenDone(panel, "transform", RETURN_MS, onClose);
    };

    // Paso 2: encoge hasta el alto del resumen, alrededor del mismo centro.
    const shrink = () => {
      setPhase("shrinking");
      card.style.overflowY = "";
      card.scrollTop = 0;
      panel.style.transition = `transform ${SHRINK_MS}ms ${EASE}`;
      card.style.transition = `height ${SHRINK_MS}ms ${EASE}, padding-top ${SHRINK_MS}ms ${EASE}`;
      // De vuelta al padding del resumen (el de la clase).
      card.style.paddingTop = "";
      panel.style.transform = `translateY(${(geo.expanded - geo.collapsed) / 2}px)`;
      card.style.height = `${geo.collapsed}px`;
      // SE ESPERA LA `transform`, NO EL `height`. Las dos transiciones duran
      // lo mismo, pero la `transform` del envoltorio puede terminar un
      // fotograma después que el alto. Esperando el alto, ese
      // `transitionend` tardío llegaba cuando `goBack` ya escuchaba la
      // `transform` del regreso, se tomaba por su final y el modal se cerraba
      // sin volver a la tarjeta (medido en el G15). Esperando siempre la
      // `transform` del envoltorio, cada fase consume su propio evento.
      whenDone(panel, "transform", SHRINK_MS, goBack);
    };

    // Paso 1: se va el texto. Si todavía no había llegado, se salta.
    if (current === "open") {
      setPhase("fading");
      after(TEXT_OUT_MS, shrink);
    } else if (current === "growing") {
      shrink();
    } else {
      goBack();
    }
  }, [after, cancelPending, onClose, origin, setPhase, whenDone]);

  // Si la pantalla pasa a `sm` con el modal abierto (girar una tableta), la
  // tarjeta ya enseña todo: el modal se cierra solo, sin viaje, porque la
  // tarjeta de origen acaba de cambiar de forma.
  useEffect(() => {
    const query = window.matchMedia(SM_QUERY);
    const onChange = () => {
      if (query.matches) onClose();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      requestClose();
    } else if (event.key === "Tab") {
      // El único control del diálogo es cerrar: el foco no sale de él.
      event.preventDefault();
      closeRef.current?.focus({ preventScroll: true });
    }
  };

  const closeButton = (
    <button
      ref={closeRef}
      type="button"
      onClick={requestClose}
      aria-label="Cerrar"
      // La chapa visible mide 36 px; el `after` amplía la zona táctil a 48.
      className={cn(CHIP, "relative cursor-pointer after:absolute after:-inset-1.5 hover:border-line")}
    >
      {/* El `+` de la tarjeta, girado a `×` mientras el clon crece, y de
          vuelta a `+` mientras encoge. */}
      <span
        aria-hidden="true"
        className={cn(
          "inline-block transition-transform duration-[420ms] ease-[cubic-bezier(0.45,0,0.2,1)] motion-reduce:transition-none",
          "group-data-[state=growing]:rotate-45 group-data-[state=open]:rotate-45 group-data-[state=fading]:rotate-45",
          "group-data-[state=shrinking]:duration-[380ms]",
        )}
      >
        +
      </span>
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[44]" onKeyDown={onKeyDown}>
      {/* Velo. Pulsarlo cierra; para el teclado ya están Escape y el botón. */}
      <div
        ref={veilRef}
        aria-hidden="true"
        onClick={requestClose}
        className="absolute inset-0 bg-background/80"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-state={phase}
        className={cn(
          "group fixed outline-none will-change-transform",
          phase === "returning" && "pointer-events-none",
        )}
      >
        {/* El clon: la misma superficie que la tarjeta (`Surface` no pasa
            refs, de ahí las clases a mano) con su padding y su sombra. El
            recorte es lo que esconde las líneas mientras el alto es el del
            resumen; el clon no se inclina, así que no le quita nada al 3D de
            `.vp-card`. */}
        <div
          ref={cardRef}
          style={accentStyle(index)}
          className="vp-card vp-tb-card overflow-hidden rounded-vp border-2 border-muted bg-surface p-2.5 shadow-[4px_4px_0_0_var(--vp-tb-accent)]"
        >
          <CardContent item={item} index={index} mode="clone" titleId={titleId} action={closeButton} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
