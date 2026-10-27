"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { AdminApiError, adminApi } from "@/lib/admin-api";
import { formatNumberCO } from "@/lib/utils";
import type { StockMovementType, StockRow, SupplierRow } from "@/types/admin";
import { FormError, FormStatus, Labelled } from "./form";
import { MOVEMENT_HINTS, MOVEMENT_LABELS, MOVEMENT_TYPES } from "./movement-labels";

/**
 * Registro de un movimiento, en línea sobre la fila de la variante (plan A5.1).
 *
 * La `operationKey` se genera **una por intento de operación**, no por
 * petición: si el envío falla o se repite el clic, la misma clave viaja otra
 * vez y el backend reconoce el reintento en vez de duplicar el movimiento
 * (responde 200 con `replayed`). Solo se genera una clave nueva cuando el
 * movimiento anterior se registró de verdad.
 *
 * Las reglas las impone `StockService`; aquí se evita el viaje de ida y vuelta
 * cuando el error es evidente, y se ocultan los campos que no aplican.
 */
interface MovementFormProps {
  row: StockRow;
  /** Proveedores ya cargados, o `null` si todavía no se han pedido. */
  suppliers: SupplierRow[] | null;
  /** Se llama al abrir un ingreso: el selector los necesita. */
  onNeedSuppliers: () => void;
  /** Disponible resultante, para actualizar la tabla sin recargar. */
  onApplied: (stock: number) => void;
}

export function MovementForm({ row, suppliers, onNeedSuppliers, onApplied }: MovementFormProps) {
  const [type, setType] = useState<StockMovementType>("inbound");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [lot, setLot] = useState("");
  const [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const isInbound = type === "inbound";
  const isAdjustment = type === "adjustment";

  useEffect(() => {
    if (isInbound && suppliers === null) onNeedSuppliers();
  }, [isInbound, suppliers, onNeedSuppliers]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount === 0) {
      setError("La cantidad tiene que ser un número entero distinto de cero");
      return;
    }
    if (!isAdjustment && amount < 0) {
      setError("La cantidad va en positivo: el tipo de movimiento define el signo");
      return;
    }
    if (isAdjustment && !reason.trim()) {
      setError("Un ajuste exige motivo");
      return;
    }

    setPending(true);
    try {
      const movement = await adminApi.movement({
        variantId: row.variantId,
        type,
        quantity: amount,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(isInbound && supplierId ? { supplierId } : {}),
        ...(isInbound && unitCost ? { unitCost: Number(unitCost) } : {}),
        ...(lot.trim() ? { lot: lot.trim() } : {}),
        operationKey,
      });

      onApplied(movement.stock);
      setResult(
        movement.replayed
          ? `Ese movimiento ya estaba registrado. Disponible: ${formatNumberCO(movement.stock)}`
          : `${MOVEMENT_LABELS[type]} registrado. Disponible: ${formatNumberCO(movement.stock)}`,
      );
      // Operación cerrada: la siguiente es otra, con su propia clave.
      setOperationKey(crypto.randomUUID());
      setQuantity("");
      setReason("");
      setUnitCost("");
      setLot("");
    } catch (cause) {
      const field = cause instanceof AdminApiError ? cause.fields?.[0] : undefined;
      setError(field?.message ?? (cause instanceof Error ? cause.message : "No se pudo registrar"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Labelled label="Tipo" htmlFor={`type-${row.variantId}`}>
          <SelectField
            id={`type-${row.variantId}`}
            value={type}
            onChange={(event) => setType(event.target.value as StockMovementType)}
          >
            {MOVEMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {MOVEMENT_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </Labelled>

        <Labelled
          label={isAdjustment ? "Cantidad (con signo)" : "Cantidad"}
          htmlFor={`qty-${row.variantId}`}
        >
          <TextField
            id={`qty-${row.variantId}`}
            type="number"
            inputMode="numeric"
            step={1}
            min={isAdjustment ? undefined : 1}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Labelled>

        {isInbound && (
          <>
            <Labelled label="Proveedor" htmlFor={`supplier-${row.variantId}`}>
              <SelectField
                id={`supplier-${row.variantId}`}
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">Sin proveedor</option>
                {(suppliers ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </SelectField>
            </Labelled>

            <Labelled label="Costo unitario (COP)" htmlFor={`cost-${row.variantId}`}>
              <TextField
                id={`cost-${row.variantId}`}
                type="number"
                inputMode="numeric"
                step={1}
                min={0}
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
              />
            </Labelled>
          </>
        )}

        <Labelled
          label={isAdjustment ? "Motivo (obligatorio)" : "Motivo"}
          htmlFor={`reason-${row.variantId}`}
          className={isInbound ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-2"}
        >
          <TextField
            id={`reason-${row.variantId}`}
            maxLength={500}
            required={isAdjustment}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Labelled>

        <Labelled label="Lote" htmlFor={`lot-${row.variantId}`}>
          <TextField
            id={`lot-${row.variantId}`}
            maxLength={100}
            value={lot}
            onChange={(event) => setLot(event.target.value)}
          />
        </Labelled>
      </div>

      <p className="text-xs text-muted">{MOVEMENT_HINTS[type]}</p>

      {error && <FormError>{error}</FormError>}
      {result && <FormStatus>{result}</FormStatus>}

      <Button type="submit" disabled={pending}>
        {pending ? "Registrando…" : "Registrar movimiento"}
      </Button>
    </form>
  );
}
