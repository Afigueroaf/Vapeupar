"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { BrandForm } from "@/components/admin/brand-form";
import { ImageOnlyForm } from "@/components/admin/image-only-form";
import { useAdminSession } from "@/components/admin/admin-shell";
import { Cell, RecordList, type OpenPanel } from "@/components/admin/record-list";
import { EmptyState, Pager, ScreenHeader } from "@/components/admin/screen";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { FormError, FormStatus } from "@/components/admin/form";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { adminApi } from "@/lib/admin-api";
import { formatNumberCO } from "@/lib/utils";
import type { BrandRow } from "@/types/admin";

/**
 * Marcas (plan A5.2).
 *
 * Leer es para cualquier sesión; crear y editar, solo para el dueño, que es
 * como quedó A4 mientras la decisión #6 del plan siga abierta. El `operator`
 * ve la pantalla sin los botones de escritura, y el backend lo impone igual.
 *
 * Después de guardar no se recarga la lista: se reemplaza la fila con lo que
 * devolvió el backend, que responde con la marca ya guardada.
 */

const PAGE_SIZE = 20;

/** La consola tiene 30 peticiones por minuto: buscar al teclear necesita freno. */
const SEARCH_DEBOUNCE_MS = 500;

interface Filters {
  q: string;
  /** `undefined` es «todas»: activas e inactivas. */
  active: boolean | undefined;
  partnersOnly: boolean;
  page: number;
}

const INITIAL_FILTERS: Filters = { q: "", active: undefined, partnersOnly: false, page: 1 };

const COLUMNS = "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7rem_6rem_8rem_auto]";

export default function BrandsPage() {
  const { identity } = useAdminSession();
  const canWrite = identity.role === "owner";

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<OpenPanel | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const fetchBrands = useCallback(
    (current: Filters) =>
      adminApi.brands({
        q: current.q || undefined,
        active: current.active,
        isPartner: current.partnersOnly || undefined,
        page: current.page,
        limit: PAGE_SIZE,
      }),
    [],
  );

  const { data, error, loading, patch } = useAdminQuery(
    filters,
    fetchBrands,
    "No se pudieron cargar las marcas",
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

  const toggle = useCallback((id: string, panel: string) => {
    setSaved(null);
    setCreating(false);
    setOpen((current) => (current?.id === id && current.panel === panel ? null : { id, panel }));
  }, []);

  /** Recargar es pedir los mismos filtros otra vez, con otra identidad. */
  const reload = useCallback(() => setFilters((current) => ({ ...current })), []);

  function startCreating() {
    setOpen(null);
    setSaved(null);
    setCreating(true);
  }

  function onSaved(brand: BrandRow, created: boolean) {
    setSaved(
      created
        ? `Marca «${brand.name}» creada.`
        : `Marca «${brand.name}» guardada${brand.active ? "" : " y desactivada"}.`,
    );
    setCreating(false);
    setOpen(null);
    if (created) {
      // La nueva puede caer en otra página o fuera del filtro: se recarga.
      reload();
      return;
    }
    patch((page) => ({
      ...page,
      data: page.data.map((row) => (row.id === brand.id ? brand : row)),
    }));
  }

  const filtered = filters.q !== "" || filters.active !== undefined || filters.partnersOnly;

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Marcas"
        description="Las marcas del catálogo. Las aliadas salen en la landing y en la FAQ."
      >
        {canWrite && (
          <Button variant="secondary" onClick={startCreating} disabled={creating}>
            Nueva marca
          </Button>
        )}
        <Button variant="secondary" onClick={reload} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

      <Surface border="muted" className="flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="brand-search"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Buscar marca
          </label>
          <TextField
            id="brand-search"
            type="search"
            placeholder="LifePod, Oxbar…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            icon={<Search className="size-4" aria-hidden="true" />}
          />
        </div>

        <div>
          <label
            htmlFor="brand-active"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Estado
          </label>
          <SelectField
            id="brand-active"
            value={filters.active === undefined ? "all" : filters.active ? "yes" : "no"}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                active:
                  event.target.value === "all" ? undefined : event.target.value === "yes",
                page: 1,
              }))
            }
          >
            <option value="all">Todas</option>
            <option value="yes">Activas</option>
            <option value="no">Inactivas</option>
          </SelectField>
        </div>

        <label className="flex min-h-[44px] items-center gap-2 font-display text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-action)]"
            checked={filters.partnersOnly}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                partnersOnly: event.target.checked,
                page: 1,
              }))
            }
          />
          Solo aliadas
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
      {saved && <FormStatus>{saved}</FormStatus>}

      {creating && (
        <Surface border="accent" className="space-y-4 p-4">
          <h2 className="font-display text-lg font-bold uppercase tracking-[0.02em]">
            Nueva marca
          </h2>
          <BrandForm brand={null} onSaved={onSaved} onCancel={() => setCreating(false)} />
        </Surface>
      )}

      {rows.length === 0 && !loading && !error ? (
        <EmptyState>
          {filtered
            ? "Ninguna marca coincide con el filtro."
            : "Todavía no hay marcas. La primera línea de producto necesita una."}
        </EmptyState>
      ) : (
        <RecordList
          items={rows}
          idOf={(row) => row.id}
          columns={COLUMNS}
          headers={["Marca", "Slug", "Aliada", "Orden", "Lineas", "Acciones"]}
          open={open}
          onToggle={toggle}
          // El operador no edita la marca, pero sí su logo (§4.5 del traspaso
          // de imágenes): por eso tiene un panel propio, no el formulario.
          panelsFor={() =>
            canWrite ? [{ key: "edit", label: "Editar" }] : [{ key: "image", label: "Logo" }]
          }
          renderCells={(row) => (
            <>
              <Cell label="Marca">
                <span className="block">{row.name}</span>
                {!row.active && (
                  <PixelLabel variant="outline" className="mt-1">
                    INACTIVA
                  </PixelLabel>
                )}
              </Cell>
              <Cell label="Slug">
                <span className="text-muted">{row.slug}</span>
              </Cell>
              <Cell label="Aliada">
                {row.isPartner ? (
                  <PixelLabel variant="violet">ALIADA</PixelLabel>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Cell>
              <Cell label="Orden">{formatNumberCO(row.sortOrder)}</Cell>
              <Cell label="Líneas">{formatNumberCO(row.productCount)}</Cell>
            </>
          )}
          renderPanel={(row, panel) =>
            panel === "image" ? (
              <ImageOnlyForm
                key={`${row.id}-image`}
                label="Logo"
                target="brand-logo"
                entityId={row.id}
                imageKey={row.logoKey}
                save={async (logoKey) => onSaved(await adminApi.updateBrand(row.id, { logoKey }), false)}
                onCancel={() => setOpen(null)}
              />
            ) : (
              // `key` por marca: el formulario arranca con los datos de esta fila
              // en vez de tener que sincronizarlos al cambiar de fila.
              <BrandForm
                key={row.id}
                brand={row}
                onSaved={onSaved}
                onCancel={() => setOpen(null)}
              />
            )
          }
        />
      )}

      <Pager
        pagination={data?.pagination ?? null}
        loading={loading}
        noun="marcas"
        onPage={(step) => setFilters((current) => ({ ...current, page: current.page + step }))}
      />
    </div>
  );
}
