"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { FormError } from "@/components/admin/form";
import { KardexPanel } from "@/components/admin/kardex-panel";
import { MovementForm } from "@/components/admin/movement-form";
import { EmptyState, Pager, ScreenHeader } from "@/components/admin/screen";
import { StockAlerts } from "@/components/admin/stock-alerts";
import { StockList, type RowPanel } from "@/components/admin/stock-list";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Surface } from "@/components/ui/surface";
import { adminApi } from "@/lib/admin-api";
import type { SupplierRow } from "@/types/admin";

/**
 * Pantalla de stock (plan A5.1): la que se usa a diario y por eso va primera.
 *
 * Todo pasa por `/api/admin/stock`, que ya paginaba, buscaba y filtraba por
 * bajo stock desde A4. Lo único que esta pantalla calcula por su cuenta son los
 * dos contadores de alerta, y lo hace con la misma ruta.
 *
 * El disponible de una fila se actualiza con lo que devuelve el movimiento, sin
 * recargar la tabla: el backend responde con el stock resultante justamente
 * para eso (criterio de verificación de A5).
 *
 * El estado de carga lo lleva `useAdminQuery`, que lo **deriva** en vez de
 * escribirlo dentro del efecto —React 19 lo rechaza, y con razón: provoca
 * renders en cascada—. Recargar a mano es crear un objeto de filtros nuevo.
 */

/**
 * Umbral de «bajo stock». La decisión #5 del plan (global o por variante) sigue
 * abierta; este es el valor por defecto del backend, repetido aquí porque la
 * consola tiene que poder mostrarlo antes de pedir nada.
 */
const LOW_STOCK_THRESHOLD = 5;

const PAGE_SIZE = 20;

/** La consola tiene 30 peticiones por minuto: buscar al teclear necesita freno. */
const SEARCH_DEBOUNCE_MS = 500;

interface Filters {
  q: string;
  lowStock: boolean;
  threshold: number;
  page: number;
}

const INITIAL_FILTERS: Filters = {
  q: "",
  lowStock: false,
  threshold: LOW_STOCK_THRESHOLD,
  page: 1,
};

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);

  const [alertsTick, setAlertsTick] = useState(0);
  const [alerts, setAlerts] = useState<{ out: number; low: number } | null>(null);
  const [expanded, setExpanded] = useState<{ variantId: string; panel: RowPanel } | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);

  /** Evita pedir los proveedores dos veces si se abren dos ingresos seguidos. */
  const suppliersRequested = useRef(false);

  const fetchStock = useCallback(
    (current: Filters) =>
      adminApi.stock({
        q: current.q || undefined,
        lowStock: current.lowStock || undefined,
        threshold: current.threshold,
        page: current.page,
        limit: PAGE_SIZE,
      }),
    [],
  );

  // Mientras llega la página nueva se siguen viendo las filas anteriores: menos
  // salto que vaciar la tabla. Los controles quedan deshabilitados igualmente.
  const { data, error, loading, patch } = useAdminQuery(
    filters,
    fetchStock,
    "No se pudo cargar el inventario",
  );
  const rows = data?.data ?? [];

  // --- Búsqueda con freno: el texto se escribe ya, el filtro espera ---
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((current) =>
        current.q === search.trim() ? current : { ...current, q: search.trim(), page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // --- Contadores de alerta: se rehacen tras cada movimiento ---
  useEffect(() => {
    let alive = true;
    // Una fila de cada consulta: lo que interesa es el total de la paginación.
    Promise.all([
      adminApi.stock({ lowStock: true, threshold: 0, limit: 1 }),
      adminApi.stock({ lowStock: true, threshold: LOW_STOCK_THRESHOLD, limit: 1 }),
    ]).then(
      ([outOfStock, belowThreshold]) => {
        if (!alive) return;
        const out = outOfStock.pagination.total;
        setAlerts({ out, low: Math.max(0, belowThreshold.pagination.total - out) });
      },
      () => {
        // Las alertas son un extra: si fallan, la tabla sigue sirviendo.
        if (alive) setAlerts(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [alertsTick]);

  const needSuppliers = useCallback(() => {
    if (suppliersRequested.current) return;
    suppliersRequested.current = true;
    adminApi.suppliers().then(setSuppliers, () => setSuppliers([]));
  }, []);

  /** Tras un movimiento: la fila y los contadores, sin recargar la tabla. */
  const applyStock = useCallback(
    (variantId: string, stock: number) => {
      patch((page) => ({
        ...page,
        data: page.data.map((row) => (row.variantId === variantId ? { ...row, stock } : row)),
      }));
      setAlertsTick((tick) => tick + 1);
    },
    [patch],
  );

  const toggle = useCallback((variantId: string, panel: RowPanel) => {
    setExpanded((current) =>
      current?.variantId === variantId && current.panel === panel ? null : { variantId, panel },
    );
  }, []);

  const showLowStock = useCallback((threshold: number) => {
    setExpanded(null);
    setFilters((current) => ({ ...current, lowStock: true, threshold, page: 1 }));
  }, []);

  /** Recargar es pedir los mismos filtros otra vez, con otra identidad. */
  const reload = useCallback(() => setFilters((current) => ({ ...current })), []);

  const filtered = filters.lowStock || filters.q !== "";

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Inventario"
        description="Disponible por variante, de menos a más: lo urgente, arriba."
      >
        <Button variant="secondary" onClick={reload} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

      <StockAlerts
        out={alerts?.out ?? 0}
        low={alerts?.low ?? 0}
        threshold={LOW_STOCK_THRESHOLD}
        loading={alerts === null}
        onShowLowStock={showLowStock}
      />

      <Surface border="muted" className="flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="stock-search"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Buscar variante o línea
          </label>
          <TextField
            id="stock-search"
            type="search"
            placeholder="ECO PRO, Mango Ice…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            icon={<Search className="size-4" aria-hidden="true" />}
          />
        </div>

        <label className="flex min-h-[44px] items-center gap-2 font-display text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-action)]"
            checked={filters.lowStock}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                lowStock: event.target.checked,
                threshold: LOW_STOCK_THRESHOLD,
                page: 1,
              }))
            }
          />
          Solo bajo stock (≤ {filters.threshold})
        </label>

        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setFilters(INITIAL_FILTERS);
            }}
          >
            Quitar filtros
          </Button>
        )}
      </Surface>

      {error && <FormError>{error}</FormError>}

      {rows.length === 0 && !loading && !error ? (
        <EmptyState>
          {filtered
            ? "Ninguna variante coincide con el filtro."
            : "Todavía no hay variantes. Se crean en la pantalla de líneas o con la semilla."}
        </EmptyState>
      ) : (
        <StockList
          rows={rows}
          threshold={filters.threshold}
          expanded={expanded}
          onToggle={toggle}
          renderPanel={(row, panel) =>
            panel === "movement" ? (
              <MovementForm
                row={row}
                suppliers={suppliers}
                onNeedSuppliers={needSuppliers}
                onApplied={(stock) => applyStock(row.variantId, stock)}
              />
            ) : (
              // `key` por variante: el panel arranca limpio en vez de tener que
              // borrar su propio estado al cambiar de fila.
              <KardexPanel key={row.variantId} variantId={row.variantId} />
            )
          }
        />
      )}

      <Pager
        pagination={data?.pagination ?? null}
        loading={loading}
        noun="variantes"
        onPage={(step) => setFilters((current) => ({ ...current, page: current.page + step }))}
      />
    </div>
  );
}
