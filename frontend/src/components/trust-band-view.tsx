import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import type { TrustBandContent } from "@/lib/content/schemas";

/**
 * Las tres tarjetas de la banda de confianza.
 *
 * Separadas de `TrustBand` (async, lee la API) para que la vista previa de
 * `/admin/content` (A5.4) use el mismo marcado. Van sueltas, sin contenedor:
 * en la portada las coloca el `CardField` de `TrustStage`.
 */
export function TrustBandCards({ items }: { items: TrustBandContent["items"] }) {
  return (
    <>
      {items.map((item, index) => (
        /* Más apretadas por debajo de `lg`: apiladas en un teléfono en
           vertical, las tres tienen que caber en el alto del escenario. */
        /* `vp-glitch-card`: antes estas tarjetas no lo llevaban porque iban
           dentro de una franja filtrada, y anidar un filtro dentro de otro
           separaría los canales dos veces. Al quitarle el filtro a la
           sección, pasan a llevarlo ellas. */
        <Surface key={index} className="vp-card vp-glitch-card p-3 sm:p-4 lg:p-5">
          <PixelLabel variant="lime">{item.label}</PixelLabel>
          <h3 className="mt-2 text-base font-bold leading-tight sm:mt-3 sm:text-lg lg:mt-4 lg:text-xl">
            {item.title}
          </h3>
          <p className="mt-1 text-sm text-muted sm:text-base">{item.detail}</p>
        </Surface>
      ))}
    </>
  );
}
