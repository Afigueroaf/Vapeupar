import { AgeVerificationModal } from "@/components/age-verification-modal";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { TrustBand } from "@/components/trust-band";
import { ProductCatalog } from "@/components/product-catalog";
import { FAQ } from "@/components/faq";
import { Footer } from "@/components/footer";
import { FALLBACK_PRODUCTS } from "@/data/fallback-products";
import { Product } from "@/types/product";

async function getProducts(): Promise<Product[]> {
  try {
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const res = await fetch(`${apiUrl}/products`, {
      next: { revalidate: 60 },
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      return FALLBACK_PRODUCTS;
    }

    const json = await res.json();
    if (json && json.success && Array.isArray(json.data)) {
      return json.data;
    }

    return FALLBACK_PRODUCTS;
  } catch {
    // Si la API del backend está apagada, usa los productos de respaldo
    return FALLBACK_PRODUCTS;
  }
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Fuera de `.vp-glitch`: el filtro rompería su posicionamiento fijo. */}
      <AgeVerificationModal />

      <div className="vp-glitch flex flex-1 flex-col">
        <Navbar />
        <main className="flex-1">
          <Hero />
          <TrustBand />
          <ProductCatalog initialProducts={products} />
          <FAQ />
        </main>
        <Footer />
      </div>
    </div>
  );
}
