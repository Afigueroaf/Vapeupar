"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { formatDateTimeCO, formatNumberCO, formatPriceCOP } from "@/lib/utils";
import type { Kardex } from "@/types/admin";
import { FormError } from "./form";
import { MOVEMENT_LABELS } from "./movement-labels";

/**
 * Kardex de una variante (plan A5.1): saldo inicial, cada movimiento con su
 * saldo acumulado y saldo final. En orden cronológico, que es como se lee un
 * libro de inventario; el panel hace scroll si es largo.
 *
 * Se pide al abrir, no con la tabla: son datos que casi nunca se miran y el
 * límite de la consola son 30 peticiones por minuto.
 */
export function KardexPanel({ variantId }: { variantId: string }) {
  const [kardex, setKardex] = useState<Kardex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Sin reiniciar el estado aquí: quien lo usa monta un panel por variante
    // (`key`), así que este arranca ya vacío. Escribir estado de forma
    // sincrónica dentro del efecto es lo que React 19 desaconseja.
    adminApi.kardex(variantId).then(
      (data) => {
        if (alive) setKardex(data);
      },
      (cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : "No se pudo cargar el kardex");
      },
    );
    return () => {
      alive = false;
    };
  }, [variantId]);

  if (error) return <FormError>{error}</FormError>;

  if (!kardex) return <p className="text-sm text-muted">Cargando kardex…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">
          Saldo inicial:{" "}
          <span className="font-bold text-foreground">{formatNumberCO(kardex.openingBalance)}</span>
        </span>
        <span className="text-muted">
          Saldo final:{" "}
          <span className="font-bold text-foreground">{formatNumberCO(kardex.closingBalance)}</span>
        </span>
      </div>

      {kardex.entries.length === 0 ? (
        <p className="text-sm text-muted">Esta variante todavía no tiene movimientos.</p>
      ) : (
        <ul className="max-h-80 divide-y-2 divide-muted overflow-y-auto border-2 border-muted">
          {kardex.entries.map((entry) => (
            <li key={entry.id} className="grid gap-x-4 gap-y-1 p-3 text-sm sm:grid-cols-[10rem_7rem_5rem_5rem_1fr]">
              <span className="text-muted">{formatDateTimeCO(entry.createdAt)}</span>
              <span className="font-bold">{MOVEMENT_LABELS[entry.type]}</span>
              <span className={entry.quantity < 0 ? "text-muted" : "text-action"}>
                {entry.quantity > 0 ? "+" : ""}
                {formatNumberCO(entry.quantity)}
              </span>
              <span className="text-muted">
                saldo <span className="text-foreground">{formatNumberCO(entry.balance)}</span>
              </span>
              <span className="text-muted">
                {[
                  entry.reason,
                  entry.lot ? `lote ${entry.lot}` : null,
                  entry.unitCost !== null ? `costo ${formatPriceCOP(entry.unitCost)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
