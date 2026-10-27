"use client";

import { useEffect, useState } from "react";
import { adminApi, errorMessage, type ProductWithReadiness } from "@/lib/admin-api";
import type { AdminVariantRow, BrandRow } from "@/types/admin";
import { gapsOf } from "./catalog";
import { FormError } from "./form";
import { ProductForm } from "./product-form";
import { VariantsPanel } from "./variants-panel";

/**
 * Panel de una línea (plan A5.3): su edición o sus variantes.
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

  return (
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
  );
}
