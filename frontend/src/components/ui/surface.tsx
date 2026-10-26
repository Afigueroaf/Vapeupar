import { cn } from "@/lib/utils";

export type SurfaceBorder = "muted" | "line" | "accent";

const BORDERS: Record<SurfaceBorder, string> = {
  /** Por defecto. Gris #9a9a9a: 7.1:1 sobre el fondo, visible sin dominar. */
  muted: "border-muted",
  /** Estructural. Blanco pleno, para paneles que deben leerse como bloque. */
  line: "border-line",
  /** Acento Y2K. El violeta como borde es uso válido (no es texto). */
  accent: "border-accent",
};

interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
  border?: SurfaceBorder;
  /** Desplazamiento duro en lugar de sombra difusa. */
  offset?: boolean;
  as?: "div" | "article" | "section" | "aside";
}

/**
 * Panel / tarjeta geométrica del sistema VP.
 *
 * EL BORDE ES OBLIGATORIO: la superficie (#202020) contra el fondo (#080808)
 * da solo 1.2:1 de contraste, así que sin borde el panel desaparece.
 * Ver `docs/design-reset-inventory.md` §11.
 *
 * Sin radio, sin `backdrop-blur`, sin sombra difusa. Si hace falta profundidad,
 * se usa `offset` (sombra dura sin blur).
 */
export function Surface({
  border = "muted",
  offset = false,
  as: Tag = "div",
  className,
  children,
  ...props
}: SurfaceProps) {
  return (
    <Tag
      className={cn(
        "bg-surface border-2 rounded-vp",
        BORDERS[border],
        offset && "shadow-[6px_6px_0_0_var(--color-vp-black)]",
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
