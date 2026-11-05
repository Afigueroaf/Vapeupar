"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useAdminSession } from "@/components/admin/admin-shell";
import { FormError, FormStatus } from "@/components/admin/form";
import { Cell, RecordList, type OpenPanel } from "@/components/admin/record-list";
import { EmptyState, Pager, ScreenHeader } from "@/components/admin/screen";
import { SupplierForm } from "@/components/admin/supplier-form";
import { SupplierPanel } from "@/components/admin/supplier-panel";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { adminApi } from "@/lib/admin-api";
import type { BrandRow, SupplierRow } from "@/types/admin";

/**
 * Proveedores (plan A5.2).
 *
 * Dos paneles por fila: la **ficha** —marcas que trae, variantes abastecidas y
 * último ingreso—, que puede ver cualquier sesión, y la **edición**, solo para
 * el dueño. Los dos los pide `SupplierPanel`, porque el listado no trae el
 * vínculo con marcas.
 *
 * Las marcas se piden una vez al abrir la pantalla: son las casillas del
 * vínculo y no cambian mientras se edita.
 */

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 500;

interface Filters {
  q: string;
  active: boolean | undefined;
  page: number;
}

const INITIAL_FILTERS: Filters = { q: "", active: undefined, page: 1 };

const COLUMNS = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto]";

export default function SuppliersPage() {
  const { identity } = useAdminSession();
  const canWrite = identity.role === "owner";

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<OpenPanel | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandRow[] | null>(null);

  const fetchSuppliers = useCallback(
    (current: Filters) =>
      adminApi.suppliersPage({
        q: current.q || undefined,
        active: current.active,
        page: current.page,
        limit: PAGE_SIZE,
      }),
    [],
  );

  const { data, error, loading, patch } = useAdminQuery(
    filters,
    fetchSuppliers,
    "No se pudieron cargar los proveedores",
  );
  const rows = data?.data ?? [];

  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((current) =>
        current.q === search.trim() ? current : { ...current, q: search.trim(), page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // Las marcas del vínculo: una vez por visita a la pantalla.
  useEffect(() => {
    let alive = true;
    adminApi.brands({ limit: 100 }).then(
      (page) => {
        if (alive) setBrands(page.data);
      },
      () => {
        // Sin marcas se puede seguir creando el proveedor; el vínculo lo dice.
        if (alive) setBrands([]);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback((id: string, panel: string) => {
    setSaved(null);
    setCreating(false);
    setOpen((current) => (current?.id === id && current.panel === panel ? null : { id, panel }));
  }, []);

  const reload = useCallback(() => setFilters((current) => ({ ...current })), []);

  function startCreating() {
    setOpen(null);
    setSaved(null);
    setCreating(true);
  }

  function onSaved(supplier: SupplierRow, created: boolean) {
    setSaved(
      created ? `Proveedor «${supplier.name}» creado.` : `Proveedor «${supplier.name}» guardado.`,
    );
    setCreating(false);
    setOpen(null);
    if (created) {
      reload();
      return;
    }
    patch((page) => ({
      ...page,
      data: page.data.map((row) => (row.id === supplier.id ? supplier : row)),
    }));
  }

  const filtered = filters.q !== "" || filters.active !== undefined;

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Proveedores"
        description="Quién abastece qué. El ingreso de inventario los usa para firmar la entrada."
      >
        {canWrite && (
          <Button variant="secondary" onClick={startCreating} disabled={creating}>
            Nuevo proveedor
          </Button>
        )}
        <Button variant="secondary" onClick={reload} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

      <Surface border="muted" className="flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="supplier-search"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Buscar proveedor
          </label>
          <TextField
            id="supplier-search"
            type="search"
            placeholder="Nombre, contacto, NIT…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            icon={<Search className="size-4" aria-hidden="true" />}
          />
        </div>

        <div>
          <label
            htmlFor="supplier-active"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Estado
          </label>
          <SelectField
            id="supplier-active"
            value={filters.active === undefined ? "all" : filters.active ? "yes" : "no"}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                active: event.target.value === "all" ? undefined : event.target.value === "yes",
                page: 1,
              }))
            }
          >
            <option value="all">Todos</option>
            <option value="yes">Activos</option>
            <option value="no">Inactivos</option>
          </SelectField>
        </div>

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
            Nuevo proveedor
          </h2>
          <SupplierForm
            supplier={null}
            brands={brands}
            onSaved={onSaved}
            onCancel={() => setCreating(false)}
          />
        </Surface>
      )}

      {rows.length === 0 && !loading && !error ? (
        <EmptyState>
          {filtered
            ? "Ningún proveedor coincide con el filtro."
            : "Todavía no hay proveedores. Un ingreso puede registrarse sin proveedor, pero entonces no queda de quién."}
        </EmptyState>
      ) : (
        <RecordList
          items={rows}
          idOf={(row) => row.id}
          columns={COLUMNS}
          headers={["Proveedor", "Contacto", "WhatsApp", "Pago", "Acciones"]}
          open={open}
          onToggle={toggle}
          // El operador no edita el proveedor, pero sí su imagen (§4.5 del
          // traspaso de imágenes): un panel propio, no el formulario.
          panelsFor={() =>
            canWrite
              ? [
                  { key: "ficha", label: "Ficha" },
                  { key: "edit", label: "Editar" },
                ]
              : [
                  { key: "ficha", label: "Ficha" },
                  { key: "image", label: "Imagen" },
                ]
          }
          renderCells={(row) => (
            <>
              <Cell label="Proveedor">
                <span className="block">{row.name}</span>
                {!row.active && (
                  <PixelLabel variant="outline" className="mt-1">
                    INACTIVO
                  </PixelLabel>
                )}
              </Cell>
              <Cell label="Contacto">{row.contactName ?? <span className="text-muted">—</span>}</Cell>
              <Cell label="WhatsApp">
                {row.whatsapp ? (
                  <a className="hover:text-action hover:underline" href={`tel:${row.whatsapp}`}>
                    {row.whatsapp}
                  </a>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Cell>
              <Cell label="Pago">{row.paymentTerms ?? <span className="text-muted">—</span>}</Cell>
            </>
          )}
          renderPanel={(row, panel) => (
            // `key` por proveedor: la ficha se pide al abrir y arranca limpia.
            <SupplierPanel
              key={row.id}
              supplierId={row.id}
              panel={panel}
              brands={brands}
              onSaved={onSaved}
              onCancel={() => setOpen(null)}
            />
          )}
        />
      )}

      <Pager
        pagination={data?.pagination ?? null}
        loading={loading}
        noun="proveedores"
        onPage={(step) => setFilters((current) => ({ ...current, page: current.page + step }))}
      />
    </div>
  );
}
