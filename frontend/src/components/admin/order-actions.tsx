"use client";

import { useState } from "react";
import { FormError, Labelled } from "@/components/admin/form";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { AdminApiError, adminApi, errorMessage } from "@/lib/admin-api";
import {
  MAX_CANCEL_REASON,
  buildConfirmInput,
  describeIssues,
  draftTotal,
  initialConfirmDraft,
  orderActions,
  transitionMessage,
  type ConfirmDraft,
  type ConfirmErrors,
  type OrderAction,
} from "@/lib/admin-orders";
import { formatPriceCOP } from "@/lib/utils";
import type { AdminRole, Order, OrderTransition } from "@/types/admin";

/**
 * Acciones de un pedido (ADR-003 §2): confirmar, entregar, cancelar y
 * anonimizar. Cada una pide confirmación en la propia fila, como «Desactivar»
 * en Usuarios: un toque prepara, el segundo ejecuta.
 *
 * - **Confirmar** fija el domicilio y descuenta el stock de todas las líneas o
 *   de ninguna. El precio cobrado por línea solo es editable para el dueño; el
 *   operador confirma a precio de lista (el backend responde 403 a otro).
 * - **Cancelar** un confirmado devuelve el stock.
 * - **Anonimizar** borra nombre, celular y barrio de un pedido cerrado. Solo el
 *   dueño, y no se deshace.
 *
 * Un `409` con líneas (sin stock) se muestra con el nombre de cada una; un
 * `409` de estado dice que otra sesión se adelantó y que hay que actualizar.
 */

const QUESTION: Record<OrderAction, string> = {
  confirm: "¿Confirmar el pedido y descontar el stock?",
  deliver: "¿Marcarlo como entregado? Después ya no se puede cancelar.",
  cancel: "¿Cancelar el pedido?",
  anonymize: "¿Borrar nombre, celular y barrio de este pedido? No se puede deshacer.",
};

const YES: Record<OrderAction, string> = {
  confirm: "Sí, confirmar",
  deliver: "Sí, entregado",
  cancel: "Sí, cancelar pedido",
  anonymize: "Sí, anonimizar",
};

export function OrderActionsPanel({
  order,
  role,
  onDone,
}: {
  order: Order;
  role: AdminRole;
  onDone: (order: Order, message: string) => void;
}) {
  const actions = orderActions(order, role);
  const [step, setStep] = useState<OrderAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [draft, setDraft] = useState<ConfirmDraft>(() => initialConfirmDraft(order));
  const [fieldErrors, setFieldErrors] = useState<ConfirmErrors>({});
  const [reason, setReason] = useState("");

  const isOwner = role === "owner";
  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = draftTotal(order, draft, role);

  if (!actions.confirm && !actions.deliver && !actions.cancel && !actions.anonymize) return null;

  /** Primer toque: valida lo que haga falta y abre la pregunta. */
  function prepare(action: OrderAction) {
    setError(null);
    setIssues([]);
    if (action === "confirm") {
      const built = buildConfirmInput(order, draft, role);
      if (!built.ok) {
        setFieldErrors(built.errors);
        return;
      }
      setFieldErrors({});
    }
    setStep(action);
  }

  async function run(action: OrderAction) {
    setBusy(true);
    setError(null);
    setIssues([]);
    const before = order.status;
    try {
      let result: OrderTransition;
      if (action === "confirm") {
        const built = buildConfirmInput(order, draft, role);
        if (!built.ok) {
          setFieldErrors(built.errors);
          return;
        }
        result = await adminApi.orders.confirm(order.id, built.input);
      } else if (action === "deliver") {
        result = await adminApi.orders.deliver(order.id);
      } else if (action === "cancel") {
        result = await adminApi.orders.cancel(order.id, reason.trim() || undefined);
      } else {
        result = await adminApi.orders.anonymize(order.id);
      }
      setStep(null);
      onDone(result.order, transitionMessage(action, before, result));
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 409) {
        if (cause.lines && cause.lines.length > 0) {
          setIssues(describeIssues(order, cause.lines));
          setError(`${cause.message}. No se registró ninguna línea.`);
        } else {
          setError(`${cause.message}. Otra sesión pudo cambiarlo: pulsa «Actualizar».`);
        }
      } else if (cause instanceof AdminApiError && cause.status === 403 && action === "confirm") {
        setError("Solo el dueño puede cobrar un precio distinto del de catálogo.");
      } else {
        setError(errorMessage(cause, "No se pudo completar la acción"));
      }
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  const question =
    step === "confirm"
      ? `${QUESTION.confirm} ${units} unidad${units === 1 ? "" : "es"}${total !== null ? `, total ${formatPriceCOP(total)}` : ""}.`
      : step === "cancel" && order.status === "confirmed"
        ? "¿Cancelar el pedido? Se devolverá el stock de todas las líneas."
        : step
          ? QUESTION[step]
          : null;

  return (
    <div className="mt-6 space-y-4 border-t-2 border-muted pt-4">
      {actions.confirm && (
        <fieldset className="space-y-3" disabled={busy}>
          <legend className="vp-label pr-3 text-muted">Confirmar</legend>
          <Labelled
            label="Domicilio (pesos)"
            htmlFor={`fee-${order.id}`}
            hint="0 si se recoge o va incluido."
            className="max-w-48"
          >
            <TextField
              id={`fee-${order.id}`}
              inputMode="numeric"
              value={draft.deliveryFee}
              onChange={(event) => {
                setDraft((current) => ({ ...current, deliveryFee: event.target.value }));
                setStep(null);
              }}
              aria-invalid={fieldErrors.deliveryFee ? true : undefined}
              aria-describedby={fieldErrors.deliveryFee ? `fee-${order.id}-error` : undefined}
            />
          </Labelled>
          {fieldErrors.deliveryFee && (
            <p id={`fee-${order.id}-error`} className="text-sm text-action">
              {fieldErrors.deliveryFee}
            </p>
          )}

          {isOwner ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {order.lines.map((line) => {
                const id = `price-${order.id}-${line.variantId}`;
                const lineError = fieldErrors.prices?.[line.variantId];
                return (
                  <div key={line.id}>
                    <Labelled
                      label={`${line.productName} · ${line.variantName} (c/u)`}
                      htmlFor={id}
                      hint={`Lista: ${formatPriceCOP(line.listPrice)} · ${line.quantity} u.`}
                    >
                      <TextField
                        id={id}
                        inputMode="numeric"
                        value={draft.prices[line.variantId] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDraft((current) => ({ ...current, prices: { ...current.prices, [line.variantId]: value } }));
                          setStep(null);
                        }}
                        aria-invalid={lineError ? true : undefined}
                        aria-describedby={lineError ? `${id}-error` : undefined}
                      />
                    </Labelled>
                    {lineError && (
                      <p id={`${id}-error`} className="mt-1 text-sm text-action">
                        {lineError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">Se cobra a precio de catálogo. Un descuento lo aplica el dueño.</p>
          )}

          {total !== null && (
            <p className="font-display text-sm">
              Total a cobrar: <span className="font-bold">{formatPriceCOP(total)}</span>
            </p>
          )}
        </fieldset>
      )}

      {step && question ? (
        <div className="space-y-3 border-2 border-action p-3" role="group" aria-label="Confirmación">
          <p className="text-sm text-foreground">{question}</p>
          {step === "cancel" && (
            <Labelled label="Motivo (opcional)" htmlFor={`reason-${order.id}`} hint="Lo ve solo la consola.">
              <TextField
                id={`reason-${order.id}`}
                maxLength={MAX_CANCEL_REASON}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Labelled>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run(step)} disabled={busy}>
              {busy ? "Guardando…" : YES[step]}
            </Button>
            <Button variant="ghost" onClick={() => setStep(null)} disabled={busy}>
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.confirm && (
            <Button variant="secondary" onClick={() => prepare("confirm")}>
              Confirmar pedido
            </Button>
          )}
          {actions.deliver && (
            <Button variant="secondary" onClick={() => prepare("deliver")}>
              Marcar entregado
            </Button>
          )}
          {actions.cancel && (
            <Button variant="ghost" onClick={() => prepare("cancel")}>
              Cancelar pedido
            </Button>
          )}
          {actions.anonymize && (
            <Button variant="ghost" onClick={() => prepare("anonymize")}>
              Anonimizar datos
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="space-y-2">
          <FormError>{error}</FormError>
          {issues.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
