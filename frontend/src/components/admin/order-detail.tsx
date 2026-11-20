"use client";

import { STATUS_LABEL, customerWhatsApp } from "@/lib/admin-orders";
import { formatPhoneCO } from "@/lib/contact";
import { formatDateTimeCO, formatPriceCOP } from "@/lib/utils";
import type { Order } from "@/types/admin";

/**
 * Ficha de un pedido en `/admin/orders` (ADR-003): líneas con precio de
 * catálogo y cobrado, totales, datos del cliente, autorización y fechas de
 * cada paso.
 *
 * Los datos del cliente son personales (Ley 1581): se ven aquí y en la lista
 * porque es la finalidad autorizada (gestionar el pedido), pero no se copian
 * a ningún otro sitio de la consola.
 */

const TERM = "vp-label text-muted";

export function OrderSummary({ order }: { order: Order }) {
  const whatsapp = customerWhatsApp(order);
  const charged = order.lines.some((line) => line.unitPrice !== null);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section aria-label="Líneas del pedido">
        <ul className="divide-y-2 divide-muted border-2 border-muted">
          {order.lines.map((line) => {
            const price = line.unitPrice ?? line.listPrice;
            const discounted = line.unitPrice !== null && line.unitPrice !== line.listPrice;
            return (
              <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold uppercase tracking-[0.02em]">
                    {line.quantity} × {line.productName}
                  </p>
                  <p className="text-sm text-muted">{line.variantName}</p>
                </div>
                <div className="text-right font-display text-sm">
                  <p className="font-bold">{formatPriceCOP(price * line.quantity)}</p>
                  <p className="text-xs text-muted">
                    {formatPriceCOP(price)} c/u
                    {discounted && <> · lista {formatPriceCOP(line.listPrice)}</>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <dl className="mt-3 space-y-1 font-display text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Subtotal de catálogo al recibir</dt>
            <dd>{formatPriceCOP(order.subtotal)}</dd>
          </div>
          {order.deliveryFee !== null && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Domicilio</dt>
              <dd>{formatPriceCOP(order.deliveryFee)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 border-t-2 border-muted pt-1 text-base font-bold">
            <dt>{order.total === null ? "Total (sin confirmar)" : charged ? "Total cobrado" : "Total"}</dt>
            <dd>{formatPriceCOP(order.total ?? order.subtotal)}</dd>
          </div>
        </dl>
      </section>

      <div className="space-y-5">
        <section aria-label="Cliente">
          <h3 className={TERM}>Cliente</h3>
          {order.customer ? (
            <dl className="mt-2 space-y-1 text-sm">
              <div>
                <dt className="sr-only">Nombre</dt>
                <dd className="font-display font-bold">{order.customer.name}</dd>
              </div>
              <div>
                <dt className="sr-only">Celular</dt>
                <dd>
                  {whatsapp ? (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center text-action underline underline-offset-4"
                    >
                      {formatPhoneCO(order.customer.phone)}
                      <span className="sr-only"> (abrir WhatsApp)</span>
                    </a>
                  ) : (
                    formatPhoneCO(order.customer.phone)
                  )}
                </dd>
              </div>
              <div>
                <dt className="sr-only">Barrio</dt>
                <dd>Barrio {order.customer.neighborhood}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Anonimizado
              {order.anonymizedAt ? ` el ${formatDateTimeCO(order.anonymizedAt)}` : ""}: no quedan nombre,
              celular ni barrio.
            </p>
          )}
        </section>

        <section aria-label="Autorización de datos">
          <h3 className={TERM}>Autorización de datos</h3>
          <p className="mt-2 text-sm">
            {order.consent
              ? `Política ${order.consent.policyVersion}, aceptada el ${formatDateTimeCO(order.consent.acceptedAt)} (finalidad: ${order.consent.purpose}).`
              : "Sin registro de autorización."}
          </p>
        </section>

        <section aria-label="Historial">
          <h3 className={TERM}>Historial</h3>
          <ul className="mt-2 space-y-0.5 text-sm">
            <li>Recibido: {formatDateTimeCO(order.createdAt)}</li>
            {order.confirmedAt && <li>Confirmado: {formatDateTimeCO(order.confirmedAt)}</li>}
            {order.deliveredAt && <li>Entregado: {formatDateTimeCO(order.deliveredAt)}</li>}
            {order.cancelledAt && (
              <li>
                Cancelado: {formatDateTimeCO(order.cancelledAt)}
                {order.cancelReason && <> · {order.cancelReason}</>}
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-muted">Estado actual: {STATUS_LABEL[order.status]}.</p>
        </section>
      </div>
    </div>
  );
}
