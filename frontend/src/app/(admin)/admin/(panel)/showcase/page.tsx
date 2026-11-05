"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAdminSession } from "@/components/admin/admin-shell";
import { FormError, FormStatus } from "@/components/admin/form";
import { EmptyState, Pager, ScreenHeader } from "@/components/admin/screen";
import { ShowcaseCard, blockersOf } from "@/components/admin/showcase-card";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Surface } from "@/components/ui/surface";
import { adminApi, errorMessage } from "@/lib/admin-api";
import { formatNumberCO } from "@/lib/utils";
import type { AdminProductRow } from "@/types/admin";

/**
 * Vitrina: qué productos se ven en el prisma 3D de la portada.
 *
 * El prisma tiene seis caras y las reparte `components/prism/faces.ts`: toma
 * las líneas con `showcase` y, si salen menos de seis, repite fotos en ciclo;
 * si salen más, las que pasan de la sexta no se ven. Esta pantalla existe para
 * que eso no se descubra mirando la portada, así que **cuenta las caras** y
 * avisa de los dos desajustes.
 *
 * DOS LISTAS, DOS PETICIONES. Las elegidas arriba y el resto del catálogo
 * abajo. El listado del backend ordena por estado y nombre, de modo que con
 * una sola lista paginada una elegida podría caer en la página 3 y quedar
 * fuera de la vista; pidiéndolas por `showcase` se tienen siempre delante,
 * cuesten lo que cuesten dos consultas de una tabla de este tamaño.
 *
 * `showcase` es columna de la línea, así que se guarda con el PATCH de siempre
 * (`/api/admin/products/:id`). No hay endpoint nuevo, y por lo mismo el cambio
 * queda auditado con autor como cualquier otra edición del catálogo.
 */

/** Caras del prisma. Tiene que cuadrar con `ProductPrism` y con `app/page.tsx`. */
const SIDES = 6;

/** Tope de elegidas que se piden. Pasar de ahí ya es el error que se avisa. */
const CHOSEN_LIMIT = 50;

const CANDIDATES_PAGE_SIZE = 24;

const SEARCH_DEBOUNCE_MS = 500;

/** Filtros del listado de candidatas. `version` fuerza la recarga. */
interface Filters {
  q: string;
  page: number;
  version: number;
}

const INITIAL_FILTERS: Filters = { q: "", page: 1, version: 0 };

export default function ShowcasePage() {
  const { identity } = useAdminSession();
  const canWrite = identity.role === "owner";

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // `useAdminQuery` toma la IDENTIDAD del objeto de filtros como identidad de
  // la consulta, así que las dos listas llevan el suyo: el de las elegidas solo
  // cambia con `version`, y de ese modo buscar o paginar abajo no vuelve a
  // pedir las de arriba. Son las seis que importan y se quieren siempre a la
  // vista, también mientras se busca otra cosa para añadir.
  const chosenFilters = useMemo(() => ({ version: filters.version }), [filters.version]);

  const fetchChosen = useCallback(
    () => adminApi.products({ showcase: true, page: 1, limit: CHOSEN_LIMIT }),
    [],
  );

  const fetchCandidates = useCallback(
    (current: Filters) =>
      adminApi.products({
        showcase: false,
        q: current.q || undefined,
        page: current.page,
        limit: CANDIDATES_PAGE_SIZE,
      }),
    [],
  );

  const chosen = useAdminQuery(chosenFilters, fetchChosen, "No se pudo cargar la vitrina");
  const candidates = useAdminQuery(filters, fetchCandidates, "No se pudo cargar el catálogo");

  const chosenRows = chosen.data?.data ?? [];
  const candidateRows = candidates.data?.data ?? [];

  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((current) =>
        current.q === search.trim() ? current : { ...current, q: search.trim(), page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  /** Vuelve a pedir las dos listas: un cambio mueve la línea de una a otra. */
  const refresh = useCallback(
    () => setFilters((current) => ({ ...current, version: current.version + 1 })),
    [],
  );

  const onToggle = useCallback(
    async (row: AdminProductRow, showcase: boolean) => {
      setSaved(null);
      setSaveError(null);
      try {
        await adminApi.updateProduct(row.id, { showcase });
        setSaved(
          showcase
            ? `«${row.name}» entra en la vitrina.`
            : `«${row.name}» sale de la vitrina.`,
        );
        refresh();
      } catch (cause) {
        setSaveError(errorMessage(cause, "No se pudo cambiar la vitrina"));
        // Se relanza para que la tarjeta no se dé por cambiada.
        throw cause;
      }
    },
    [refresh],
  );

  const loading = chosen.loading || candidates.loading;
  const blocked = chosenRows.filter((row) => blockersOf(row).length > 0).length;

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Vitrina"
        description="Qué productos giran en el prisma 3D de la portada."
      >
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

      <FaceCount
        chosen={chosenRows.length}
        blocked={blocked}
        loading={chosen.loading && chosen.data === null}
      />

      {chosen.error && <FormError>{chosen.error}</FormError>}
      {saveError && <FormError>{saveError}</FormError>}
      {saved && <FormStatus>{saved}</FormStatus>}

      <section className="space-y-3" aria-label="En la vitrina">
        <h2 className="font-display text-lg font-bold uppercase tracking-[0.02em]">
          En la vitrina{" "}
          <span className="text-muted">({formatNumberCO(chosenRows.length)})</span>
        </h2>

        {chosenRows.length === 0 ? (
          <EmptyState>
            Ninguna línea elegida. Mientras siga así, la portada reparte las seis caras entre
            el catálogo publicado.
          </EmptyState>
        ) : (
          <Grid>
            {chosenRows.map((row) => (
              <ShowcaseCard key={row.id} row={row} canWrite={canWrite} onToggle={onToggle} />
            ))}
          </Grid>
        )}
      </section>

      <section className="space-y-3" aria-label="Resto del catálogo">
        <h2 className="font-display text-lg font-bold uppercase tracking-[0.02em]">
          Resto del catálogo
        </h2>

        <Surface border="muted" className="flex flex-wrap items-end gap-4 p-4">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="showcase-search"
              className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
            >
              Buscar línea
            </label>
            <TextField
              id="showcase-search"
              type="search"
              placeholder="ECO PRO, ONE, pod…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              icon={<Search className="size-4" aria-hidden="true" />}
            />
          </div>
          {search !== "" && (
            <Button variant="ghost" onClick={() => setSearch("")}>
              Quitar filtro
            </Button>
          )}
        </Surface>

        {candidates.error && <FormError>{candidates.error}</FormError>}

        {candidateRows.length === 0 && !candidates.loading && !candidates.error ? (
          <EmptyState>
            {filters.q !== ""
              ? "Ninguna línea fuera de la vitrina coincide con la búsqueda."
              : "Todo el catálogo está en la vitrina."}
          </EmptyState>
        ) : (
          <Grid>
            {candidateRows.map((row) => (
              <ShowcaseCard key={row.id} row={row} canWrite={canWrite} onToggle={onToggle} />
            ))}
          </Grid>
        )}

        <Pager
          pagination={candidates.data?.pagination ?? null}
          loading={candidates.loading}
          noun="líneas"
          onPage={(step) => setFilters((current) => ({ ...current, page: current.page + step }))}
        />
      </section>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}

/**
 * El recuento de caras y lo que pasa si no cuadra.
 *
 * Es la razón de ser de la pantalla: el desajuste entre lo elegido y las seis
 * caras no se ve en la portada —una foto repetida parece intencionada y una
 * séptima línea ausente no deja rastro—, así que se dice aquí.
 */
function FaceCount({
  chosen,
  blocked,
  loading,
}: {
  chosen: number;
  blocked: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Surface border="muted" className="p-4">
        <p className="text-sm text-muted">Contando caras…</p>
      </Surface>
    );
  }

  const exact = chosen === SIDES;
  const visible = chosen - blocked;

  return (
    <Surface border={exact && blocked === 0 ? "accent" : "line"} className="p-4">
      <p className="font-display text-sm font-bold uppercase tracking-[0.02em]">
        {formatNumberCO(chosen)} de {SIDES} caras
      </p>

      <p className="mt-1 text-sm text-muted">
        {chosen === 0
          ? "Sin elegir nada, la portada reparte las seis caras entre el catálogo publicado."
          : chosen < SIDES
            ? `Faltan ${formatNumberCO(SIDES - chosen)}: el prisma repite fotos para completar las seis caras.`
            : chosen > SIDES
              ? `Sobran ${formatNumberCO(chosen - SIDES)}: solo se ven seis, y las demás quedan fuera sin avisar en la portada.`
              : "Seis caras, seis productos: cada uno se ve una vez."}
      </p>

      {blocked > 0 && (
        <p className="mt-1 text-sm font-bold text-accent">
          {formatNumberCO(blocked)}{" "}
          {blocked === 1 ? "elegida no llegará a verse" : "elegidas no llegarán a verse"}: hacen
          falta línea publicada, con precio y con imagen. Caras reales:{" "}
          {formatNumberCO(Math.max(visible, 0))}.
        </p>
      )}
    </Surface>
  );
}
