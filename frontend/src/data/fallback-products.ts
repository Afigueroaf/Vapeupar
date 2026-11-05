import { Product } from "@/types/product";

/**
 * Datos de respaldo usados cuando la API del backend no responde.
 *
 * Son una copia del catálogo real (los cuatro productos LifePod dados de alta
 * en la consola, 2026-11-05), no datos de muestra: si la API cae, la portada
 * sigue enseñando lo que de verdad se vende.
 *
 * LAS FOTOS SON LOCALES (`public/productos/`), copiadas del CDN. Así el
 * respaldo no depende de `NEXT_PUBLIC_CDN_DOMAIN` ni de que CloudFront
 * responda, que es justo el escenario en el que se usa este archivo.
 *
 * El stock que figura aquí es el de la fecha de la copia y puede estar
 * desactualizado; el bueno es siempre el de la API.
 */
export const FALLBACK_PRODUCTS: Product[] = [
  {
    id: "01a17b11-c979-7258-bd65-62e4899c92c0",
    name: "LifePod ECO 3",
    slug: "lifepod-eco-3",
    brand: "LifePod",
    category: "disposables",
    description: "",
    shortDescription: "",
    price: 50000,
    compareAtPrice: 60000,
    inStock: true,
    stock: 20,
    imageUrl: "/productos/lifepod-eco-3.webp",
    featured: true,
    showcase: false,
    isNewArrival: true,
    isBestSeller: false,
    specs: { puffCount: 10000, nicotineStrength: "" },
    tags: [],
  },
  {
    id: "01a17b11-e0e7-758b-9a28-63cfa72898b0",
    name: "LifePod ECO PRO",
    slug: "lifepod-eco-pro",
    brand: "LifePod",
    category: "disposables",
    description: "",
    shortDescription: "",
    price: 70000,
    compareAtPrice: 80000,
    inStock: false,
    stock: 0,
    imageUrl: "/productos/lifepod-eco-pro.webp",
    featured: false,
    showcase: false,
    isNewArrival: true,
    isBestSeller: true,
    specs: { puffCount: 15000, nicotineStrength: "" },
    tags: [],
  },
  {
    id: "01a17b12-10e2-74c8-9aac-a45f7120fe7a",
    name: "LifePod ONE",
    slug: "lifepod-one",
    brand: "LifePod",
    category: "pod-systems",
    description: "",
    shortDescription: "",
    price: 100000,
    compareAtPrice: 120000,
    inStock: false,
    stock: 0,
    imageUrl: "/productos/lifepod-one.webp",
    featured: true,
    showcase: false,
    isNewArrival: false,
    isBestSeller: false,
    specs: { nicotineStrength: "" },
    tags: [],
  },
  {
    id: "01a17b12-1885-735c-96d0-78d42af0dfd5",
    name: "LifePod FIT",
    slug: "lifepod-fit",
    brand: "LifePod",
    category: "disposables",
    description: "",
    shortDescription: "",
    price: 70000,
    inStock: false,
    stock: 0,
    imageUrl: "/productos/lifepod-fit.webp",
    featured: false,
    showcase: false,
    isNewArrival: false,
    isBestSeller: false,
    specs: { nicotineStrength: "" },
    tags: [],
  },
];
