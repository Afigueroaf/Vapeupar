import { AgeVerificationModal } from "@/components/age-verification-modal";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { ProductCatalog } from "@/components/product-catalog";
import { Footer } from "@/components/footer";
import { Product } from "@/types/product";

// Fallback products for SSR and initial load
const FALLBACK_PRODUCTS: Product[] = [
  {
    id: "prod-001",
    name: "Lost Mary MO10000 Watermelon Ice",
    slug: "lost-mary-mo10000-watermelon-ice",
    brand: "Lost Mary",
    category: "disposables",
    shortDescription: "10,000 Puffs con pantalla inteligente y sabor refrescante a sandía helada.",
    description: "Vaporizador desechable con pantalla indicadora de batería y líquido.",
    price: 65000,
    compareAtPrice: 75000,
    inStock: true,
    stock: 24,
    imageUrl: "https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80",
    featured: true,
    isBestSeller: true,
    specs: {
      puffCount: 10000,
      nicotineStrength: "50mg (5%)",
      flavorProfile: "Sandía Helada",
      liquidCapacity: "18ml",
      batteryCapacity: "600mAh USB-C",
      rechargeable: true
    },
    tags: ["desechable", "pantalla led", "sandia", "bestseller"]
  },
  {
    id: "prod-002",
    name: "Geekvape Wenax Q Pro Pod Kit",
    slug: "geekvape-wenax-q-pro",
    brand: "Geekvape",
    category: "pod-systems",
    shortDescription: "Kit de Pod recargable con pantalla táctil hápitca y hasta 30W de potencia.",
    description: "Pod recargable de alto rendimiento con batería de 1200mAh.",
    price: 135000,
    compareAtPrice: 150000,
    inStock: true,
    stock: 12,
    imageUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=600&q=80",
    featured: true,
    isNewArrival: true,
    specs: {
      nicotineStrength: "Variable según líquido",
      liquidCapacity: "2ml",
      batteryCapacity: "1200mAh USB-C",
      resistance: "0.6 / 0.8 / 1.2 ohm",
      rechargeable: true
    },
    tags: ["pod system", "recargable", "geekvape"]
  },
  {
    id: "prod-003",
    name: "Nasty Juice Cush Man Mango Salt Nic 30ml",
    slug: "nasty-juice-cush-man-mango-salt-30ml",
    brand: "Nasty Juice",
    category: "salt-nic",
    shortDescription: "El legendario mango tropical dulce en sales de nicotina.",
    description: "E-líquido con sales de nicotina sabor mango dulce y jugoso.",
    price: 55000,
    inStock: true,
    stock: 35,
    imageUrl: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=80",
    featured: true,
    specs: {
      nicotineStrength: "35mg (3.5%)",
      flavorProfile: "Mango Tropical",
      liquidCapacity: "30ml"
    },
    tags: ["sales de nicotina", "mango", "nasty juice"]
  },
  {
    id: "prod-004",
    name: "Oxva Xlim Pro Pod Kit",
    slug: "oxva-xlim-pro-pod-kit",
    brand: "OXVA",
    category: "pod-systems",
    shortDescription: "El rey del sabor con pantalla RGB, 30W de potencia y 1000mAh.",
    description: "Dispositivo ergonómico para sales y líquidos tradicionales.",
    price: 140000,
    inStock: true,
    stock: 8,
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80",
    featured: true,
    isBestSeller: true,
    specs: {
      nicotineStrength: "Variable",
      liquidCapacity: "2ml Top Fill",
      batteryCapacity: "1000mAh USB-C",
      resistance: "0.6 / 0.8 ohm"
    },
    tags: ["oxva", "xlim", "pod kit"]
  },
  {
    id: "prod-005",
    name: "Elf Bar BC10000 Strawberry Kiwi",
    slug: "elf-bar-bc10000-strawberry-kiwi",
    brand: "Elf Bar",
    category: "disposables",
    shortDescription: "10,000 Puffs con tecnología Quaq Mesh Coil sabor fresa kiwi.",
    description: "Vape desechable con indicador luminoso y batería recargable.",
    price: 60000,
    compareAtPrice: 70000,
    inStock: true,
    stock: 19,
    imageUrl: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80",
    featured: false,
    specs: {
      puffCount: 10000,
      nicotineStrength: "50mg (5%)",
      flavorProfile: "Fresa Kiwi Helado",
      liquidCapacity: "18ml",
      batteryCapacity: "620mAh USB-C",
      rechargeable: true
    },
    tags: ["desechable", "elf bar", "fresa kiwi"]
  },
  {
    id: "prod-006",
    name: "Vaporesso GTX Coils Pack x5",
    slug: "vaporesso-gtx-coils-pack-5",
    brand: "Vaporesso",
    category: "coils-accessories",
    shortDescription: "Pack de 5 resistencias de malla de alto rendimiento.",
    description: "Resistencias originales para Target, Luxe y Gen.",
    price: 52000,
    inStock: true,
    stock: 15,
    imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
    featured: false,
    specs: {
      nicotineStrength: "N/A",
      resistance: "0.2 / 0.3 / 0.8 ohm"
    },
    tags: ["resistencias", "coils", "vaporesso"]
  }
];

async function getProducts(): Promise<Product[]> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    const res = await fetch(`${apiUrl}/products`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) {
      return FALLBACK_PRODUCTS;
    }
    const json = await res.json();
    return json.data || FALLBACK_PRODUCTS;
  } catch (_e) {
    // Si la API del backend está apagada, usa los productos de respaldo
    return FALLBACK_PRODUCTS;
  }
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <AgeVerificationModal />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ProductCatalog initialProducts={products} />
      </main>
      <Footer />
    </div>
  );
}
