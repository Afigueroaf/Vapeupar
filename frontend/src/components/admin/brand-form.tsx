"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { adminApi, errorMessage } from "@/lib/admin-api";
import type { BrandInput, BrandRow } from "@/types/admin";
import { slugify, toInteger } from "./catalog";
import { CheckField, FormError, Labelled } from "./form";

/**
 * Alta y edición de marca (plan A5.2).
 *
 * Al editar solo viajan los campos que cambiaron: un PATCH con todo volvería a
 * escribir lo que nadie tocó y dejaría ruido en la auditoría, que registra el
 * antes y el después de cada escritura.
 *
 * No hay borrado: las líneas referencian la marca con `onDelete: Restrict`.
 * Retirar una marca del sitio es desactivarla, y por eso se dice cuántas
 * líneas la usan.
 */
interface BrandFormProps {
  /** `null` crea una marca nueva. */
  brand: BrandRow | null;
  onSaved: (brand: BrandRow, created: boolean) => void;
  onCancel: () => void;
}

export function BrandForm({ brand, onSaved, onCancel }: BrandFormProps) {
  const [name, setName] = useState(brand?.name ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(brand !== null);
  const [logoKey, setLogoKey] = useState(brand?.logoKey ?? "");
  const [isPartner, setIsPartner] = useState(brand?.isPartner ?? false);
  const [sortOrder, setSortOrder] = useState(String(brand?.sortOrder ?? 0));
  const [active, setActive] = useState(brand?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = brand ? `brand-${brand.id}` : "brand-nueva";

  function changeName(value: string) {
    setName(value);
    // El slug se sugiere mientras nadie lo haya escrito a mano.
    if (!slugTouched) setSlug(slugify(value));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const order = toInteger(sortOrder);
    if (order === null || order < 0) {
      setError("El orden es un número entero de 0 en adelante");
      return;
    }

    const values: BrandInput = {
      name: name.trim(),
      slug: slug.trim(),
      logoKey: logoKey.trim() || null,
      isPartner,
      sortOrder: order,
      active,
    };

    setPending(true);
    try {
      if (!brand) {
        onSaved(await adminApi.createBrand(values), true);
        return;
      }

      const patch: Partial<BrandInput> = {};
      if (values.name !== brand.name) patch.name = values.name;
      if (values.slug !== brand.slug) patch.slug = values.slug;
      if (values.logoKey !== brand.logoKey) patch.logoKey = values.logoKey;
      if (values.isPartner !== brand.isPartner) patch.isPartner = values.isPartner;
      if (values.sortOrder !== brand.sortOrder) patch.sortOrder = values.sortOrder;
      if (values.active !== brand.active) patch.active = values.active;

      if (Object.keys(patch).length === 0) {
        setError("No hay ningún cambio que guardar");
        return;
      }
      onSaved(await adminApi.updateBrand(brand.id, patch), false);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar la marca"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Labelled label="Nombre" htmlFor={`${prefix}-name`}>
          <TextField
            id={`${prefix}-name`}
            required
            maxLength={120}
            value={name}
            onChange={(event) => changeName(event.target.value)}
          />
        </Labelled>

        <Labelled
          label="Slug"
          htmlFor={`${prefix}-slug`}
          hint="Minúsculas, con guiones y sin acentos."
        >
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

        <Labelled
          label="Logo"
          htmlFor={`${prefix}-logo`}
          hint="Clave en el bucket, no una URL."
          className="sm:col-span-2"
        >
          <TextField
            id={`${prefix}-logo`}
            maxLength={255}
            placeholder="marcas/lifepod.webp"
            value={logoKey}
            onChange={(event) => setLogoKey(event.target.value)}
          />
        </Labelled>

        <Labelled
          label="Orden"
          htmlFor={`${prefix}-order`}
          hint="Menor, antes. Ordena la tira de marcas aliadas."
        >
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

        <div className="flex flex-wrap items-end gap-x-6 sm:col-span-2 lg:col-span-3">
          <CheckField label="Marca aliada" checked={isPartner} onChange={setIsPartner} />
          <CheckField label="Activa" checked={active} onChange={setActive} />
        </div>
      </div>

      <p className="text-xs text-muted">
        Las marcas aliadas salen en la landing y en la FAQ del sitio.{" "}
        {brand && brand.productCount > 0
          ? `Esta marca la usan ${brand.productCount} línea(s): desactivarla las retira del sitio, no las borra.`
          : "Una marca no se borra: se desactiva."}
      </p>

      {error && <FormError>{error}</FormError>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : brand ? "Guardar cambios" : "Crear marca"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
