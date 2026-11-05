"use client";

import { useEffect, useState } from "react";
import { adminApi, errorMessage } from "@/lib/admin-api";
import { formatDateTimeCO, formatNumberCO } from "@/lib/utils";
import type { BrandRow, SupplierDetail, SupplierRow } from "@/types/admin";
import { FormError } from "./form";
import { ImageOnlyForm } from "./image-only-form";
import { SupplierForm } from "./supplier-form";

/**
 * Panel de un proveedor (plan A5.2): la ficha, el formulario de edición o,
 * para un operador, solo la imagen (§4.5 del traspaso de imágenes).
 *
 * Los dos necesitan la ficha completa —el formulario, por el vínculo con
 * marcas, que la fila del listado no trae—, así que se pide una vez aquí al
 * abrir. Quien lo usa monta un panel por proveedor (`key`), de modo que este
 * arranca ya vacío y no tiene que reiniciarse a sí mismo.
 */
interface SupplierPanelProps {
  supplierId: string;
  panel: string;
  brands: BrandRow[] | null;
  onSaved: (supplier: SupplierRow, created: boolean) => void;
  onCancel: () => void;
}

export function SupplierPanel({
  supplierId,
  panel,
  brands,
  onSaved,
  onCancel,
}: SupplierPanelProps) {
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    adminApi.supplier(supplierId).then(
      (data) => {
        if (alive) setDetail(data);
      },
      (cause: unknown) => {
        if (alive) setError(errorMessage(cause, "No se pudo cargar el proveedor"));
      },
    );
    return () => {
      alive = false;
    };
  }, [supplierId]);

  if (error) return <FormError>{error}</FormError>;
  if (!detail) return <p className="text-sm text-muted">Cargando proveedor…</p>;

  if (panel === "edit") {
    return (
      <SupplierForm supplier={detail} brands={brands} onSaved={onSaved} onCancel={onCancel} />
    );
  }

  if (panel === "image") {
    return (
      <ImageOnlyForm
        label="Imagen del proveedor"
        target="supplier-image"
        entityId={detail.id}
        imageKey={detail.imageKey}
        save={async (imageKey) => {
          const row = await adminApi.updateSupplier(detail.id, { imageKey });
          setDetail({ ...detail, imageKey: row.imageKey });
          onSaved(row, false);
        }}
        onCancel={onCancel}
      />
    );
  }

  return <SupplierFicha detail={detail} />;
}

/** Lo que A5.2 pide ver de un proveedor, sin tocar nada. */
function SupplierFicha({ detail }: { detail: SupplierDetail }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Datum label="Marcas que trae" value={formatNumberCO(detail.brands.length)} />
        <Datum
          label="Variantes abastecidas"
          value={formatNumberCO(detail.suppliedVariantCount)}
          hint="Variantes distintas que entraron con su firma."
        />
        <Datum
          label="Último ingreso"
          value={detail.lastInboundAt ? formatDateTimeCO(detail.lastInboundAt) : "Nunca"}
        />
        <Datum label="Pago" value={detail.paymentTerms ?? "—"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Datum label="Contacto" value={detail.contactName ?? "—"} />
        <Datum label="WhatsApp" value={detail.whatsapp ?? "—"} />
        <Datum label="NIT o cédula" value={detail.taxId ?? "—"} />
      </div>

      <div>
        <span className="vp-label mb-2 block text-muted">MARCAS</span>
        {detail.brands.length === 0 ? (
          <p className="text-sm text-muted">
            Sin marcas vinculadas. Se marcan al editar el proveedor.
          </p>
        ) : (
          // No son `PixelLabel`: Press Start 2P se limita a ~16 caracteres y el
          // nombre de una marca puede pasarse de ahi.
          <ul className="flex flex-wrap gap-2">
            {detail.brands.map((brand) => (
              <li
                key={brand.id}
                className="border-2 border-line px-2.5 py-1 font-display text-sm"
              >
                {brand.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail.notes && (
        <div>
          <span className="vp-label mb-2 block text-muted">NOTAS</span>
          <p className="whitespace-pre-line text-sm text-foreground">{detail.notes}</p>
        </div>
      )}
    </div>
  );
}

function Datum({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span className="mb-1 block font-display text-xs font-bold uppercase tracking-[0.04em] text-muted">
        {label}
      </span>
      <span className="font-display text-base text-foreground">{value}</span>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
