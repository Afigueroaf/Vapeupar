"use client";

import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { cn, formatNumberCO, formatPriceCOP } from "@/lib/utils";
import type { StockRow } from "@/types/admin";

/**
 * Tabla de inventario (plan A5.1).
 *
 * No es un `<table>`: cada fila es un elemento de lista con su propia rejilla,
 * que en móvil se apila con la etiqueta de cada dato y en pantalla ancha se
 * alinea en columnas. Una tabla real obligaría a desplazamiento horizontal en
 * un teléfono, que es justo donde se usa esto de pie en el local.
 *
 * El panel de cada fila (movimiento o kardex) lo pinta quien la usa, para que
 * la lista no tenga que saber de la API.
 */
export type RowPanel = "movement" | "kardex";

interface StockListProps {
  rows: StockRow[];
  /** Umbral de bajo stock vigente, para marcar la fila. */
  threshold: number;
  expanded: { variantId: string; panel: RowPanel } | null;
  onToggle: (variantId: string, panel: RowPanel) => void;
  renderPanel: (row: StockRow, panel: RowPanel) => React.ReactNode;
}

/** Una sola definición de columnas para la cabecera y las filas. */
const COLUMNS =
  "md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_7rem_6rem_auto]";

export function StockList({ rows, threshold, expanded, onToggle, renderPanel }: StockListProps) {
  return (
    <Surface border="line" className="overflow-hidden">
      <div
        className={cn(
          "hidden gap-x-4 border-b-2 border-muted px-4 py-3 md:grid md:items-center",
          COLUMNS,
        )}
      >
        <span className="vp-label text-muted">Marca</span>
        <span className="vp-label text-muted">Linea</span>
        <span className="vp-label text-muted">Variante</span>
        <span className="vp-label text-muted">Precio</span>
        <span className="vp-label text-muted">Stock</span>
        <span className="vp-label text-muted">Acciones</span>
      </div>

      <ul className="divide-y-2 divide-muted">
        {rows.map((row) => {
          const open = expanded?.variantId === row.variantId ? expanded.panel : null;
          const panelId = `panel-${row.variantId}`;
          const level = row.stock <= 0 ? "out" : row.stock <= threshold ? "low" : "ok";

          return (
            <li key={row.variantId} className="px-4 py-4">
              <div className={cn("grid grid-cols-2 gap-x-4 gap-y-3 md:items-center", COLUMNS)}>
                <Cell label="Marca">{row.brandName}</Cell>

                <Cell label="Línea">
                  <span className="block">{row.productName}</span>
                  {row.status === "draft" && (
                    <PixelLabel variant="outline" className="mt-1">
                      BORRADOR
                    </PixelLabel>
                  )}
                </Cell>

                <Cell label="Variante">
                  <span className="block">{row.variantName}</span>
                  <span className="text-xs text-muted">
                    {row.kind === "flavor" ? "sabor" : "color"}
                  </span>
                  {!row.active && (
                    <PixelLabel variant="outline" className="mt-1">
                      INACTIVA
                    </PixelLabel>
                  )}
                </Cell>

                <Cell label="Precio">
                  {row.price === null ? <span className="text-muted">—</span> : formatPriceCOP(row.price)}
                </Cell>

                <Cell label="Stock">
                  <span
                    className={cn(
                      "font-display text-xl font-bold leading-none",
                      level === "out" && "text-action",
                      level === "low" && "text-foreground",
                      level === "ok" && "text-foreground",
                    )}
                  >
                    {formatNumberCO(row.stock)}
                  </span>
                  {level === "out" && (
                    <PixelLabel variant="lime" className="mt-1">
                      AGOTADO
                    </PixelLabel>
                  )}
                  {level === "low" && (
                    <PixelLabel variant="violet" className="mt-1">
                      BAJO
                    </PixelLabel>
                  )}
                </Cell>

                <div className="col-span-2 flex flex-wrap gap-2 md:col-span-1 md:justify-end">
                  <Button
                    variant="secondary"
                    className={cn("px-3", open === "movement" && "border-action text-action")}
                    aria-expanded={open === "movement"}
                    aria-controls={panelId}
                    onClick={() => onToggle(row.variantId, "movement")}
                  >
                    Movimiento
                  </Button>
                  <Button
                    variant="secondary"
                    className={cn("px-3", open === "kardex" && "border-action text-action")}
                    aria-expanded={open === "kardex"}
                    aria-controls={panelId}
                    onClick={() => onToggle(row.variantId, "kardex")}
                  >
                    Kardex
                  </Button>
                </div>
              </div>

              {open && (
                <div id={panelId} className="mt-4 border-t-2 border-muted pt-4">
                  {renderPanel(row, open)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

/** Dato con su etiqueta: la etiqueta solo se ve donde no hay cabecera. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 font-display text-sm break-words md:text-[0.9375rem]">
      <span className="vp-label mb-1 block text-muted md:hidden">{label}</span>
      {children}
    </div>
  );
}
