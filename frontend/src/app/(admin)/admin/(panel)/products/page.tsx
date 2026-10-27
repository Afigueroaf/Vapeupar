"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useAdminSession } from "@/components/admin/admin-shell";
import { CATEGORIES, CATEGORY_LABELS, gapsOf } from "@/components/admin/catalog";
import { FormError, FormStatus } from "@/components/admin/form";
import { ProductForm } from "@/components/admin/product-form";
import { ProductPanel } from "@/components/admin/product-panel";
import { ReadinessChips } from "@/components/admin/readiness";
import { Cell, RecordList, type OpenPanel } from "@/components/admin/record-list";
import { EmptyState, Pager, ScreenHeader } from "@/components/admin/screen";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { adminApi, type ProductWithReadiness } from "@/lib/admin-api";
import { formatNumberCO, formatPriceCOP } from "@/lib/utils";
import type { ProductCategory } from "@/types/product";
import type { AdminProductRow, AdminVariantRow, BrandRow, ProductStatus } from "@/types/admin";

/**
 * Líneas de producto y sus variantes (plan A5.3).
 *
 * Aquí se edita el **precio**, y solo aquí. La publicación es explícita y la
 * pantalla dice qué falta antes de intentarla: precio, imagen y al menos una
 * variante activa. Esos tres datos vienen en la fila, así que el listado puede
 * avisar sin pedir veinte fichas.
 *
 * Tampoco hay borrado: el libro de inventario referencia las variantes. Retirar
 * una línea del sitio es pasarla a borrador.
 */

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 500;

interface Filters {
  q: string;
  brandId: string;
  category: ProductCategory | "";
  status: ProductStatus | "";
  page: number;
}

const INITIAL_FILTERS: Filters = { q: "", brandId: "", category: "", status: "", page: 1 };

const COLUMNS =
  "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_8rem_7rem_auto]";

export default function ProductsPage() {
  const { identity } = useAdminSession();
  const canWrite = identity.role === "owner";

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<OpenPanel | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandRow[] | null>(null);

  const fetchProducts = useCallback(
    (current: Filters) =>
      adminApi.products({
        q: current.q || undefined,
        brandId: current.brandId || undefined,
        category: current.category || undefined,
        status: current.status || undefined,
        page: current.page,
        limit: PAGE_SIZE,
      }),
    [],
  );

  const { data, error, loading, patch } = useAdminQuery(
    filters,
    fetchProducts,
    "No se pudieron cargar las líneas",
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

  // Marcas para el selector del formulario y para el filtro.
  useEffect(() => {
    let alive = true;
    adminApi.brands({ limit: 100 }).then(
      (page) => {
        if (alive) setBrands(page.data);
      },
      () => {
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

  function onSaved(result: ProductWithReadiness, created: boolean) {
    const { product } = result;
    setSaved(
      created
        ? `Línea «${product.name}» creada como ${product.status === "published" ? "publicada" : "borrador"}. Ahora necesita variantes.`
        : `Línea «${product.name}» guardada${product.status === "published" ? " y publicada" : ""}.`,
    );
    setCreating(false);
    if (created) {
      reload();
      return;
    }
    patch((page) => ({
      ...page,
      data: page.data.map((row) => (row.id === product.id ? { ...row, ...product } : row)),
    }));
  }

  /** Tras tocar variantes: los contadores de la fila, sin recargar la tabla. */
  const onVariantsChanged = useCallback(
    (productId: string, variants: AdminVariantRow[]) => {
      patch((page) => ({
        ...page,
        data: page.data.map((row) =>
          row.id === productId
            ? {
                ...row,
                variantCount: variants.length,
                activeVariantCount: variants.filter((variant) => variant.active).length,
              }
            : row,
        ),
      }));
    },
    [patch],
  );

  const filtered =
    filters.q !== "" || filters.brandId !== "" || filters.category !== "" || filters.status !== "";

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Líneas"
        description="El catálogo. El precio se edita aquí; el disponible, en inventario."
      >
        {canWrite && (
          <Button variant="secondary" onClick={startCreating} disabled={creating}>
            Nueva línea
          </Button>
        )}
        <Button variant="secondary" onClick={reload} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

      <Surface border="muted" className="flex flex-wrap items-end gap-4 p-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="product-search"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Buscar línea
          </label>
          <TextField
            id="product-search"
            type="search"
            placeholder="ECO PRO, pod, 12 ml…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            icon={<Search className="size-4" aria-hidden="true" />}
          />
        </div>

        <div>
          <label
            htmlFor="product-brand"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Marca
          </label>
          <SelectField
            id="product-brand"
            value={filters.brandId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, brandId: event.target.value, page: 1 }))
            }
          >
            <option value="">Todas</option>
            {(brands ?? []).map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div>
          <label
            htmlFor="product-category"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Categoría
          </label>
          <SelectField
            id="product-category"
            value={filters.category}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                category: event.target.value as ProductCategory | "",
                page: 1,
              }))
            }
          >
            <option value="">Todas</option>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </div>

        <div>
          <label
            htmlFor="product-status"
            className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
          >
            Estado
          </label>
          <SelectField
            id="product-status"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as ProductStatus | "",
                page: 1,
              }))
            }
          >
            <option value="">Todos</option>
            <option value="published">Publicadas</option>
            <option value="draft">Borradores</option>
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
            Nueva línea
          </h2>
          <p className="text-sm text-muted">
            Una línea nace en borrador: se publica cuando tenga precio, imagen y al menos una
            variante activa.
          </p>
          <ProductForm
            product={null}
            brands={brands}
            readiness={null}
            onSaved={onSaved}
            onCancel={() => setCreating(false)}
          />
        </Surface>
      )}

      {rows.length === 0 && !loading && !error ? (
        <EmptyState>
          {filtered
            ? "Ninguna línea coincide con el filtro."
            : "Todavía no hay líneas. Para crear la primera hace falta una marca."}
        </EmptyState>
      ) : (
        <RecordList
          items={rows}
          idOf={(row) => row.id}
          columns={COLUMNS}
          headers={["Linea", "Marca", "Categoria", "Precio", "Variantes", "Acciones"]}
          open={open}
          onToggle={toggle}
          panelsFor={() =>
            canWrite
              ? [
                  { key: "edit", label: "Editar" },
                  { key: "variants", label: "Variantes" },
                ]
              : [{ key: "variants", label: "Variantes" }]
          }
          renderCells={(row: AdminProductRow) => (
            <>
              <Cell label="Línea">
                <span className="block">{row.name}</span>
                <span className="text-xs text-muted">{row.slug}</span>
                {row.status === "draft" && (
                  <PixelLabel variant="outline" className="mt-1">
                    BORRADOR
                  </PixelLabel>
                )}
                <ReadinessChips gaps={gapsOf(row)} />
              </Cell>
              <Cell label="Marca">{row.brandName}</Cell>
              <Cell label="Categoría">{CATEGORY_LABELS[row.category]}</Cell>
              <Cell label="Precio">
                {row.price === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <>
                    <span className="block">{formatPriceCOP(row.price)}</span>
                    {row.compareAtPrice !== null && (
                      <span className="text-xs text-muted line-through">
                        {formatPriceCOP(row.compareAtPrice)}
                      </span>
                    )}
                  </>
                )}
              </Cell>
              <Cell label="Variantes">
                {formatNumberCO(row.activeVariantCount)}
                <span className="text-muted"> / {formatNumberCO(row.variantCount)}</span>
              </Cell>
            </>
          )}
          renderPanel={(row, panel) => (
            // `key` por línea: la ficha se pide al abrir y arranca limpia.
            <ProductPanel
              key={row.id}
              productId={row.id}
              panel={panel}
              brands={brands}
              canWrite={canWrite}
              onSaved={onSaved}
              onVariantsChanged={onVariantsChanged}
              onCancel={() => setOpen(null)}
            />
          )}
        />
      )}

      <Pager
        pagination={data?.pagination ?? null}
        loading={loading}
        noun="líneas"
        onPage={(step) => setFilters((current) => ({ ...current, page: current.page + step }))}
      />
    </div>
  );
}
