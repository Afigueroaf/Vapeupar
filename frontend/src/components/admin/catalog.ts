import type { ProductCategory } from "@/types/product";
import type { AdminProductRow, ProductStatus, ReadinessGap } from "@/types/admin";

/**
 * Nombres y utilidades del catálogo en la consola (plan A5.2 y A5.3).
 *
 * Las categorías son la lista cerrada de la decisión #3 del plan y se escriben
 * como las publica la API (`pod-systems`). Los nombres visibles son los mismos
 * que usa el catálogo público, para que el dueño vea en la consola lo que ve
 * en la tienda.
 */

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  disposables: "Desechables",
  "pod-systems": "Pods recargables",
  "salt-nic": "Sales de nicotina",
  "freebase-liquids": "Freebase",
  "mods-tanks": "Mods y tanques",
  "coils-accessories": "Resistencias",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as ProductCategory[];

export const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
};

export const VARIANT_KIND_LABELS = { flavor: "Sabor", color: "Color" } as const;

/** Qué falta para publicar, en palabras. El orden es el del backend. */
export const READINESS_LABELS: Record<ReadinessGap, string> = {
  price: "precio",
  imageKey: "imagen",
  activeVariant: "una variante activa",
};

/**
 * Lo que le falta a una fila del listado para publicarse.
 *
 * La autoridad es `CatalogService`, que lo impone al publicar y lo devuelve en
 * `meta.readiness` al pedir la ficha. Esto solo evita pedir 20 fichas para
 * pintar el listado: los tres datos ya vienen en la fila.
 */
export function gapsOf(row: AdminProductRow): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  if (row.price === null) gaps.push("price");
  if (!row.imageKey) gaps.push("imageKey");
  if (row.activeVariantCount === 0) gaps.push("activeVariant");
  return gaps;
}

/**
 * Slug sugerido a partir del nombre: minúsculas, sin acentos y con guiones,
 * que es lo que exige el backend. Es una sugerencia, no una imposición: el
 * campo se puede escribir a mano y el slug de una línea publicada no cambia.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Entero o `null` para los campos de dinero y de orden, que llegan como texto. */
export function toInteger(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
