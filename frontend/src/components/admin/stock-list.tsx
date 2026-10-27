"use client";

import { PixelLabel } from "@/components/ui/pixel-label";
import { cn, formatNumberCO, formatPriceCOP } from "@/lib/utils";
import type { StockRow } from "@/types/admin";
import { Cell, RecordList } from "./record-list";

/**
 * Tabla de inventario (plan A5.1).
 *
 * La mecánica de la lista —rejilla en vez de `<table>`, panel desplegable por
 * fila con su cableado ARIA— es `RecordList`, común a las pantallas de la
 * consola. Aquí queda lo propio del inventario: qué dice cada celda y cuándo
 * una fila está agotada o bajo umbral.
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

const COLUMNS =
  "md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_7rem_6rem_auto]";

const PANELS = [
  { key: "movement", label: "Movimiento" },
  { key: "kardex", label: "Kardex" },
];

export function StockList({ rows, threshold, expanded, onToggle, renderPanel }: StockListProps) {
  return (
    <RecordList
      items={rows}
      idOf={(row) => row.variantId}
      columns={COLUMNS}
      headers={["Marca", "Linea", "Variante", "Precio", "Stock", "Acciones"]}
      open={expanded ? { id: expanded.variantId, panel: expanded.panel } : null}
      onToggle={(id, panel) => onToggle(id, panel as RowPanel)}
      panelsFor={() => PANELS}
      renderPanel={(row, panel) => renderPanel(row, panel as RowPanel)}
      renderCells={(row) => {
        const level = row.stock <= 0 ? "out" : row.stock <= threshold ? "low" : "ok";

        return (
          <>
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
              {row.price === null ? (
                <span className="text-muted">—</span>
              ) : (
                formatPriceCOP(row.price)
              )}
            </Cell>

            <Cell label="Stock">
              <span
                className={cn(
                  "font-display text-xl font-bold leading-none",
                  level === "out" ? "text-action" : "text-foreground",
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
          </>
        );
      }}
    />
  );
}
