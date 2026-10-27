"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { KardexPanel } from "@/components/admin/kardex-panel";
import { MovementForm } from "@/components/admin/movement-form";
import { StockAlerts } from "@/components/admin/stock-alerts";
import { StockList, type RowPanel } from "@/components/admin/stock-list";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Surface } from "@/components/ui/surface";
import { adminApi, isUnauthorized } from "@/lib/admin-api";
import { formatNumberCO } from "@/lib/utils";
import type { Pagination, StockRow, SupplierRow } from "@/types/admin";

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
 * **Sobre el estado de carga**: no se escribe con `setState` dentro del efecto
 * —React 19 lo rechaza, y con razón: provoca renders en cascada—, sino que se
 * deriva. Se guarda con qué filtros se resolvió la última respuesta y
 * «cargando» es que esos no sean los vigentes. De paso, recargar a mano es
 * crear un objeto de filtros nuevo, sin ninguna bandera extra.
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

interface Loaded {
  filters: Filters;
  rows: StockRow[];
  pagination: Pagination;
}

function describe(cause: unknown): string {
  if (isUnauthorized(cause)) return "La sesión caducó. Vuelve a entrar.";
  return cause instanceof Error ? cause.message : "No se pudo cargar el inventario";
}

export default function StockPage() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<{ filters: Filters; message: string } | null>(null);

  const [alertsTick, setAlertsTick] = useState(0);
  const [alerts, setAlerts] = useState<{ out: number; low: number } | null>(null);
  const [expanded, setExpanded] = useState<{ variantId: string; panel: RowPanel } | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);

  /** Evita pedir los proveedores dos veces si se abren dos ingresos seguidos. */
  const suppliersRequested = useRef(false);

  // Mientras llega la página nueva se siguen viendo las filas anteriores: menos
  // salto que vaciar la tabla. Los controles quedan deshabilitados igualmente.
  const rows = loaded?.rows ?? [];
  const pagination = loaded?.pagination ?? null;
  const error = failed?.filters === filters ? failed.message : null;
  const loading = loaded?.filters !== filters && failed?.filters !== filters;

  // --- Búsqueda con freno: el texto se escribe ya, el filtro espera ---
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((current) =>
        current.q === search.trim() ? current : { ...current, q: search.trim(), page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // --- Filas ---
  useEffect(() => {
    let alive = true;
    adminApi
      .stock({
        q: filters.q || undefined,
        lowStock: filters.lowStock || undefined,
        threshold: filters.threshold,
        page: filters.page,
        limit: PAGE_SIZE,
      })
      .then(
        (response) => {
          if (alive) setLoaded({ filters, rows: response.data, pagination: response.pagination });
        },
        (cause: unknown) => {
          // La sesión caducada la resuelve la puerta de `AdminShell` al recargar;
          // aquí solo se dice lo que pasó.
          if (alive) setFailed({ filters, message: describe(cause) });
        },
      );
    return () => {
      alive = false;
    };
  }, [filters]);

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
  const applyStock = useCallback((variantId: string, stock: number) => {
    setLoaded((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) => (row.variantId === variantId ? { ...row, stock } : row)),
          }
        : current,
    );
    setAlertsTick((tick) => tick + 1);
  }, []);

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-[0.02em]">Inventario</h1>
          <p className="mt-1 text-sm text-muted">
            Disponible por variante, de menos a más: lo urgente, arriba.
          </p>
        </div>
        <Button variant="secondary" onClick={reload} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>

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

      {error && (
        <p role="alert" className="border-2 border-action px-3 py-2 text-sm text-foreground">
          {error}
        </p>
      )}

      {rows.length === 0 && !loading && !error ? (
        <Surface border="muted" className="p-6">
          <p className="text-sm text-muted">
            {filtered
              ? "Ninguna variante coincide con el filtro."
              : "Todavía no hay variantes. Se crean desde productos (A5.3) o con la semilla."}
          </p>
        </Surface>
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

      {pagination && pagination.totalPages > 1 && (
        <nav aria-label="Paginación" className="flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            disabled={pagination.page <= 1 || loading}
            onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
          >
            Anterior
          </Button>
          <p className="text-sm text-muted">
            Página {pagination.page} de {pagination.totalPages} · {formatNumberCO(pagination.total)}{" "}
            variantes
          </p>
          <Button
            variant="secondary"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </div>
  );
}
