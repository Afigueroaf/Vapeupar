"use client";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Lista de registros con paneles desplegables, común a las pantallas del
 * catálogo (plan A5.2 y A5.3). Es la misma forma que `StockList`, generalizada
 * cuando apareció por tercera vez.
 *
 * No es un `<table>`: cada registro es un elemento de lista con su propia
 * rejilla, que en móvil se apila con la etiqueta de cada dato y en pantalla
 * ancha se alinea en columnas. Una tabla real obligaría a desplazamiento
 * horizontal en un teléfono.
 *
 * Lo que aporta frente a repetirla: el cableado ARIA del desplegable
 * (`aria-expanded` + `aria-controls` apuntando al panel de esa fila) en un
 * solo sitio, que es justo lo que se olvida al copiarlo.
 */
export interface OpenPanel {
  id: string;
  panel: string;
}

interface RecordListProps<T> {
  items: T[];
  idOf: (item: T) => string;
  /** Clases de rejilla para pantalla ancha. La cabecera usa las mismas. */
  columns: string;
  /** Una por columna, incluida la de acciones. Solo se ven desde `md`. */
  headers: string[];
  renderCells: (item: T) => React.ReactNode;
  /** Botones de panel de esa fila. Vacío: fila sin desplegable. */
  panelsFor: (item: T) => { key: string; label: string }[];
  open: OpenPanel | null;
  onToggle: (id: string, panel: string) => void;
  renderPanel: (item: T, panel: string) => React.ReactNode;
}

export function RecordList<T>({
  items,
  idOf,
  columns,
  headers,
  renderCells,
  panelsFor,
  open,
  onToggle,
  renderPanel,
}: RecordListProps<T>) {
  return (
    <Surface border="line" className="overflow-hidden">
      <div
        className={cn(
          "hidden gap-x-4 border-b-2 border-muted px-4 py-3 md:grid md:items-center",
          columns,
        )}
      >
        {headers.map((header) => (
          <span key={header} className="vp-label text-muted">
            {header}
          </span>
        ))}
      </div>

      <ul className="divide-y-2 divide-muted">
        {items.map((item) => {
          const id = idOf(item);
          const panel = open?.id === id ? open.panel : null;
          const panelId = `panel-${id}`;
          const panels = panelsFor(item);

          return (
            <li key={id} className="px-4 py-4">
              <div className={cn("grid grid-cols-2 gap-x-4 gap-y-3 md:items-center", columns)}>
                {renderCells(item)}

                {panels.length > 0 && (
                  <div className="col-span-2 flex flex-wrap gap-2 md:col-span-1 md:justify-end">
                    {panels.map((action) => (
                      <Button
                        key={action.key}
                        variant="secondary"
                        className={cn("px-3", panel === action.key && "border-action text-action")}
                        aria-expanded={panel === action.key}
                        aria-controls={panelId}
                        onClick={() => onToggle(id, action.key)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {panel && (
                <div id={panelId} className="mt-4 border-t-2 border-muted pt-4">
                  {renderPanel(item, panel)}
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
export function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 font-display text-sm break-words md:text-[0.9375rem]">
      <span className="vp-label mb-1 block text-muted md:hidden">{label}</span>
      {children}
    </div>
  );
}
