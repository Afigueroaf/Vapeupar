"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { adminApi, errorMessage } from "@/lib/admin-api";
import { cn, formatNumberCO } from "@/lib/utils";
import type { AdminProductDetail, AdminVariantRow, VariantInput } from "@/types/admin";
import { VARIANT_KIND_LABELS, slugify, toInteger } from "./catalog";
import { CheckField, FormError, FormStatus, Labelled } from "./form";
import { ImageUploadField } from "./image-upload-field";

/**
 * Variantes de una línea: los sabores o colores entre los que elige el cliente
 * (plan A5.3).
 *
 * No tienen precio —el precio es de la línea— y su disponible es de **solo
 * lectura**: lo mueve el libro de inventario y se ve aquí solo para saber qué
 * hay. Tampoco se borran: el libro las referencia con `onDelete: Restrict`, así
 * que retirar una variante del sitio es desactivarla.
 *
 * Dos reglas que impone `CatalogService` y que esta pantalla refleja: una línea
 * tiene variantes de un solo tipo (el tipo se fija con la primera), y no se
 * puede desactivar la última variante activa de una línea publicada.
 */
interface VariantsPanelProps {
  product: AdminProductDetail;
  canWrite: boolean;
  /** Para que el listado actualice sus contadores sin recargar. */
  onChanged: (variants: AdminVariantRow[]) => void;
}

type Mode = { kind: "create" } | { kind: "edit"; id: string } | null;

export function VariantsPanel({ product, canWrite, onChanged }: VariantsPanelProps) {
  const [variants, setVariants] = useState<AdminVariantRow[]>(product.variants);
  const [mode, setMode] = useState<Mode>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function apply(next: AdminVariantRow[], message: string) {
    setVariants(next);
    onChanged(next);
    setSaved(message);
    setMode(null);
  }

  const lockedKind = variants[0]?.kind;
  const activeCount = variants.filter((variant) => variant.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {variants.length === 0
            ? "Esta línea no tiene variantes. Necesita al menos una activa para publicarse."
            : `${formatNumberCO(variants.length)} variante(s), ${formatNumberCO(activeCount)} activa(s)${
                lockedKind ? ` · tipo: ${VARIANT_KIND_LABELS[lockedKind].toLowerCase()}` : ""
              }.`}
        </p>
        {canWrite && mode?.kind !== "create" && (
          <Button variant="secondary" onClick={() => setMode({ kind: "create" })}>
            Añadir variante
          </Button>
        )}
      </div>

      {saved && <FormStatus>{saved}</FormStatus>}

      {mode?.kind === "create" && (
        <Surface border="accent" className="p-4">
          <VariantForm
            productId={product.id}
            variant={null}
            lockedKind={lockedKind}
            onSaved={(variant) =>
              apply([...variants, variant], `Variante «${variant.name}» creada.`)
            }
            onCancel={() => setMode(null)}
          />
        </Surface>
      )}

      {variants.length > 0 && (
        <ul className="divide-y-2 divide-muted border-2 border-muted">
          {variants.map((variant) => (
            <li key={variant.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-display text-sm font-bold">{variant.name}</span>
                  <span className="ml-2 text-xs text-muted">{variant.slug}</span>
                  {!variant.active && (
                    <PixelLabel variant="outline" className="ml-2">
                      INACTIVA
                    </PixelLabel>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    {VARIANT_KIND_LABELS[variant.kind]} · orden {formatNumberCO(variant.sortOrder)} ·
                    disponible{" "}
                    <span className={cn(variant.stock <= 0 && "text-action")}>
                      {formatNumberCO(variant.stock)}
                    </span>
                    {variant.imageKey ? ` · ${variant.imageKey}` : " · sin imagen"}
                  </p>
                </div>
                {canWrite && (
                  <Button
                    variant="secondary"
                    className="px-3"
                    aria-expanded={mode?.kind === "edit" && mode.id === variant.id}
                    onClick={() =>
                      setMode((current) =>
                        current?.kind === "edit" && current.id === variant.id
                          ? null
                          : { kind: "edit", id: variant.id },
                      )
                    }
                  >
                    Editar
                  </Button>
                )}
              </div>

              {mode?.kind === "edit" && mode.id === variant.id && (
                <div className="mt-3 border-t-2 border-muted pt-3">
                  <VariantForm
                    key={variant.id}
                    productId={product.id}
                    variant={variant}
                    lockedKind={variants.length > 1 ? variant.kind : undefined}
                    onSaved={(saved) =>
                      apply(
                        variants.map((row) => (row.id === saved.id ? saved : row)),
                        `Variante «${saved.name}» guardada.`,
                      )
                    }
                    onCancel={() => setMode(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {product.status === "published" && activeCount === 1 && (
        <p className="text-xs text-muted">
          Queda una sola variante activa y la línea está publicada: para desactivarla hay que pasar
          la línea a borrador primero.
        </p>
      )}
    </div>
  );
}

/** Alta y edición de una variante. El disponible no está: no se escribe aquí. */
function VariantForm({
  productId,
  variant,
  lockedKind,
  onSaved,
  onCancel,
}: {
  productId: string;
  variant: AdminVariantRow | null;
  /** Tipo ya fijado por la línea, si lo hay: no se puede cambiar. */
  lockedKind: "flavor" | "color" | undefined;
  onSaved: (variant: AdminVariantRow) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<"flavor" | "color">(
    variant?.kind ?? lockedKind ?? "flavor",
  );
  const [name, setName] = useState(variant?.name ?? "");
  const [slug, setSlug] = useState(variant?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(variant !== null);
  const [imageKey, setImageKey] = useState(variant?.imageKey ?? "");
  /**
   * Una carga cuenta como cambio aunque la clave sea la misma: es el caso
   * normal al reemplazar la imagen de una entidad que ya tenía una, porque la
   * clave se deriva de la entidad. Sin esto el PATCH saldría vacío y el
   * formulario diría que no hay nada que guardar justo después de subirla.
   */
  const [imageUploaded, setImageUploaded] = useState(false);
  const [sortOrder, setSortOrder] = useState(String(variant?.sortOrder ?? 0));
  const [active, setActive] = useState(variant?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = variant ? `variant-${variant.id}` : `variant-nueva-${productId}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const order = toInteger(sortOrder);
    if (order === null || order < 0) {
      setError("El orden es un número entero de 0 en adelante");
      return;
    }

    const values: VariantInput = {
      kind,
      name: name.trim(),
      slug: slug.trim(),
      imageKey: imageKey.trim() || null,
      active,
      sortOrder: order,
    };

    setPending(true);
    try {
      if (!variant) {
        onSaved(await adminApi.createVariant(productId, values));
        return;
      }

      const patch: Partial<VariantInput> = {};
      if (values.name !== variant.name) patch.name = values.name;
      if (values.slug !== variant.slug) patch.slug = values.slug;
      if (values.imageKey !== variant.imageKey || imageUploaded) patch.imageKey = values.imageKey;
      if (values.active !== variant.active) patch.active = values.active;
      if (values.sortOrder !== variant.sortOrder) patch.sortOrder = values.sortOrder;
      if (values.kind !== variant.kind) patch.kind = values.kind;

      if (Object.keys(patch).length === 0) {
        setError("No hay ningún cambio que guardar");
        return;
      }
      onSaved(await adminApi.updateVariant(productId, variant.id, patch));
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar la variante"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Labelled
          label="Tipo"
          htmlFor={`${prefix}-kind`}
          hint={lockedKind ? "Lo fija la línea: todas sus variantes son del mismo tipo." : undefined}
        >
          <SelectField
            id={`${prefix}-kind`}
            value={kind}
            disabled={lockedKind !== undefined}
            onChange={(event) => setKind(event.target.value as "flavor" | "color")}
          >
            <option value="flavor">{VARIANT_KIND_LABELS.flavor}</option>
            <option value="color">{VARIANT_KIND_LABELS.color}</option>
          </SelectField>
        </Labelled>

        <Labelled label="Nombre" htmlFor={`${prefix}-name`}>
          <TextField
            id={`${prefix}-name`}
            required
            maxLength={120}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
          />
        </Labelled>

        <Labelled label="Slug" htmlFor={`${prefix}-slug`}>
          <TextField
            id={`${prefix}-slug`}
            required
            maxLength={80}
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
        </Labelled>

        <Labelled label="Orden" htmlFor={`${prefix}-order`}>
          <TextField
            id={`${prefix}-order`}
            type="number"
            inputMode="numeric"
            step={1}
            min={0}
            max={9999}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </Labelled>

        <div className="sm:col-span-2">
          <ImageUploadField
            id={`${prefix}-image`}
            label="Imagen de la variante"
            target="variant-image"
            entityId={variant?.id ?? null}
            imageKey={imageKey || null}
            onUploaded={(key) => {
              setImageKey(key);
              setImageUploaded(true);
            }}
            onClear={() => setImageKey("")}
            onError={setError}
          />
          <p className="mt-1 text-xs text-muted">
            Opcional: sin imagen propia se usa la de la línea. Lo habitual es
            adjuntarla al registrar el ingreso en inventario.
          </p>
        </div>

        <CheckField label="Activa" checked={active} onChange={setActive} className="self-end" />
      </div>

      {error && <FormError>{error}</FormError>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : variant ? "Guardar variante" : "Crear variante"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
