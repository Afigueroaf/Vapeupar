import type { ComponentType, CSSProperties, SVGProps } from "react";
import { CashIcon, DeliveryIcon, SealIcon } from "@/components/ui/icons";
import { PixelLabel, type PixelLabelVariant } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { TRUST_BAND_ICONS, type TrustBandContent, type TrustBandIcon } from "@/lib/content/schemas";
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

type Item = TrustBandContent["items"][number];

function iconFor(item: Item, index: number): TrustBandIcon {
  return item.icon ?? TRUST_BAND_ICONS[index] ?? TRUST_BAND_ICONS[0];
}

export function TrustBandCards({ items }: { items: TrustBandContent["items"] }) {
  return (
    <>
      {items.map((item, index) => {
        const Icon = ICONS[iconFor(item, index)];
        const accent = ACCENTS[index % ACCENTS.length];
        // La vista previa pinta el valor mientras se escribe: una línea vacía
        // no deja una viñeta huérfana.
        const lines = [item.detail, ...(item.points ?? [])].filter((line) => line.trim());
        const highlight = item.highlight?.trim();

        return (
          /* Más apretadas por debajo de `sm` y de `lg`: apiladas en un
             teléfono en vertical, las tres tienen que caber en el alto del
             escenario (a 375×667, ~650 px de banda; si no, crece: ver
             `trust-band.tsx`). Desde `sm` las medidas son las de siempre.

             `vp-glitch-card`: el filtro del glitch lo lleva cada tarjeta y no
             la sección, que tiene dentro el lienzo 3D.

             La sombra dura de su color es la profundidad en reposo; al pasar
             el puntero o enfocar, `.vp-card` la cambia por la violeta común
             del sistema, que gana por estar fuera de capa. */
          <Surface
            key={index}
            style={{ "--vp-tb-accent": accent.color } as CSSProperties}
            className="vp-card vp-glitch-card p-2.5 shadow-[4px_4px_0_0_var(--vp-tb-accent)] sm:p-4 lg:p-5"
          >
            <div className="flex items-center gap-2.5 sm:gap-3">
              <span
                aria-hidden="true"
                className={cn("grid size-9 shrink-0 place-items-center rounded-vp sm:size-10 lg:size-12", accent.tile)}
              >
                <Icon className="size-5 lg:size-6" />
              </span>
              <div className="min-w-0">
                <PixelLabel variant={accent.label}>{item.label}</PixelLabel>
                {highlight && (
                  <p className="mt-1 font-display text-base font-bold uppercase leading-none tracking-[0.01em] sm:mt-1.5 sm:text-xl lg:text-2xl">
                    {highlight}
                  </p>
                )}
              </div>
            </div>
            <h3 className="mt-1.5 text-[0.9375rem] font-bold leading-tight sm:mt-3 sm:text-base lg:mt-4 lg:text-lg">{item.title}</h3>
            {lines.length > 0 && (
              <ul className="mt-1 text-sm leading-snug text-muted sm:mt-2 sm:space-y-1">
                {lines.map((line, lineIndex) => (
                  <li
                    key={lineIndex}
                    // En un teléfono, las líneas extra van en `text-xs`:
                    // apiladas, las tres tarjetas tienen que caber cerca del
                    // alto de la pantalla. Desde `sm`, todas iguales.
                    className={cn("flex gap-2", lineIndex > 0 && "text-xs/snug sm:text-sm/snug")}
                  >
                    {/* Viñeta cuadrada, como un píxel: decorativa. */}
                    <span aria-hidden="true" className="mt-[0.45em] size-1.5 shrink-0 bg-[var(--vp-tb-accent)]" />
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        );
      })}
    </>
  );
}
