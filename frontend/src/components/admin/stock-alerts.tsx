"use client";

import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { formatNumberCO } from "@/lib/utils";

/**
 * Bloque de alertas de la pantalla de stock (plan A5.1): agotados y bajo
 * umbral, que es lo primero que hay que ver al abrir la consola.
 *
 * Los dos números salen de la propia API de inventario, pidiendo una sola fila
 * con el filtro de bajo stock y leyendo el total de la paginación: `threshold:
 * 0` da los agotados y `threshold: N` los que están en o por debajo del umbral.
 * Por eso «bajo umbral» se muestra ya descontados los agotados, que si no
 * saldrían contados dos veces.
 *
 * La tercera tarjeta es distinta: «sin imagen» no se puede pedir con los
 * filtros de la tabla, así que sale de `/stock/image-alerts` y su «Ver»
 * despliega la lista en lugar de filtrar.
 */
interface StockAlertsProps {
  out: number;
  low: number;
  threshold: number;
  loading: boolean;
  missingImages: number;
  imagesLoading: boolean;
  /** Aplica el filtro de bajo stock con el umbral indicado. */
  onShowLowStock: (threshold: number) => void;
  /**
   * Abre y cierra el listado de variantes sin imagen. No es un filtro de la
   * tabla: la lista llega completa, con filas que pueden no estar en la página.
   */
  onShowMissingImages: () => void;
  missingImagesOpen: boolean;
}

export function StockAlerts({
  out,
  low,
  threshold,
  loading,
  missingImages,
  imagesLoading,
  onShowLowStock,
  onShowMissingImages,
  missingImagesOpen,
}: StockAlertsProps) {
  return (
    <section aria-label="Alertas de inventario" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AlertCard
        label="AGOTADOS"
        emphasis="lime"
        value={out}
        loading={loading}
        description="Variantes activas sin unidades disponibles."
        onShow={() => onShowLowStock(0)}
      />
      <AlertCard
        label="BAJO UMBRAL"
        emphasis="violet"
        value={low}
        loading={loading}
        description={`Entre 1 y ${threshold} unidades, sin contar los agotados.`}
        onShow={() => onShowLowStock(threshold)}
      />
      <AlertCard
        label="SIN IMAGEN"
        emphasis="violet"
        value={missingImages}
        loading={imagesLoading}
        description="Variantes publicadas con stock disponible sin imagen propia."
        onShow={onShowMissingImages}
        showLabel={missingImagesOpen ? "Cerrar" : "Ver"}
        expanded={missingImagesOpen}
      />
    </section>
  );
}

function AlertCard({
  label,
  emphasis,
  value,
  loading,
  description,
  onShow,
  showLabel = "Ver",
  expanded,
}: {
  label: string;
  emphasis: "lime" | "violet";
  value: number;
  loading: boolean;
  description: string;
  onShow?: () => void;
  showLabel?: string;
  /** Solo en la tarjeta que despliega un panel; las otras filtran la tabla. */
  expanded?: boolean;
}) {
  return (
    <Surface border={emphasis === "lime" ? "line" : "accent"} className="flex items-start gap-4 p-4">
      <div className="flex-1 space-y-2">
        <PixelLabel variant={emphasis}>{label}</PixelLabel>
        <p className="font-display text-3xl font-bold leading-none">
          {loading ? "—" : formatNumberCO(value)}
        </p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      {onShow && (
        <Button
          variant="ghost"
          onClick={onShow}
          disabled={loading || value === 0}
          aria-expanded={expanded}
          aria-controls={expanded === undefined ? undefined : "stock-missing-images"}
        >
          {showLabel}
        </Button>
      )}
    </Surface>
  );
}
