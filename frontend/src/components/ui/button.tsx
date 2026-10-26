import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";

/**
 * Base común: alto mínimo 44px (objetivo táctil), borde de 2px, radio cero,
 * Oxanium 700 a 15px. La micro-interacción es un desplazamiento duro de 2px,
 * no un `scale` (ver `docs/design-reset-inventory.md` §8.1).
 */
const BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-vp border-2 " +
  "font-display text-[0.9375rem] font-bold uppercase tracking-[0.02em] " +
  "transition-[transform,background-color,box-shadow] duration-150 ease-vp " +
  "disabled:pointer-events-none disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  /**
   * Acción principal. Lima con texto negro: 17.4:1.
   * REGLA: un solo `primary` por vista.
   */
  primary:
    "px-6 bg-action text-action-ink border-action " +
    "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-accent)] " +
    "active:translate-x-0 active:translate-y-0 active:shadow-none",
  /** Acción secundaria. Borde blanco sobre fondo transparente. */
  secondary:
    "px-6 bg-transparent text-foreground border-line " +
    "hover:bg-surface hover:-translate-x-0.5 hover:-translate-y-0.5 " +
    "active:translate-x-0 active:translate-y-0",
  /** Enlace de texto. Mantiene el objetivo táctil de 44px. */
  ghost:
    "px-1 bg-transparent text-foreground border-transparent " +
    "hover:text-action hover:underline underline-offset-4 decoration-2",
};

type ButtonBaseProps = {
  variant?: ButtonVariant;
  className?: string;
  children?: React.ReactNode;
};

type ButtonAsAnchor = ButtonBaseProps &
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type ButtonAsButton = ButtonBaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonProps = ButtonAsAnchor | ButtonAsButton;

/** Clases del botón, para casos donde hace falta aplicarlas a otro elemento. */
export function buttonStyles(variant: ButtonVariant = "primary", className?: string) {
  return cn(BASE, VARIANTS[variant], className);
}

/**
 * Botón del sistema VP. Con `href` renderiza `<a>`; sin él, `<button>`.
 * El foco visible lo aporta la regla global `:focus-visible` de `globals.css`.
 */
export function Button({ variant = "primary", className, children, ...props }: ButtonProps) {
  const classes = buttonStyles(variant, className);

  if (typeof props.href === "string") {
    const anchorProps = props as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={classes} {...anchorProps}>
        {children}
      </a>
    );
  }

  const buttonProps = props as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button className={classes} type={buttonProps.type ?? "button"} {...buttonProps}>
      {children}
    </button>
  );
}
