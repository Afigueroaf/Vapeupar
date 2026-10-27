import { cn } from "@/lib/utils";

/**
 * Piezas repetidas de los formularios de la consola (plan A5).
 *
 * No añaden estilo nuevo: son la etiqueta sobre el campo, la casilla con su
 * objetivo táctil de 44px y las dos líneas de aviso —error y resultado— con el
 * rol ARIA correcto, que es lo que se olvida al repetirlas a mano.
 */

export function Labelled({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  /** Debajo del campo: para lo que la etiqueta no puede decir en tres palabras. */
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Casilla y texto en un mismo objetivo táctil: toda la fila es pulsable. */
export function CheckField({
  label,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[44px] cursor-pointer items-center gap-2 font-display text-sm",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      <input
        type="checkbox"
        className="size-5 accent-[var(--color-action)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/** Lo que salió mal. Borde lima: es la única señal de error del sistema. */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="border-2 border-action px-3 py-2 text-sm text-foreground">
      {children}
    </p>
  );
}

/** Lo que salió bien. */
export function FormStatus({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="border-2 border-accent px-3 py-2 text-sm text-foreground">
      {children}
    </p>
  );
}

/** Título de un grupo de campos dentro de un formulario largo. */
export function FieldGroup({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className={cn("border-t-2 border-muted pt-4", className)}>
      <legend className="vp-label pr-3 text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}
