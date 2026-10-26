import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Campos de formulario del sistema VP.
 *
 * Borde de 2px, radio cero, alto mínimo 44px, foco lima vía `:focus-visible`.
 *
 * NOTA: el icono del `<select>` usa Lucide de forma provisional. La decisión
 * sobre el set de iconografía definitivo está pendiente
 * (`docs/design-reset-inventory.md` §4.5).
 */

const FIELD_BASE =
  "w-full min-h-[44px] rounded-vp border-2 border-muted bg-surface " +
  "font-display text-[0.9375rem] text-foreground placeholder:text-muted " +
  "transition-colors duration-150 ease-vp hover:border-line focus:border-action";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icono opcional a la izquierda (decorativo: debe llevar `aria-hidden`). */
  icon?: React.ReactNode;
}

export function TextField({ icon, className, ...props }: TextFieldProps) {
  if (!icon) {
    return <input className={cn(FIELD_BASE, "px-3.5", className)} {...props} />;
  }

  return (
    <div className="relative w-full">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
        {icon}
      </span>
      <input className={cn(FIELD_BASE, "pl-11 pr-3.5", className)} {...props} />
    </div>
  );
}

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}

/**
 * `<select>` nativo estilizable: `appearance-none` + chevron propio.
 * El nativo no admite estilos consistentes entre navegadores
 * (`docs/design-reset-inventory.md` §5.4).
 */
export function SelectField({ className, children, ...props }: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        className={cn(FIELD_BASE, "appearance-none pl-3.5 pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  );
}
