"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { adminApi, errorMessage, type ProductWithReadiness } from "@/lib/admin-api";
import type { AdminVariantRow, BrandRow, Readiness } from "@/types/admin";
import { gapsOf } from "./catalog";
import { FormError } from "./form";
import { ImageOnlyForm } from "./image-only-form";
import { ProductForm } from "./product-form";
import { VariantsPanel } from "./variants-panel";

/**
 * Panel de una línea (plan A5.3): su edición, sus variantes o, para un
 * operador, solo la imagen (§4.5 del traspaso de imágenes).
 *
 * Los dos necesitan la ficha completa, que el listado no trae: las variantes no
 * caben en una fila y pedir veinte fichas para pintar la tabla sería absurdo.
 * Así que se pide una al abrir, y con ella viene `readiness` —qué falta para
 * publicar— tal como lo calcula el backend.
 *
 * Quien lo usa monta un panel por línea (`key`), de modo que este arranca ya
 * vacío y no tiene que reiniciarse a sí mismo.
 */
interface ProductPanelProps {
  productId: string;
  panel: string;
  brands: BrandRow[] | null;
  canWrite: boolean;
  onSaved: (result: ProductWithReadiness, created: boolean) => void;
  /** Para que el listado actualice los contadores de variantes de la fila. */
  onVariantsChanged: (productId: string, variants: AdminVariantRow[]) => void;
  onCancel: () => void;
}

export function ProductPanel({
  productId,
  panel,
  brands,
  canWrite,
  onSaved,
  onVariantsChanged,
  onCancel,
}: ProductPanelProps) {
  const [detail, setDetail] = useState<ProductWithReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    adminApi.product(productId).then(
      (data) => {
        if (alive) setDetail(data);
      },
      (cause: unknown) => {
        if (alive) setError(errorMessage(cause, "No se pudo cargar la línea"));
      },
    );
    return () => {
      alive = false;
    };
  }, [productId]);

  if (error) return <FormError>{error}</FormError>;
  if (!detail) return <p className="text-sm text-muted">Cargando línea…</p>;

  if (panel === "variants") {
    return (
      <VariantsPanel
        product={detail.product}
        canWrite={canWrite}
        onChanged={(variants) => {
          const product = {
            ...detail.product,
            variants,
            variantCount: variants.length,
            activeVariantCount: variants.filter((variant) => variant.active).length,
          };
          // Una variante nueva o activada puede cambiar lo que falta para
          // publicar, así que se recalcula con la misma regla del listado.
          const missing = gapsOf(product);
          setDetail({ product, readiness: { canPublish: missing.length === 0, missing } });
          onVariantsChanged(productId, variants);
        }}
      />
    );
  }

  const apply = (result: ProductWithReadiness) => {
    setDetail(result);
    onSaved(result, false);
  };

  if (panel === "image") {
    return (
      <ImageOnlyForm
        label="Imagen de la línea"
        target="product-line-image"
        entityId={detail.product.id}
        imageKey={detail.product.imageKey}
        save={async (imageKey) => apply(await adminApi.updateProduct(detail.product.id, { imageKey }))}
        onCancel={onCancel}
      />
    );
  }

  return (
    <div className="space-y-4">
      {canWrite && <PublishBar detail={detail} onApplied={apply} />}
      <ProductForm
        product={detail.product}
        brands={brands}
        readiness={detail.readiness}
        onSaved={(result, created) => {
          setDetail(result);
          onSaved(result, created);
        }}
        onCancel={onCancel}
      />
    </div>
  );
}

/**
 * Publicar y despublicar con un gesto.
 *
 * El estado también está en el formulario, pero ahí se pierde: quien acaba de
 * poner el precio lee «no le falta nada para publicarse» y se va, convencido de
 * que ya está. Publicar es la decisión que pide A5.3 que sea explícita, así que
 * tiene su propio botón y su propia frase.
 */
function PublishBar({
  detail,
  onApplied,
}: {
  detail: ProductWithReadiness;
  onApplied: (result: ProductWithReadiness) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const published = detail.product.status === "published";
  const readiness: Readiness = detail.readiness;

  async function change(status: "draft" | "published") {
    setError(null);
    setPending(true);
    try {
      onApplied(await adminApi.updateProduct(detail.product.id, { status }));
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo cambiar el estado"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Surface border={published ? "muted" : "line"} className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground">
          {published
            ? "Esta línea está publicada: se ve en el sitio."
            : readiness.canPublish
              ? "Está en borrador y no se ve en el sitio. Ya cumple lo necesario para publicarse."
              : "Está en borrador y no se ve en el sitio."}
        </p>
        {published ? (
          <Button variant="secondary" disabled={pending} onClick={() => change("draft")}>
            {pending ? "Guardando…" : "Pasar a borrador"}
          </Button>
        ) : (
          readiness.canPublish && (
            <Button variant="secondary" disabled={pending} onClick={() => change("published")}>
              {pending ? "Publicando…" : "Publicar"}
            </Button>
          )
        )}
      </div>
      {error && <FormError>{error}</FormError>}
    </Surface>
  );
}
