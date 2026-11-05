"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { adminApi, errorMessage, type ProductWithReadiness } from "@/lib/admin-api";
import { formatPriceCOP } from "@/lib/utils";
import type { ProductCategory } from "@/types/product";
import type {
  AdminProductDetail,
  BrandRow,
  ProductInput,
  ProductSpecs,
  ProductStatus,
  Readiness,
} from "@/types/admin";
import { CATEGORIES, CATEGORY_LABELS, slugify, toInteger } from "./catalog";
import { CheckField, FieldGroup, FormError, Labelled } from "./form";
import { ImageUploadField } from "./image-upload-field";
import { ReadinessNotice } from "./readiness";

/**
 * Alta y edición de una línea de producto (plan A5.3).
 *
 * **El precio se edita aquí y solo aquí**: las variantes no tienen precio, así
 * que no hay dos sitios donde pueda quedar distinto. Cada cambio de precio y
 * cada publicación quedan auditados con autor.
 *
 * Lo que esta pantalla sabe de las reglas es para avisar antes del viaje de ida
 * y vuelta; quien las impone es `CatalogService`:
 *
 * - publicar exige precio, imagen y al menos una variante activa;
 * - el slug de una línea publicada no se cambia (su URL ya está indexada y
 *   renombrarla exigiría una redirección 301);
 * - el precio anterior de una oferta tiene que ser mayor que el precio.
 *
 * La ficha técnica se edita por campos, no como JSON: son las claves que el
 * contrato público muestra en la tarjeta. Cualquier otra clave que ya
 * estuviera guardada se conserva tal cual.
 */
interface ProductFormProps {
  /** `null` crea una línea nueva. */
  product: AdminProductDetail | null;
  brands: BrandRow[] | null;
  /** Lo que falta para publicar, según el backend. */
  readiness: Readiness | null;
  onSaved: (result: ProductWithReadiness, created: boolean) => void;
  onCancel: () => void;
}

/** Los campos de ficha técnica que el sitio público sabe mostrar. */
const TEXT_SPECS = [
  { key: "nicotineStrength", label: "Nicotina", placeholder: "50 mg / 5%" },
  { key: "flavorProfile", label: "Perfil de sabor", placeholder: "Frutal, mentolado" },
  { key: "liquidCapacity", label: "Capacidad", placeholder: "12 ml" },
  { key: "batteryCapacity", label: "Batería", placeholder: "650 mAh" },
  { key: "resistance", label: "Resistencia", placeholder: "1.2 Ω" },
] as const;

type TextSpecKey = (typeof TEXT_SPECS)[number]["key"];

function specText(specs: ProductSpecs | undefined, key: TextSpecKey): string {
  const value = specs?.[key];
  return typeof value === "string" ? value : "";
}

export function ProductForm({ product, brands, readiness, onSaved, onCancel }: ProductFormProps) {
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(product !== null);
  const [brandId, setBrandId] = useState(product?.brandId ?? "");
  const [category, setCategory] = useState<ProductCategory>(product?.category ?? "disposables");
  const [name, setName] = useState(product?.name ?? "");
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product?.price === null ? "" : String(product?.price ?? ""));
  const [compareAtPrice, setCompareAtPrice] = useState(
    product?.compareAtPrice === null ? "" : String(product?.compareAtPrice ?? ""),
  );
  const [imageKey, setImageKey] = useState(product?.imageKey ?? "");
  /**
   * Una carga cuenta como cambio aunque la clave sea la misma: es el caso
   * normal al reemplazar la imagen de una entidad que ya tenía una, porque la
   * clave se deriva de la entidad. Sin esto el PATCH saldría vacío y el
   * formulario diría que no hay nada que guardar justo después de subirla.
   */
  const [imageUploaded, setImageUploaded] = useState(false);
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? "draft");
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [showcase, setShowcase] = useState(product?.showcase ?? false);
  const [isNewArrival, setIsNewArrival] = useState(product?.isNewArrival ?? false);
  const [isBestSeller, setIsBestSeller] = useState(product?.isBestSeller ?? false);
  const [tags, setTags] = useState((product?.tags ?? []).join(", "));
  const [puffCount, setPuffCount] = useState(
    typeof product?.specs.puffCount === "number" ? String(product.specs.puffCount) : "",
  );
  const [texts, setTexts] = useState<Record<TextSpecKey, string>>({
    nicotineStrength: specText(product?.specs, "nicotineStrength"),
    flavorProfile: specText(product?.specs, "flavorProfile"),
    liquidCapacity: specText(product?.specs, "liquidCapacity"),
    batteryCapacity: specText(product?.specs, "batteryCapacity"),
    resistance: specText(product?.specs, "resistance"),
  });
  const [rechargeable, setRechargeable] = useState(
    typeof product?.specs.rechargeable === "boolean" ? String(product.specs.rechargeable) : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = product ? `product-${product.id}` : "product-nueva";
  const slugLocked = product?.status === "published";
  const gaps = readiness?.missing ?? [];

  function changeName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  /** La ficha técnica resultante, conservando las claves que no se editan aquí. */
  function buildSpecs(): ProductSpecs | string {
    const specs: ProductSpecs = { ...(product?.specs ?? {}) };

    if (puffCount.trim() === "") {
      delete specs.puffCount;
    } else {
      const puffs = toInteger(puffCount);
      if (puffs === null || puffs < 0) return "Las puffs son un número entero de 0 en adelante";
      specs.puffCount = puffs;
    }

    for (const field of TEXT_SPECS) {
      const value = texts[field.key].trim();
      if (value === "") delete specs[field.key];
      else specs[field.key] = value;
    }

    if (rechargeable === "") delete specs.rechargeable;
    else specs.rechargeable = rechargeable === "true";

    return specs;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!brandId) {
      setError("Hay que elegir una marca");
      return;
    }

    const priceValue = price.trim() === "" ? null : toInteger(price);
    if (price.trim() !== "" && (priceValue === null || priceValue < 0)) {
      setError("El precio es un número entero de pesos, sin puntos ni decimales");
      return;
    }
    const compareValue = compareAtPrice.trim() === "" ? null : toInteger(compareAtPrice);
    if (compareAtPrice.trim() !== "" && (compareValue === null || compareValue < 0)) {
      setError("El precio anterior es un número entero de pesos");
      return;
    }
    if (compareValue !== null && (priceValue === null || compareValue <= priceValue)) {
      setError("El precio anterior tiene que ser mayor que el precio actual");
      return;
    }

    const specs = buildSpecs();
    if (typeof specs === "string") {
      setError(specs);
      return;
    }

    // Publicar exige las tres cosas. Lo impone el backend; avisar aquí ahorra
    // el viaje y, sobre todo, dice qué falta sin tener que intentarlo.
    if (status === "published") {
      const missing: string[] = [];
      if (priceValue === null) missing.push("precio");
      if (!imageKey.trim()) missing.push("imagen");
      if (product && !product.variants.some((variant) => variant.active)) {
        missing.push("una variante activa");
      }
      if (!product) missing.push("una variante activa (se crea después de guardar la línea)");
      if (missing.length > 0) {
        setError(`Para publicar falta: ${missing.join(", ")}. Guárdala como borrador.`);
        return;
      }
    }

    const values: ProductInput = {
      slug: slug.trim(),
      brandId,
      category,
      name: name.trim(),
      description: description.trim(),
      shortDescription: shortDescription.trim(),
      specs,
      price: priceValue,
      compareAtPrice: compareValue,
      status,
      imageKey: imageKey.trim() || null,
      featured,
      showcase,
      isNewArrival,
      isBestSeller,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ""),
    };

    setPending(true);
    try {
      if (!product) {
        onSaved(await adminApi.createProduct(values), true);
        return;
      }

      const patch: Partial<ProductInput> = {};
      if (values.slug !== product.slug) patch.slug = values.slug;
      if (values.brandId !== product.brandId) patch.brandId = values.brandId;
      if (values.category !== product.category) patch.category = values.category;
      if (values.name !== product.name) patch.name = values.name;
      if (values.description !== product.description) patch.description = values.description;
      if (values.shortDescription !== product.shortDescription) {
        patch.shortDescription = values.shortDescription;
      }
      if (JSON.stringify(values.specs) !== JSON.stringify(product.specs)) patch.specs = values.specs;
      if (values.price !== product.price) patch.price = values.price;
      if (values.compareAtPrice !== product.compareAtPrice) {
        patch.compareAtPrice = values.compareAtPrice;
      }
      if (values.status !== product.status) patch.status = values.status;
      if (values.imageKey !== product.imageKey || imageUploaded) patch.imageKey = values.imageKey;
      if (values.featured !== product.featured) patch.featured = values.featured;
      if (values.showcase !== product.showcase) patch.showcase = values.showcase;
      if (values.isNewArrival !== product.isNewArrival) patch.isNewArrival = values.isNewArrival;
      if (values.isBestSeller !== product.isBestSeller) patch.isBestSeller = values.isBestSeller;
      if ((values.tags ?? []).join("\u0000") !== product.tags.join("\u0000")) patch.tags = values.tags;

      if (Object.keys(patch).length === 0) {
        setError("No hay ningún cambio que guardar");
        return;
      }
      onSaved(await adminApi.updateProduct(product.id, patch), false);
    } catch (cause) {
      setError(errorMessage(cause, "No se pudo guardar la línea"));
    } finally {
      setPending(false);
    }
  }

  const priceNumber = toInteger(price);

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      {product && <ReadinessNotice gaps={gaps} status={product.status} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          hint={
            slugLocked
              ? "No se cambia: la URL ya está publicada. Pásala a borrador para renombrarla."
              : "Minúsculas, con guiones y sin acentos."
          }
        >
          <TextField
            id={`${prefix}-slug`}
            required
            maxLength={80}
            disabled={slugLocked}
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
        </Labelled>

        <Labelled label="Marca" htmlFor={`${prefix}-brand`}>
          <SelectField
            id={`${prefix}-brand`}
            required
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
          >
            <option value="">{brands === null ? "Cargando…" : "Elige una marca"}</option>
            {(brands ?? []).map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.active ? brand.name : `${brand.name} (inactiva)`}
              </option>
            ))}
          </SelectField>
        </Labelled>

        <Labelled label="Categoría" htmlFor={`${prefix}-category`}>
          <SelectField
            id={`${prefix}-category`}
            value={category}
            onChange={(event) => setCategory(event.target.value as ProductCategory)}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </Labelled>

        <ImageUploadField
          id={`${prefix}-image`}
          label="Imagen de la línea"
          target="product-line-image"
          entityId={product?.id ?? null}
          imageKey={imageKey || null}
          onUploaded={(key) => {
            setImageKey(key);
            setImageUploaded(true);
          }}
          onClear={() => setImageKey("")}
          onError={setError}
        />

        <Labelled
          label="Estado"
          htmlFor={`${prefix}-status`}
          hint="Publicada se ve en el sitio; borrador, no."
        >
          <SelectField
            id={`${prefix}-status`}
            value={status}
            onChange={(event) => setStatus(event.target.value as ProductStatus)}
          >
            <option value="draft">Borrador</option>
            <option value="published">Publicada</option>
          </SelectField>
        </Labelled>

        <Labelled
          label="Resumen"
          htmlFor={`${prefix}-short`}
          hint="Una línea: es lo que se lee en la tarjeta del catálogo."
          className="sm:col-span-2 lg:col-span-3"
        >
          <TextAreaField
            id={`${prefix}-short`}
            maxLength={300}
            rows={2}
            value={shortDescription}
            onChange={(event) => setShortDescription(event.target.value)}
          />
        </Labelled>

        <Labelled
          label="Descripción"
          htmlFor={`${prefix}-description`}
          className="sm:col-span-2 lg:col-span-3"
        >
          <TextAreaField
            id={`${prefix}-description`}
            maxLength={5000}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Labelled>
      </div>

      <FieldGroup title="PRECIO">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Labelled
            label="Precio (COP)"
            htmlFor={`${prefix}-price`}
            hint={
              priceNumber !== null && price.trim() !== ""
                ? formatPriceCOP(priceNumber)
                : "Entero, sin puntos. Vacío deja la línea sin precio."
            }
          >
            <TextField
              id={`${prefix}-price`}
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </Labelled>

          <Labelled
            label="Precio anterior"
            htmlFor={`${prefix}-compare`}
            hint="Mayor que el precio. Es el tachado de la etiqueta «Oferta»."
          >
            <TextField
              id={`${prefix}-compare`}
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              value={compareAtPrice}
              onChange={(event) => setCompareAtPrice(event.target.value)}
            />
          </Labelled>
        </div>
        <p className="mt-2 text-xs text-muted">
          El precio vive en la línea, no en las variantes: todos los sabores de una línea valen lo
          mismo. Cada cambio queda auditado con autor y fecha.
        </p>
      </FieldGroup>

      <FieldGroup title="FICHA TECNICA">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Labelled label="Puffs" htmlFor={`${prefix}-puffs`}>
            <TextField
              id={`${prefix}-puffs`}
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              value={puffCount}
              onChange={(event) => setPuffCount(event.target.value)}
            />
          </Labelled>

          {TEXT_SPECS.map((field) => (
            <Labelled key={field.key} label={field.label} htmlFor={`${prefix}-${field.key}`}>
              <TextField
                id={`${prefix}-${field.key}`}
                maxLength={120}
                placeholder={field.placeholder}
                value={texts[field.key]}
                onChange={(event) =>
                  setTexts((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            </Labelled>
          ))}

          <Labelled label="Recargable" htmlFor={`${prefix}-rechargeable`}>
            <SelectField
              id={`${prefix}-rechargeable`}
              value={rechargeable}
              onChange={(event) => setRechargeable(event.target.value)}
            >
              <option value="">Sin dato</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </SelectField>
          </Labelled>
        </div>
        <p className="mt-2 text-xs text-muted">
          Lo que quede vacío no se guarda. Las claves que no están aquí, si las hubiera, se
          conservan.
        </p>
      </FieldGroup>

      <FieldGroup title="EN EL SITIO">
        <div className="flex flex-wrap items-center gap-x-6">
          <CheckField label="Destacada" checked={featured} onChange={setFeatured} />
          <CheckField label="Novedad" checked={isNewArrival} onChange={setIsNewArrival} />
          <CheckField label="Más vendida" checked={isBestSeller} onChange={setIsBestSeller} />
          {/* La vitrina se lleva mejor desde su propia pantalla, donde se ven
              las fotos y el recuento de caras; la casilla está aquí para poder
              elegirla de paso al crear o editar la línea. */}
          <CheckField label="Vitrina 3D" checked={showcase} onChange={setShowcase} />
        </div>
        <p className="mt-2 text-xs text-muted">
          «Vitrina 3D» pone la línea en el prisma de la portada. Son seis caras:
          mejor elegirlas en{" "}
          <Link href="/admin/showcase" className="font-bold text-action underline">
            Vitrina
          </Link>
          , que enseña las fotos y avisa si sobran o faltan.
        </p>
        <Labelled
          label="Etiquetas"
          htmlFor={`${prefix}-tags`}
          hint="Separadas por comas: mango, hielo, 12 ml."
          className="mt-2"
        >
          <TextField
            id={`${prefix}-tags`}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </Labelled>
      </FieldGroup>

      {error && <FormError>{error}</FormError>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : product ? "Guardar cambios" : "Crear línea"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
