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
  type SVGProps,
} from "react";
import { createPortal } from "react-dom";
import { CashIcon, CloseIcon, DeliveryIcon, SealIcon } from "@/components/ui/icons";
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
 * y la tarjeta entera es un botón que abre un modal con la misma tarjeta
 * completa: apiladas, las tres con todas sus líneas eran un muro de texto
 * gris. Desde `sm` las tarjetas son las de siempre y no hay botón.
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
   * `dialog`: la del modal, siempre completa.
   */
  mode: "card" | "dialog";
  titleId?: string;
}

/**
 * Lo de dentro de una tarjeta. Lo comparten la banda y el modal.
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
 */
function CardContent({ item, index, mode, titleId }: CardContentProps) {
  const Icon = ICONS[iconFor(item, index)];
  const accent = ACCENTS[index % ACCENTS.length];
  // La vista previa pinta el valor mientras se escribe: una línea vacía no
  // deja una viñeta huérfana.
  const lines = [item.detail, ...(item.points ?? [])].filter((line) => line.trim());
  const highlight = item.highlight?.trim();
  const full = mode === "dialog";

  return (
    <div
      className={cn(
        "grid items-center",
        full
          ? "grid-cols-[auto_minmax(0,1fr)] gap-x-3"
          : cn(
              "flex-1 grid-cols-[auto_minmax(0,1fr)_auto] content-center gap-x-3",
              "sm:grid-cols-[auto_minmax(0,1fr)] sm:content-start",
              "lg:landscape:flex-none lg:landscape:gap-x-4",
            ),
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-vp",
          full ? "size-12" : "row-span-2 size-11 sm:row-span-1 sm:size-10 lg:size-12 lg:landscape:size-14",
          accent.tile,
        )}
      >
        <Icon className={full ? "size-6" : "size-6 sm:size-5 lg:size-6 lg:landscape:size-7"} />
      </span>
      <div className="col-start-2 min-w-0">
        <PixelLabel variant={accent.label}>{item.label}</PixelLabel>
        {highlight && (
          <p
            className={cn(
              "font-display font-bold uppercase leading-none tracking-[0.01em]",
              full ? "mt-1.5 text-2xl" : "mt-1 text-lg sm:mt-1.5 sm:text-xl lg:text-2xl lg:landscape:text-3xl",
            )}
          >
            {highlight}
          </p>
        )}
      </div>
      <h3
        id={titleId}
        className={cn(
          "font-bold leading-tight",
          full
            ? "col-span-2 mt-4 text-lg"
            : cn(
                "col-start-2 mt-1 text-[0.9375rem]",
                "sm:col-span-2 sm:col-start-1 sm:mt-3 sm:text-base",
                "lg:mt-4 lg:text-lg lg:landscape:mt-5 lg:landscape:text-xl",
              ),
        )}
      >
        {item.title}
      </h3>
      {lines.length > 0 && (
        <ul
          className={cn(
            "col-span-full text-muted",
            full
              ? cn("mt-3 space-y-2 text-base leading-snug", REVEAL)
              : "hidden text-sm leading-snug sm:mt-2 sm:block sm:space-y-1 lg:landscape:mt-3 lg:landscape:space-y-2 lg:landscape:text-base",
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
      {!full && lines.length > 0 && (
        /* La pista de que hay más, solo donde las líneas no se ven: una chapa
           `+` en el borde derecho, a media altura de la franja. */
        <span
          aria-hidden="true"
          className="vp-label col-start-3 row-span-2 row-start-1 grid size-9 place-items-center rounded-vp border-2 border-muted text-[var(--vp-tb-accent)] sm:hidden"
        >
          +
        </span>
      )}
    </div>
  );
}

export function TrustBandCards({ items }: { items: TrustBandContent["items"] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // La tarjeta pulsada, en estado y no leída del ref al pintar: de ella sale
  // y a ella vuelve la animación del modal.
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

             La sombra dura de su color es la profundidad en reposo; al pasar
             el puntero o enfocar, `.vp-card` la cambia por la violeta común
             del sistema, que gana por estar fuera de capa. */
          <Surface
            key={index}
            style={accentStyle(index)}
            className={cn(
              "vp-card vp-glitch-card flex flex-col p-2.5 shadow-[4px_4px_0_0_var(--vp-tb-accent)] sm:p-4 lg:p-5",
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

interface TrustCardDialogProps {
  item: Item;
  index: number;
  /** La tarjeta de la banda que se pulsó: el modal sale de ella y vuelve a ella. */
  origin: HTMLElement | null;
  onClose: () => void;
}

/**
 * LA ANIMACIÓN: LA TARJETA SALE DE SU SITIO.
 *
 * El modal no aparece en el centro sin más: arranca encima de la tarjeta que
 * se pulsó —su misma posición y su mismo ancho— y viaja hasta el centro
 * mientras el velo se funde. Las líneas que el resumen no enseñaba aparecen
 * cuando la tarjeta ya casi ha llegado. Al cerrar hace el camino inverso y se
 * posa sobre la tarjeta de la banda, así que se lee como la misma pieza que se
 * levanta y vuelve, no como una ventana nueva.
 *
 * Es la técnica FLIP: se mide dónde acaba el modal, se le aplica la
 * transformada que lo lleva encima del origen y se suelta hacia `none`. Solo
 * se anima `transform` (y la opacidad del velo y de las líneas), que va por el
 * compositor sin recalcular la maquetación. La transformada va en el
 * envoltorio y no en la `Surface`: `.vp-card` ya usa `transform` y `translate`
 * para su inclinación y su salto al hover, cada una con su transición.
 *
 * Curvas: al abrir, salida exponencial (rápida al principio y posándose
 * despacio); al cerrar, simétrica, más corta, porque quien cierra ya ha leído
 * y no quiere esperar. Con `prefers-reduced-motion` no hay viaje: el modal
 * aparece y desaparece en el sitio.
 */
const OPEN_MS = 520;
const CLOSE_MS = 340;
const EASE_OPEN = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_CLOSE = "cubic-bezier(0.65, 0, 0.35, 1)";

/**
 * Transformada que deja `target` encima de `origin`. Escala uniforme, por el
 * ancho: una escala distinta en cada eje deformaría el texto durante el viaje.
 * Sin origen medible, un pequeño ascenso desde abajo.
 */
function originTransform(origin: HTMLElement | null, target: HTMLElement): string {
  // Se mide sin transformada: si quedara una a medio aplicar, el cálculo
  // partiría de una caja que no es la de reposo.
  target.style.transform = "none";
  const to = target.getBoundingClientRect();
  const from = origin?.getBoundingClientRect();
  if (!from || !from.width || !to.width) return "translateY(1.5rem) scale(0.96)";
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${from.width / to.width})`;
}

/**
 * Lo que solo trae el modal —las líneas y el botón de cerrar— entra con un
 * fundido un poco retrasado y sale el primero.
 */
const REVEAL =
  "transition-opacity duration-300 ease-out motion-reduce:transition-none " +
  "group-data-[state=opening]:opacity-0 group-data-[state=closing]:opacity-0 " +
  "group-data-[state=closing]:duration-150 group-data-[state=open]:delay-200";

/**
 * Modal con la tarjeta completa. Es la misma tarjeta —superficie, sombra de
 * su acento, icono, etiqueta— con todas sus líneas y un botón de cerrar.
 *
 * Va por portal al `body`: la banda está dentro de un panel con `translate` y
 * de tarjetas con `filter` del glitch, y cualquiera de los dos anclaría un
 * `position: fixed` a ellos en vez de a la pantalla.
 *
 * `z-[44]`, la capa del carrito: por encima del botón de WhatsApp (`z-40`) y
 * por debajo del cursor táctil (`z-[45]`) y de la puerta +18 (`z-50`).
 */
function TrustCardDialog({ item, index, origin, onClose }: TrustCardDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"opening" | "open" | "closing">("opening");
  const closing = useRef(false);
  const reduced = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);
  useScrollLock(true);

  // Antes de pintar: el primer fotograma ya tiene que estar encima del origen,
  // o se vería un destello del modal en el centro.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const veil = veilRef.current;
    if (!panel || !veil) return;

    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      setState("open");
      return;
    }

    panel.style.transition = "none";
    veil.style.transition = "none";
    panel.style.transform = originTransform(origin, panel);
    veil.style.opacity = "0";

    // Un fotograma para que el navegador fije el punto de partida; sin él
    // las dos escrituras se funden en una y no hay transición.
    const frame = requestAnimationFrame(() => {
      panel.style.transition = `transform ${OPEN_MS}ms ${EASE_OPEN}`;
      veil.style.transition = `opacity ${OPEN_MS}ms ${EASE_OPEN}`;
      panel.style.transform = "none";
      veil.style.opacity = "1";
      setState("open");
    });
    return () => cancelAnimationFrame(frame);
  }, [origin]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  /** Cierre con el viaje de vuelta. Se desmonta al terminar. */
  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;

    const panel = panelRef.current;
    const veil = veilRef.current;
    if (reduced.current || !panel || !veil) {
      onClose();
      return;
    }

    setState("closing");
    const target = originTransform(origin, panel);
    panel.style.transition = `transform ${CLOSE_MS}ms ${EASE_CLOSE}`;
    veil.style.transition = `opacity ${CLOSE_MS}ms ${EASE_CLOSE}`;
    panel.style.transform = target;
    veil.style.opacity = "0";
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS);
  }, [onClose, origin]);

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

  return createPortal(
    <div className="fixed inset-0 z-[44] flex items-center justify-center p-4" onKeyDown={onKeyDown}>
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
        data-state={state}
        className={cn(
          "group relative w-full max-w-sm origin-center will-change-transform",
          state === "closing" && "pointer-events-none",
        )}
      >
        <Surface
          style={accentStyle(index)}
          className="vp-card flex flex-col p-5 pr-16 shadow-[4px_4px_0_0_var(--vp-tb-accent)]"
        >
          <CardContent item={item} index={index} mode="dialog" titleId={titleId} />
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className={cn(
              "absolute right-2 top-2 flex size-11 items-center justify-center rounded-vp border-2 border-muted bg-background hover:border-line",
              REVEAL,
            )}
          >
            <CloseIcon className="size-5" aria-hidden="true" />
          </button>
        </Surface>
      </div>
    </div>,
    document.body,
  );
}
