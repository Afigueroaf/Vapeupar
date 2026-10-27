import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import type { ProductStatus, ReadinessGap } from "@/types/admin";
import { READINESS_LABELS } from "./catalog";

/**
 * Qué le falta a una línea para poder publicarse (plan A5.3).
 *
 * El dueño de la regla es `CatalogService`: la impone al publicar y la manda en
 * `meta.readiness` al pedir la ficha. Esto solo lo dice **antes** de intentarlo,
 * que es lo que pide A5.3.
 */
export function ReadinessChips({ gaps }: { gaps: ReadinessGap[] }) {
  if (gaps.length === 0) return null;

  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {gaps.map((gap) => (
        <li key={gap}>
          <PixelLabel variant="violet">
            {gap === "price" ? "SIN PRECIO" : gap === "imageKey" ? "SIN IMAGEN" : "SIN VARIANTE"}
          </PixelLabel>
        </li>
      ))}
    </ul>
  );
}

/** La versión en palabras, dentro del panel de la línea. */
export function ReadinessNotice({
  gaps,
  status,
}: {
  gaps: ReadinessGap[];
  status: ProductStatus;
}) {
  if (gaps.length === 0) {
    return (
      <Surface border="muted" className="p-3">
        <p className="text-sm text-muted">
          {status === "published"
            ? "Publicada: se ve en el sitio."
            : "No le falta nada para publicarse."}
        </p>
      </Surface>
    );
  }

  return (
    <Surface border="accent" className="p-3">
      <p className="text-sm text-foreground">
        Para publicar esta línea falta: {gaps.map((gap) => READINESS_LABELS[gap]).join(", ")}.
      </p>
      {gaps.includes("activeVariant") && (
        <p className="mt-1 text-xs text-muted">
          Las variantes se crean en el panel «Variantes» de esta misma fila.
        </p>
      )}
    </Surface>
  );
}
