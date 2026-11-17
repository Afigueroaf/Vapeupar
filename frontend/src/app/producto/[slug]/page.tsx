import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AgeVerificationModal } from "@/components/age-verification-modal";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ProductDetail } from "@/components/product-detail/product-detail";
import { TouchCursor } from "@/components/touch-cursor";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { FALLBACK_PRODUCTS } from "@/data/fallback-products";
import { fetchProductBySlug } from "@/lib/api";
import type { Product } from "@/types/product";

/**
 * Ficha de una línea de producto: `/producto/[slug]`.
 *
 * Es la ruta que el inventario de diseño reservaba (`docs/design-reset-inventory.md`
 * §5.6, fase V8). Una página y no un modal sobre el catálogo, que es lo que
 * hace cualquier tienda: tiene URL propia que se comparte por WhatsApp, la
 * indexan los buscadores y el botón «atrás» del teléfono devuelve al catálogo.
 * El sabor elegido va en la URL (`?sabor=`) por lo mismo.
 */

async function loadProduct(slug: string): Promise<Product> {
  const lookup = await fetchProductBySlug(slug);
  if (lookup.kind === "found") return lookup.product;
  if (lookup.kind === "not-found") notFound();

  // Sin backend, la ficha sale de la copia de respaldo, igual que la portada.
  // Si tampoco está ahí, para el visitante no existe: es preferible un 404
  // a una página de error por una caída que quizá dure segundos.
  const fallback = FALLBACK_PRODUCTS.find((product) => product.slug === slug);
  if (!fallback) notFound();
  return fallback;
}

export async function generateMetadata({ params }: PageProps<"/producto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  const description =
    product.shortDescription ||
    `${product.brand} ${product.name} con entrega a domicilio en Valledupar. Pago contra entrega.`;
  return {
    title: `${product.name} | Vapeupar`,
    description,
    alternates: { canonical: `/producto/${product.slug}` },
    openGraph: {
      title: `${product.name} | Vapeupar`,
      description,
      ...(product.imageUrl.startsWith("http") && { images: [product.imageUrl] }),
    },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  const { sabor } = await searchParams;
  const product = await loadProduct(slug);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Mismo armazón público que la portada, y por lo mismo fuera de todo
          bloque filtrado: la puerta +18 no se salta entrando directo a una
          ficha desde un enlace compartido. */}
      <AgeVerificationModal />
      <WhatsappFab />
      <TouchCursor />

      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-vp px-inline pb-section pt-6 sm:pt-10">
          <Link
            href="/#catalogo"
            className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold uppercase tracking-[0.04em] text-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Catálogo
          </Link>

          <ProductDetail
            product={product}
            initialVariantSlug={typeof sabor === "string" ? sabor : undefined}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
