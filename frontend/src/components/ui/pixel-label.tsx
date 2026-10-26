import { cn } from "@/lib/utils";

export type PixelLabelVariant = "lime" | "violet" | "outline";

const VARIANTS: Record<PixelLabelVariant, string> = {
  /** Máximo énfasis. Lima sobre negro: 17.4:1. */
  lime: "bg-action text-action-ink border-action",
  /** Acento Y2K. El violeta es solo borde: como texto no pasa AA. */
  violet: "border-accent text-foreground",
  /** Neutra, para etiquetas de sistema tipo `[ SYSTEM ONLINE ]`. */
  outline: "border-line text-foreground",
};

interface PixelLabelProps extends React.HTMLAttributes<HTMLElement> {
  variant?: PixelLabelVariant;
  as?: "span" | "div";
}

/**
 * Etiqueta arcade en Press Start 2P. Sustituye a las pills redondeadas.
 *
 * RESTRICCIÓN DEL SISTEMA: máximo ~16 caracteres (1 a 3 palabras).
 * Press Start 2P no es legible en textos largos. Usos válidos:
 * `NEW DROP`, `LVL 01`, `PLAYER 01`, `[ SYSTEM ONLINE ]`, `AGOTADO`.
 *
 * Ver `docs/design-reset-inventory.md` §11.
 */
export function PixelLabel({
  variant = "outline",
  as: Tag = "span",
  className,
  children,
  ...props
}: PixelLabelProps) {
  return (
    <Tag
      className={cn(
        "vp-label inline-flex items-center gap-1.5 border-2 rounded-vp px-2.5 py-1 whitespace-nowrap",
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
