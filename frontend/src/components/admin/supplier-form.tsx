"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { adminApi, errorMessage } from "@/lib/admin-api";
import type { BrandRow, SupplierDetail, SupplierInput, SupplierRow } from "@/types/admin";
import { CheckField, FieldGroup, FormError, Labelled } from "./form";

/**
 * Alta y edición de proveedor, con el vínculo N↔N con marcas (plan A5.2).
 *
 * La lista de marcas viaja **completa**: el backend reemplaza el vínculo con lo
 * que recibe, así que desmarcar una marca es quitarla. Por eso solo se manda
 * cuando de verdad cambió.
 *
 * Tampoco hay borrado: el libro de inventario referencia al proveedor en cada
 * ingreso que firmó. Retirar un proveedor es desactivarlo.
 */
interface SupplierFormProps {
  /** `null` crea uno nuevo. Al editar hace falta la ficha, por las marcas. */
  supplier: SupplierDetail | null;
  /** Marcas para el vínculo, o `null` si todavía no han llegado. */
  brands: BrandRow[] | null;
  onSaved: (supplier: SupplierRow, created: boolean) => void;
  onCancel: () => void;
}

export function SupplierForm({ supplier, brands, onSaved, onCancel }: SupplierFormProps) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [taxId, setTaxId] = useState(supplier?.taxId ?? "");
  const [contactName, setContactName] = useState(supplier?.contactName ?? "");
  const [whatsapp, setWhatsapp] = useState(supplier?.whatsapp ?? "");
  const [paymentTerms, setPaymentTerms] = useState(supplier?.paymentTerms ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [active, setActive] = useState(supplier?.active ?? true);
  const [brandIds, setBrandIds] = useState<string[]>(
    supplier ? supplier.brands.map((brand) => brand.id) : [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = supplier ? `supplier-${supplier.id}` : "supplier-nuevo";
  const original = supplier ? [...supplier.brands.map((brand) => brand.id)].sort() : [];

  function toggleBrand(id: string, checked: boolean) {
    setBrandIds((current) =>
      checked ? [...current, id] : current.filter((brandId) => brandId !== id),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const text = (value: string) => value.trim() || null;
    const values: SupplierInput = {
      name: name.trim(),
      taxId: text(taxId),
      contactName: text(contactName),
      whatsapp: text(whatsapp),
      paymentTerms: text(paymentTerms),
      notes: text(notes),
      active,
      brandIds,
    };

    setPending(true);
    try {
      if (!supplier) {
        onSaved(await adminApi.createSupplier(values), true);
        return;
      }

      const patch: Partial<SupplierInput> = {};
      if (values.name !== supplier.name) patch.name = values.name;
      if (values.taxId !== supplier.taxId) patch.taxId = values.taxId;
      if (values.contactName !== supplier.contactName) patch.contactName = values.contactName;
      if (values.whatsapp !== supplier.whatsapp) patch.whatsapp = values.whatsapp;
      if (values.paymentTerms !== supplier.paymentTerms) patch.paymentTerms = values.paymentTerms;
      if (values.notes !== supplier.notes) patch.notes = values.notes;
      if (values.active !== supplier.active) patch.active = values.active;
      if ([...brandIds].sort().join() !== original.join()) patch.brandIds = brandIds;

      if (Object.keys(patch).length === 0) {
        setError("No hay ningún cambio que guardar");
        return;
      }
      onSaved(await adminApi.updateSupplier(supplier.id, patch), false);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar el proveedor"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Labelled label="Nombre" htmlFor={`${prefix}-name`}>
          <TextField
            id={`${prefix}-name`}
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Labelled>

        <Labelled label="NIT o cédula" htmlFor={`${prefix}-tax`}>
          <TextField
            id={`${prefix}-tax`}
            maxLength={40}
            value={taxId}
            onChange={(event) => setTaxId(event.target.value)}
          />
        </Labelled>

        <Labelled label="Contacto" htmlFor={`${prefix}-contact`}>
          <TextField
            id={`${prefix}-contact`}
            maxLength={120}
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </Labelled>

        <Labelled label="WhatsApp" htmlFor={`${prefix}-whatsapp`}>
          <TextField
            id={`${prefix}-whatsapp`}
            type="tel"
            inputMode="tel"
            maxLength={30}
            placeholder="3001234567"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
          />
        </Labelled>

        <Labelled
          label="Pago"
          htmlFor={`${prefix}-terms`}
          hint="Contado, 30 días, consignación…"
        >
          <TextField
            id={`${prefix}-terms`}
            maxLength={120}
            value={paymentTerms}
            onChange={(event) => setPaymentTerms(event.target.value)}
          />
        </Labelled>

        <CheckField label="Activo" checked={active} onChange={setActive} className="self-end" />

        <Labelled label="Notas" htmlFor={`${prefix}-notes`} className="sm:col-span-2 lg:col-span-3">
          <TextAreaField
            id={`${prefix}-notes`}
            maxLength={2000}
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Labelled>
      </div>

      <FieldGroup title="MARCAS QUE TRAE">
        {brands === null ? (
          <p className="text-sm text-muted">Cargando marcas…</p>
        ) : brands.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no hay marcas que vincular. Se crean en la pantalla de marcas.
          </p>
        ) : (
          <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <CheckField
                key={brand.id}
                label={brand.active ? brand.name : `${brand.name} (inactiva)`}
                checked={brandIds.includes(brand.id)}
                onChange={(checked) => toggleBrand(brand.id, checked)}
              />
            ))}
          </div>
        )}
      </FieldGroup>

      {error && <FormError>{error}</FormError>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : supplier ? "Guardar cambios" : "Crear proveedor"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
