"use client";

import Link from "next/link";
import { useImperativeHandle, useRef } from "react";
import { TextField } from "@/components/ui/field";
import {
  DATA_POLICY_PATH,
  TEXT_MAX,
  type CustomerDraft,
  type CustomerErrors,
  type CustomerField,
} from "@/lib/order-form";
import { cn } from "@/lib/utils";

/**
 * Datos del cliente y autorización de tratamiento (ADR-003 §4), dentro del
 * cajón del carrito. Controlado: el estado vive en el cajón, en memoria, y no
 * se guarda en el navegador.
 *
 * Accesibilidad: etiqueta visible en cada campo, error debajo del campo con
 * `aria-invalid` y `aria-describedby`, y objetivos táctiles de 44 px (los
 * campos ya lo tienen; la casilla se agranda con su fila). La casilla de
 * autorización **nunca** viene marcada, y el enlace a la política va fuera de
 * la etiqueta para que tocarlo no la marque.
 */

export interface CheckoutFormHandle {
  focus: (field: CustomerField) => void;
}

const LABEL = "mb-2 block text-sm font-semibold uppercase tracking-[0.04em]";
const ERROR = "mt-1.5 text-sm text-action";

const FIELDS: { field: Exclude<CustomerField, "consent">; label: string; hint?: string; input: React.InputHTMLAttributes<HTMLInputElement> }[] = [
  {
    field: "name",
    label: "Nombre",
    input: { autoComplete: "name", autoCapitalize: "words", placeholder: "Como te llamamos" },
  },
  {
    field: "phone",
    label: "Celular",
    hint: "Colombiano, 10 cifras. Es el WhatsApp desde el que nos escribes.",
    input: { type: "tel", inputMode: "tel", autoComplete: "tel-national", placeholder: "300 123 4567" },
  },
  {
    field: "neighborhood",
    label: "Barrio",
    hint: "En Valledupar. La dirección exacta nos la das por WhatsApp.",
    input: { autoComplete: "address-level3", placeholder: "Novalito, Los Mayales…" },
  },
];

export function CheckoutForm({
  ref,
  idPrefix,
  draft,
  errors,
  disabled,
  onChange,
}: {
  ref?: React.Ref<CheckoutFormHandle>;
  idPrefix: string;
  draft: CustomerDraft;
  errors: CustomerErrors;
  disabled: boolean;
  onChange: (draft: CustomerDraft) => void;
}) {
  const inputs = useRef<Partial<Record<CustomerField, HTMLInputElement | null>>>({});

  useImperativeHandle(ref, () => ({
    focus: (field) => inputs.current[field]?.focus({ preventScroll: false }),
  }));

  const id = (field: CustomerField) => `${idPrefix}-${field}`;

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted">
        Registramos tu pedido para confirmarlo contigo por WhatsApp. Solo te pedimos esto:
      </p>

      {FIELDS.map(({ field, label, hint, input }) => {
        const error = errors[field];
        const describedBy = [error && `${id(field)}-error`, hint && `${id(field)}-hint`].filter(Boolean).join(" ");
        return (
          <div key={field}>
            <label htmlFor={id(field)} className={LABEL}>
              {label}
            </label>
            <TextField
              {...input}
              ref={(node) => {
                inputs.current[field] = node;
              }}
              id={id(field)}
              name={field}
              maxLength={field === "phone" ? 30 : TEXT_MAX + 20}
              value={draft[field]}
              disabled={disabled}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy || undefined}
              className={cn(error && "border-action")}
              onChange={(event) => onChange({ ...draft, [field]: event.target.value })}
            />
            {error ? (
              <p id={`${id(field)}-error`} className={ERROR}>
                {error}
              </p>
            ) : null}
            {hint ? (
              <p id={`${id(field)}-hint`} className="mt-1.5 text-xs text-muted">
                {hint}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className={cn("border-2 p-3", errors.consent ? "border-action" : "border-muted")}>
        <div className="flex items-start gap-3">
          {/* La fila entera es el objetivo táctil: el `label` envuelve la casilla y el texto. */}
          <label htmlFor={id("consent")} className="flex min-h-[44px] cursor-pointer items-start gap-3">
            <input
              ref={(node) => {
                inputs.current.consent = node;
              }}
              id={id("consent")}
              type="checkbox"
              checked={draft.consent}
              disabled={disabled}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? `${id("consent")}-error` : undefined}
              onChange={(event) => onChange({ ...draft, consent: event.target.checked })}
              className="mt-0.5 size-6 shrink-0 accent-[var(--color-action)]"
            />
            <span className="text-sm leading-relaxed">
              Autorizo a Vapeupar a tratar mi nombre, celular y barrio solo para gestionar este
              pedido y reconocerme en próximos pedidos, según su política de tratamiento de datos.
            </span>
          </label>
        </div>
        <Link
          href={DATA_POLICY_PATH}
          target="_blank"
          rel="noopener"
          className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-action underline underline-offset-4"
        >
          Leer la política de datos
          <span className="sr-only"> (se abre en una pestaña nueva)</span>
        </Link>
        {errors.consent ? (
          <p id={`${id("consent")}-error`} className={ERROR}>
            {errors.consent}
          </p>
        ) : null}
      </div>
    </div>
  );
}
