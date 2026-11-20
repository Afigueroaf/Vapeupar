"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { moveItem, removeItem, replaceItem, type FieldErrors } from "@/lib/content-form";
import { cn } from "@/lib/utils";
import { Labelled } from "../form";

/**
 * Campos del editor de contenido (A5.4): texto con contador y error en su
 * sitio, y listas con mínimos y máximos sacados del esquema.
 */

/** Texto con contador `n / máximo`. El error del campo va debajo, con `aria-describedby`. */
export function CountedField({
  id,
  label,
  value,
  max,
  error,
  hint,
  multiline,
  rows,
  readOnly,
  className,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  className?: string;
  error?: string;
  hint?: string;
  multiline?: boolean;
  rows?: number;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  // Se cuenta lo que se publicará: el backend recorta antes de medir.
  const length = value.trim().length;
  const over = length > max;
  const describedBy = `${id}-count${error ? ` ${id}-error` : ""}`;
  const common = {
    id,
    value,
    readOnly,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: cn(error && "border-action"),
  };

  return (
    <Labelled label={label} htmlFor={id} hint={hint} className={className}>
      {multiline ? (
        <TextAreaField {...common} rows={rows ?? 3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <TextField {...common} onChange={(event) => onChange(event.target.value)} />
      )}
      <div className="mt-1 flex items-start justify-between gap-3 text-xs">
        <p id={`${id}-error`} className="text-action" aria-live="polite">
          {error ?? ""}
        </p>
        <p id={`${id}-count`} className={cn("shrink-0 tabular-nums", over ? "text-action" : "text-muted")}>
          {length} / {max}
        </p>
      </div>
    </Labelled>
  );
}

/** Subir, bajar y quitar un elemento de una lista. */
export function ItemControls({
  index,
  count,
  min,
  noun,
  readOnly,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  min: number;
  /** «pregunta 2», «horario 1»: para el nombre accesible de cada botón. */
  noun: string;
  readOnly?: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  if (readOnly) return null;
  const icon = "size-4";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant="ghost" className="px-2" aria-label={`Subir ${noun}`} disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp className={icon} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        className="px-2"
        aria-label={`Bajar ${noun}`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown className={icon} aria-hidden="true" />
      </Button>
      <Button variant="ghost" className="px-2" aria-label={`Quitar ${noun}`} disabled={count <= min} onClick={onRemove}>
        <Trash2 className={icon} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Botón «Añadir» que dice el tope cuando ya no cabe más. */
export function AddButton({
  label,
  count,
  max,
  readOnly,
  onAdd,
}: {
  label: string;
  count: number;
  max: number;
  readOnly?: boolean;
  onAdd: () => void;
}) {
  if (readOnly) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={count >= max} onClick={onAdd}>
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>
      <span className="text-xs text-muted">
        {count} de {max} como máximo
      </span>
    </div>
  );
}

/** Lista de líneas de texto (palabras clave, horarios, servicio). */
export function StringListField({
  id,
  label,
  noun,
  values,
  range,
  maxLength,
  errors,
  path,
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  noun: string;
  values: string[];
  range: { min: number; max: number };
  maxLength: number;
  errors: FieldErrors;
  /** Ruta de la lista en el valor (`keywords`, `hours`): para leer sus errores. */
  path: string;
  readOnly?: boolean;
  onChange: (values: string[]) => void;
}) {
  const listError = errors[path];
  return (
    <div className="space-y-3">
      <p className="font-display text-xs font-bold uppercase tracking-[0.04em] text-muted">
        {label} <span className="font-normal normal-case">({range.min}–{range.max})</span>
      </p>
      {listError && <p className="text-xs text-action">{listError}</p>}
      <ol className="space-y-3">
        {values.map((line, index) => (
          <li key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <CountedField
                id={`${id}-${index}`}
                label={`${noun} ${index + 1}`}
                value={line}
                max={maxLength}
                error={errors[`${path}.${index}`]}
                readOnly={readOnly}
                onChange={(next) => onChange(replaceItem(values, index, next))}
              />
            </div>
            <div className="pt-6">
              <ItemControls
                index={index}
                count={values.length}
                min={range.min}
                noun={`${noun.toLowerCase()} ${index + 1}`}
                readOnly={readOnly}
                onMove={(delta) => onChange(moveItem(values, index, delta))}
                onRemove={() => onChange(removeItem(values, index))}
              />
            </div>
          </li>
        ))}
      </ol>
      <AddButton
        label={`Añadir ${noun.toLowerCase()}`}
        count={values.length}
        max={range.max}
        readOnly={readOnly}
        onAdd={() => onChange([...values, ""])}
      />
    </div>
  );
}
