"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useAdminSession } from "@/components/admin/admin-shell";
import { FormError, FormStatus, Labelled } from "@/components/admin/form";
import { OrderActionsPanel } from "@/components/admin/order-actions";
import { OrderSummary } from "@/components/admin/order-detail";
import { Cell, RecordList, type OpenPanel } from "@/components/admin/record-list";
import { EmptyState, Pager, ScreenHeader } from "@/components/admin/screen";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { adminApi, errorMessage } from "@/lib/admin-api";
import { STATUS_LABEL, STATUS_ORDER, dayBoundary } from "@/lib/admin-orders";
import { formatDateTimeCO, formatPriceCOP } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types/admin";

/**
 * Pedidos (ADR-003): los que llegan del carrito, del más reciente al más
 * antiguo.
 *
 * Leer, confirmar, entregar y cancelar es de cualquier sesión (es el trabajo
 * diario); cobrar otro precio que el de catálogo, anonimizar y aplicar el plazo
 * de conservación, solo del dueño. El backend lo impone; aquí se ocultan los
 * controles que responderían 403.
 *
 * Tras cada acción, la fila se reemplaza con el pedido que devuelve el
 * backend. Si el aviso al sitio falló, el mensaje dice que el disponible
 * público tardará hasta 60 s.
 *
 * **Regla operativa**: un pedido se descuenta confirmándolo aquí, nunca con
 * una venta a mano en Inventario, o el stock se restaría dos veces.
 */

const PAGE_SIZE = 20;

/** La consola tiene 30 peticiones por minuto: buscar al teclear necesita freno. */
const SEARCH_DEBOUNCE_MS = 500;

interface Filters {
  q: string;
  status: OrderStatus | "";
  /** `YYYY-MM-DD` del selector, en hora local. */
  from: string;
  to: string;
  page: number;
}

const INITIAL_FILTERS: Filters = { q: "", status: "", from: "", to: "", page: 1 };

const COLUMNS = "md:grid-cols-[9rem_minmax(0,1.2fr)_8rem_8rem_auto]";

const STATUS_VARIANT: Record<OrderStatus, "lime" | "violet" | "outline"> = {
  received: "lime",
  confirmed: "violet",
  delivered: "outline",
  cancelled: "outline",
};

export default function OrdersPage() {
  const { identity } = useAdminSession();
  const isOwner = identity.role === "owner";
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [open, setOpen] = useState<OpenPanel | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retentionAsked, setRetentionAsked] = useState(false);
  const [retaining, setRetaining] = useState(false);

  const fetchOrders = useCallback(
    (current: Filters) =>
      adminApi.orders.list({
        q: current.q || undefined,
        status: current.status || undefined,
        from: dayBoundary(current.from, "start"),
        to: dayBoundary(current.to, "end"),
        page: current.page,
        limit: PAGE_SIZE,
      }),
    [],
  );

  const { data, error, loading, patch } = useAdminQuery(filters, fetchOrders, "No se pudieron cargar los pedidos");
  const rows = data?.data ?? [];

  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((current) =>
        current.q === search.trim() ? current : { ...current, q: search.trim(), page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  /** Tras una acción: la fila se reemplaza con lo que devolvió el backend, sin recargar. */
  const applied = useCallback(
    (order: Order, message: string) => {
      patch((page) => ({ ...page, data: page.data.map((row) => (row.id === order.id ? order : row)) }));
      setStatus(message);
      setActionError(null);
    },
    [patch],
  );

  async function applyRetention() {
    setRetaining(true);
    setStatus(null);
    setActionError(null);
    try {
      const result = await adminApi.orders.applyRetention();
      setStatus(
        result.cancelled === 0 && result.anonymized === 0
          ? "Plazo de conservación aplicado: no había nada que caducar ni anonimizar."
          : `Plazo de conservación aplicado: ${result.cancelled} pedido(s) caducado(s) y ${result.anonymized} anonimizado(s).`,
      );
      setFilters((current) => ({ ...current }));
    } catch (cause) {
      setActionError(errorMessage(cause, "No se pudo aplicar el plazo de conservación"));
    } finally {
      setRetaining(false);
      setRetentionAsked(false);
    }
  }

  const reload = useCallback(() => setFilters((current) => ({ ...current })), []);

  const filtered = filters.q !== "" || filters.status !== "" || filters.from !== "" || filters.to !== "";
  const badRange = filters.from !== "" && filters.to !== "" && filters.from > filters.to;

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Pedidos"
        description="Los que llegan del carrito. Confirmar descuenta el stock: no registres esa venta a mano en Inventario."
      >
        {isOwner && (
          <Button
            variant="secondary"
            onClick={() => setRetentionAsked((asked) => !asked)}
            aria-expanded={retentionAsked}
            aria-controls="orders-retention"
          >
            Plazo de conservación
          </Button>
        )}
        <Button variant="secondary" onClick={reload} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

      {isOwner && retentionAsked && (
        <Surface border="accent" id="orders-retention" className="space-y-3 p-4">
          <p className="text-sm">
            Cancela como caducados los pedidos recibidos hace más de 30 días sin confirmar y anonimiza
            los entregados o cancelados hace más de 365 días (ADR-003). No mueve stock y no se
            deshace. ¿Aplicarlo ahora?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void applyRetention()} disabled={retaining}>
              {retaining ? "Aplicando…" : "Sí, aplicar"}
            </Button>
            <Button variant="ghost" onClick={() => setRetentionAsked(false)} disabled={retaining}>
              Cancelar
            </Button>
          </div>
        </Surface>
      )}

      <Surface border="muted" className="flex flex-wrap items-end gap-4 p-4">
        <Labelled label="Buscar" htmlFor="orders-search" className="min-w-0 flex-1 basis-64">
          <TextField
            id="orders-search"
            type="search"
            placeholder="VP-…, nombre o celular"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            icon={<Search className="size-4" aria-hidden="true" />}
          />
        </Labelled>

        <Labelled label="Estado" htmlFor="orders-status">
          <SelectField
            id="orders-status"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value as OrderStatus | "", page: 1 }))
            }
          >
            <option value="">Todos</option>
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </SelectField>
        </Labelled>

        <Labelled label="Desde" htmlFor="orders-from">
          <TextField
            id="orders-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value, page: 1 }))}
          />
        </Labelled>

        <Labelled label="Hasta" htmlFor="orders-to">
          <TextField
            id="orders-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value, page: 1 }))}
          />
        </Labelled>

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

      {badRange && <FormError>La fecha «desde» es posterior a «hasta».</FormError>}
      {error && !badRange && <FormError>{error}</FormError>}
      {actionError && <FormError>{actionError}</FormError>}
      {status && <FormStatus>{status}</FormStatus>}

      {rows.length === 0 && !loading && !error ? (
        <EmptyState>
          {filtered
            ? "Ningún pedido coincide con el filtro."
            : "Todavía no hay pedidos. Llegan aquí cuando el carrito los registra al enviarlos por WhatsApp."}
        </EmptyState>
      ) : (
        <RecordList
          items={rows}
          idOf={(order) => order.id}
          columns={COLUMNS}
          headers={["Pedido", "Cliente", "Estado", "Total", ""]}
          renderCells={(order) => (
            <>
              <Cell label="Pedido">
                <span className="font-bold tracking-[0.04em]">{order.reference}</span>
                <span className="block text-xs text-muted">{formatDateTimeCO(order.createdAt)}</span>
              </Cell>
              <Cell label="Cliente">
                {order.customer ? (
                  <>
                    {order.customer.name}
                    <span className="block text-xs text-muted">{order.customer.neighborhood}</span>
                  </>
                ) : (
                  <span className="text-muted">Anonimizado</span>
                )}
              </Cell>
              <Cell label="Estado">
                <PixelLabel variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status].toUpperCase()}</PixelLabel>
              </Cell>
              <Cell label="Total">
                {formatPriceCOP(order.total ?? order.subtotal)}
                <span className="block text-xs text-muted">
                  {order.lines.reduce((sum, line) => sum + line.quantity, 0)} u.
                  {order.total === null ? " · sin domicilio" : ""}
                </span>
              </Cell>
            </>
          )}
          panelsFor={() => [{ key: "detail", label: "Ver" }]}
          open={open}
          onToggle={(id, panel) =>
            setOpen((current) => (current?.id === id && current.panel === panel ? null : { id, panel }))
          }
          renderPanel={(order) => (
            <>
              <OrderSummary order={order} />
              {/* `key` con el estado: tras una transición, el panel arranca limpio. */}
              <OrderActionsPanel
                key={`${order.id}:${order.status}:${order.anonymizedAt ?? ""}`}
                order={order}
                role={identity.role}
                onDone={applied}
              />
            </>
          )}
        />
      )}

      <Pager
        pagination={data?.pagination ?? null}
        loading={loading}
        noun="pedidos"
        onPage={(step) => setFilters((current) => ({ ...current, page: current.page + step }))}
      />
    </div>
  );
}
