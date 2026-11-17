import type { ProductCategory } from "@/types/product";

/**
 * Colecciones públicas: `/coleccion/<slug>`.
 *
 * Una por cada categoría del contrato (`types/product.ts`), con slug en
 * español porque es la URL que se comparte por WhatsApp. La tabla es la única
 * fuente: la página valida contra ella (slug desconocido → 404) y la barra, el
 * menú móvil y el pie enlazan desde aquí.
 *
 * El orden es el del recorrido de compra, el mismo que los filtros del
 * catálogo: desechables primero, accesorios al final.
 */
export interface Collection {
  slug: string;
  category: ProductCategory;
  /** Nombre visible: chip, menú y título de la página. */
  label: string;
  /** Entradilla de la página y descripción para buscadores. */
  description: string;
}

export const COLLECTIONS: readonly Collection[] = [
  {
    slug: "desechables",
    category: "disposables",
    label: "Desechables",
    description:
      "Vapes desechables listos para usar, sin cargar líquido ni cambiar resistencias. Originales y con entrega en Valledupar.",
  },
  {
    slug: "pods",
    category: "pod-systems",
    label: "Pods recargables",
    description:
      "Sistemas de pod recargables: batería que dura y cartuchos que cambias en segundos. Originales y con entrega en Valledupar.",
  },
  {
    slug: "sales-de-nicotina",
    category: "salt-nic",
    label: "Sales de nicotina",
    description:
      "Líquidos de sales de nicotina para pods: golpe suave y absorción rápida. Originales y con entrega en Valledupar.",
  },
  {
    slug: "freebase",
    category: "freebase-liquids",
    label: "Freebase",
    description: "E-líquidos freebase para equipos de mayor potencia. Originales y con entrega en Valledupar.",
  },
  {
    slug: "mods-y-tanques",
    category: "mods-tanks",
    label: "Mods y tanques",
    description: "Mods y tanques para quien quiere controlar potencia y sabor. Originales y con entrega en Valledupar.",
  },
  {
    slug: "resistencias",
    category: "coils-accessories",
    label: "Resistencias y accesorios",
    description: "Resistencias, cartuchos de repuesto y accesorios para tu equipo. Originales y con entrega en Valledupar.",
  },
];

export function collectionBySlug(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

export function collectionHref(category: ProductCategory): string {
  const c = COLLECTIONS.find((x) => x.category === category);
  return c ? `/coleccion/${c.slug}` : "/#catalogo";
}
