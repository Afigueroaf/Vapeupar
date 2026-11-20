"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { FormError, Labelled } from "@/components/admin/form";
import { OrderSummary } from "@/components/admin/order-detail";
import { Cell, RecordList, type OpenPanel } from "@/components/admin/record-list";
import { EmptyState, Pager, ScreenHeader } from "@/components/admin/screen";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { adminApi } from "@/lib/admin-api";
import { STATUS_LABEL, STATUS_ORDER, dayBoundary } from "@/lib/admin-orders";
import { formatDateTimeCO, formatPriceCOP } from "@/lib/utils";
import type { OrderStatus } from "@/types/admin";

/**
 * Pedidos (ADR-003): los que llegan del carrito, del más reciente al más
 * antiguo.
 *
 * Leer, confirmar, entregar y cancelar es de cualquier sesión (es el trabajo
 * diario); cobrar otro precio que el de catálogo, anonimizar y aplicar el plazo
 * de conservación, solo del dueño. El backend lo impone; aquí se ocultan los
 * controles que responderían 403.
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
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [open, setOpen] = useState<OpenPanel | null>(null);

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

  const { data, error, loading } = useAdminQuery(filters, fetchOrders, "No se pudieron cargar los pedidos");
  const rows = data?.data ?? [];

  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((current) =>
        current.q === search.trim() ? current : { ...current, q: search.trim(), page: 1 },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const reload = useCallback(() => setFilters((current) => ({ ...current })), []);

  const filtered = filters.q !== "" || filters.status !== "" || filters.from !== "" || filters.to !== "";
  const badRange = filters.from !== "" && filters.to !== "" && filters.from > filters.to;

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Pedidos"
        description="Los que llegan del carrito. Confirmar descuenta el stock: no registres esa venta a mano en Inventario."
      >
        <Button variant="secondary" onClick={reload} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </ScreenHeader>

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
          renderPanel={(order) => <OrderSummary order={order} />}
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
