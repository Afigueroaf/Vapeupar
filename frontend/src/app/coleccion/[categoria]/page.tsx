import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { PublicShell } from "@/components/public-shell";
import { buttonStyles } from "@/components/ui/button";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { FALLBACK_PRODUCTS } from "@/data/fallback-products";
import { fetchProducts } from "@/lib/api";
import { COLLECTIONS, collectionBySlug } from "@/lib/collections";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/product";

/**
 * Colección: `/coleccion/[categoria]` (fase V8,
 * `docs/design-reset-inventory.md` §5.5 y §5.6).
 *
 * Sustituye a las anclas invisibles del catálogo (`#desechables`, `#pods`…)
 * como destino de la navegación por categoría: tiene URL propia, título y
 * descripción para buscadores, y el «atrás» del teléfono funciona.
 *
 * ISR: las seis se generan al compilar y se regeneran como mucho cada 60 s,
 * el mismo ritmo que la caché de `lib/api.ts`. Un slug que no está en
 * `lib/collections.ts` es 404 sin llegar a renderizar (`dynamicParams`).
 */
export const revalidate = 60;
export const dynamicParams = false;

export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ categoria: c.slug }));
}

async function loadCollection(slug: string) {
  const collection = collectionBySlug(slug);
  if (!collection) notFound();

  // El máximo de la API es 50 por página; hoy ninguna categoría pasa de
  // unas pocas líneas (las variantes no cuentan: van dentro de cada una).
  const fromApi = await fetchProducts(`?category=${collection.category}&limit=50`);
  // Sin backend, la copia de respaldo, igual que la portada y la ficha.
  const products: Product[] =
    fromApi ?? FALLBACK_PRODUCTS.filter((p) => p.category === collection.category);
  return { collection, products };
}

export async function generateMetadata({ params }: PageProps<"/coleccion/[categoria]">): Promise<Metadata> {
  const { categoria } = await params;
  const collection = collectionBySlug(categoria);
  if (!collection) notFound();
  const title = `${collection.label} | Vapeupar`;
  return {
    title,
    description: collection.description,
    alternates: { canonical: `/coleccion/${collection.slug}` },
    openGraph: { title, description: collection.description },
  };
}

export default async function CollectionPage({ params }: PageProps<"/coleccion/[categoria]">) {
  const { categoria } = await params;
  const { collection, products } = await loadCollection(categoria);

  return (
    <PublicShell>
      <div className="mx-auto max-w-vp px-inline pb-section pt-6 sm:pt-10">
        <Link
          href="/#catalogo"
          className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold uppercase tracking-[0.04em] text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          Tienda
        </Link>

        <header className="vp-glitch mt-6">
          {/* Sin tildes: Press Start 2P no garantiza esos glifos. */}
          <PixelLabel variant="outline">[ COLECCION ]</PixelLabel>
          <h1 className="mt-4 text-[2rem] font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:text-[3rem]">
            {collection.label}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted sm:text-[1.0625rem]">{collection.description}</p>
          <p className="mt-3 text-base text-muted">
            <span className="font-bold text-action">{products.length}</span>{" "}
            {products.length === 1 ? "línea" : "líneas"} disponibles
          </p>
        </header>

        {/* Las demás colecciones: navegación lateral sin volver a la portada. */}
        <nav aria-label="Otras colecciones" className="vp-glitch mt-block">
          <ul className="flex flex-wrap gap-3">
            {COLLECTIONS.map((c) => {
              const current = c.slug === collection.slug;
              return (
                <li key={c.slug}>
                  <Link
                    href={`/coleccion/${c.slug}`}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-[44px] items-center rounded-vp border-2 px-4 font-display text-[0.9375rem] font-semibold uppercase tracking-[0.02em] whitespace-nowrap transition-colors duration-150 ease-vp",
                      current
                        ? "border-action bg-action text-action-ink"
                        : "border-muted text-muted hover:border-line hover:text-foreground",
                    )}
                  >
                    {c.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {products.length > 0 ? (
          // Misma rejilla que el catálogo de la portada (`product-catalog.tsx`).
          <div className="mt-block grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} eagerImage={index === 0} />
            ))}
          </div>
        ) : (
          <Surface className="vp-glitch mt-block flex flex-col items-center p-12 text-center">
            <PixelLabel variant="violet">[ PROXIMAMENTE ]</PixelLabel>
            <h2 className="mt-6 text-xl font-bold uppercase leading-tight sm:text-[1.375rem]">
              Esta colección está vacía por ahora
            </h2>
            <p className="mt-3 max-w-sm text-base text-muted">
              Escríbenos por WhatsApp si buscas algo en concreto: lo conseguimos.
            </p>
            <Link href="/#catalogo" className={buttonStyles("secondary", "mt-8")}>
              Ver toda la tienda
            </Link>
          </Surface>
        )}
      </div>
    </PublicShell>
  );
}
