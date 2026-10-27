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
 */
interface StockAlertsProps {
  out: number;
  low: number;
  threshold: number;
  loading: boolean;
  /** Aplica el filtro de bajo stock con el umbral indicado. */
  onShowLowStock: (threshold: number) => void;
}

export function StockAlerts({ out, low, threshold, loading, onShowLowStock }: StockAlertsProps) {
  return (
    <section aria-label="Alertas de inventario" className="grid gap-4 sm:grid-cols-2">
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
}: {
  label: string;
  emphasis: "lime" | "violet";
  value: number;
  loading: boolean;
  description: string;
  onShow: () => void;
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
      <Button variant="ghost" onClick={onShow} disabled={loading || value === 0}>
        Ver
      </Button>
    </Surface>
  );
}
