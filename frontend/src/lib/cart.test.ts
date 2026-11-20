import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/test/memory-storage";
import type { Product, ProductVariant } from "@/types/product";

/**
 * `cart.ts` guarda el estado en el ámbito del módulo y lo carga de
 * `localStorage` una sola vez: cada prueba limpia el almacenamiento y carga
 * un módulo nuevo para que nada se filtre de una a otra.
 *
 * Entorno `node`, sin jsdom: `window` y `localStorage` son dobles mínimos.
 * `cart.ts` solo usa `window.localStorage` y `window.addEventListener`.
 */
type CartModule = typeof import("@/lib/cart");

const STORAGE_KEY = "vp-cart";
const DAY = 86_400_000;

async function loadCart(): Promise<CartModule> {
  vi.resetModules();
  return import("@/lib/cart");
}

/** Lo que el carrito dejó escrito en `localStorage`. */
function stored() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
    v: number;
    lines: { key: string; quantity: number; maxQuantity: number }[];
    updatedAt: number;
  } | null;
}

/** Siembra `localStorage` y devuelve las líneas que el módulo lee al cargar. */
async function linesAfterLoading(raw: string) {
  localStorage.setItem(STORAGE_KEY, raw);
  const cart = await loadCart();
  // `setLineQuantity` sobre una clave inexistente no cambia nada, pero fuerza
  // la carga y escribe el estado leído: así se observa `read()` sin React.
  cart.setLineQuantity("__nada__", 1);
  return stored()?.lines.map((line) => line.key) ?? [];
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "ECO PRO",
    slug: "eco-pro",
    brand: "Marca",
    brandSlug: "marca",
    category: "disposables",
    description: "",
    shortDescription: "",
    price: 30_000,
    inStock: true,
    stock: 50,
    imageUrl: "/linea.jpg",
    featured: false,
    showcase: false,
    specs: { nicotineStrength: "5%" },
    tags: [],
    variants: [],
    ...overrides,
  };
}

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "v1",
    kind: "flavor",
    name: "Mango",
    slug: "mango",
    imageUrl: "",
    inStock: true,
    stock: 50,
    ...overrides,
  };
}

function validLine(key: string) {
  return {
    key,
    productId: "p1",
    variantId: null,
    slug: "eco-pro",
    variantSlug: null,
    name: "ECO PRO",
    brand: "Marca",
    variantName: null,
    variantKind: null,
    price: 30_000,
    imageUrl: "",
    quantity: 1,
    maxQuantity: 10,
  };
}

let localStorage: MemoryStorage;

beforeEach(() => {
  localStorage = new MemoryStorage();
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, addEventListener: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("maxOrderable", () => {
  it("es el menor entre el stock y el tope por línea", async () => {
    const { maxOrderable, MAX_PER_LINE } = await loadCart();
    expect(MAX_PER_LINE).toBe(10);
    expect(maxOrderable(product({ stock: 3 }), null)).toBe(3);
    expect(maxOrderable(product({ stock: 50 }), null)).toBe(10);
  });

  it("usa el stock de la variante si la hay", async () => {
    const { maxOrderable } = await loadCart();
    expect(maxOrderable(product({ stock: 50 }), variant({ stock: 2 }))).toBe(2);
  });

  it("nunca es negativo", async () => {
    const { maxOrderable } = await loadCart();
    expect(maxOrderable(product({ stock: -4 }), null)).toBe(0);
  });
});

describe("lineKey", () => {
  it("une producto y variante, con la variante vacía si no hay", async () => {
    const { lineKey } = await loadCart();
    expect(lineKey("p1", "v1")).toBe("p1:v1");
    expect(lineKey("p1", null)).toBe("p1:");
  });
});

describe("addToCart", () => {
  it("crea la línea con los datos de la variante y lo persiste", async () => {
    const cart = await loadCart();
    expect(cart.addToCart(product(), variant({ imageUrl: "/mango.jpg" }), 2)).toBe(2);
    const saved = stored();
    expect(saved?.v).toBe(1);
    expect(saved?.lines).toEqual([
      expect.objectContaining({
        key: "p1:v1",
        variantName: "Mango",
        variantKind: "flavor",
        imageUrl: "/mango.jpg",
        quantity: 2,
        maxQuantity: 10,
      }),
    ]);
  });

  it("suma a la línea existente en vez de duplicarla", async () => {
    const cart = await loadCart();
    cart.addToCart(product(), null, 2);
    expect(cart.addToCart(product(), null, 3)).toBe(3);
    expect(stored()?.lines).toHaveLength(1);
    expect(stored()?.lines[0].quantity).toBe(5);
  });

  it("no pasa del tope por línea y devuelve las unidades que entraron", async () => {
    const cart = await loadCart();
    cart.addToCart(product(), null, 8);
    expect(cart.addToCart(product(), null, 5)).toBe(2);
    expect(stored()?.lines[0].quantity).toBe(10);
    expect(cart.addToCart(product(), null, 1)).toBe(0);
  });

  it("no pasa del stock", async () => {
    const cart = await loadCart();
    expect(cart.addToCart(product({ stock: 3 }), null, 5)).toBe(3);
  });

  it("sin stock no añade nada", async () => {
    const cart = await loadCart();
    expect(cart.addToCart(product({ stock: 0 }), null, 1)).toBe(0);
    expect(stored()).toBeNull();
  });
});

describe("setLineQuantity, removeLine y clearCart", () => {
  it("fija la cantidad sin pasar del máximo de la línea", async () => {
    const cart = await loadCart();
    cart.addToCart(product({ stock: 4 }), null, 1);
    cart.setLineQuantity("p1:", 3);
    expect(stored()?.lines[0].quantity).toBe(3);
    cart.setLineQuantity("p1:", 99);
    expect(stored()?.lines[0].quantity).toBe(4);
  });

  it("una cantidad de 0 o menos quita la línea", async () => {
    const cart = await loadCart();
    cart.addToCart(product(), null, 1);
    cart.setLineQuantity("p1:", 0);
    expect(stored()?.lines).toEqual([]);
  });

  it("removeLine quita solo esa línea y clearCart las quita todas", async () => {
    const cart = await loadCart();
    cart.addToCart(product(), variant({ id: "v1" }), 1);
    cart.addToCart(product(), variant({ id: "v2" }), 1);
    cart.removeLine("p1:v1");
    expect(stored()?.lines.map((l) => l.key)).toEqual(["p1:v2"]);
    cart.clearCart();
    expect(stored()?.lines).toEqual([]);
  });
});

describe("lectura defensiva de localStorage", () => {
  it("lee un carrito válido y reciente", async () => {
    const raw = JSON.stringify({ v: 1, lines: [validLine("p1:")], updatedAt: Date.now() });
    expect(await linesAfterLoading(raw)).toEqual(["p1:"]);
  });

  it("descarta otra versión del formato", async () => {
    const raw = JSON.stringify({ v: 2, lines: [validLine("p1:")], updatedAt: Date.now() });
    expect(await linesAfterLoading(raw)).toEqual([]);
  });

  it("descarta JSON roto", async () => {
    expect(await linesAfterLoading("{no es json")).toEqual([]);
  });

  it("descarta un carrito de más de 30 días", async () => {
    const raw = JSON.stringify({ v: 1, lines: [validLine("p1:")], updatedAt: Date.now() - 31 * DAY });
    expect(await linesAfterLoading(raw)).toEqual([]);
  });

  it("filtra las líneas mal formadas", async () => {
    const raw = JSON.stringify({
      v: 1,
      updatedAt: Date.now(),
      lines: [
        validLine("buena:"),
        null,
        "texto",
        { ...validLine("sin-nombre:"), name: 3 },
        { ...validLine("cero:"), quantity: 0 },
        { ...validLine("decimal:"), quantity: 1.5 },
        { ...validLine("precio:"), price: "caro" },
      ],
    });
    expect(await linesAfterLoading(raw)).toEqual(["buena:"]);
  });

  it("lo leído se suma a lo que se añade después", async () => {
    const line = { ...validLine("p1:"), quantity: 9 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, lines: [line], updatedAt: Date.now() }));
    const cart = await loadCart();
    expect(cart.addToCart(product(), null, 5)).toBe(1);
    expect(stored()?.lines[0].quantity).toBe(10);
  });
});

describe("limitLine", () => {
  it("baja el máximo y la cantidad al disponible del servidor", async () => {
    const cart = await loadCart();
    cart.addToCart(product(), null, 5);
    cart.limitLine("p1:", 2);
    expect(stored()?.lines[0]).toMatchObject({ quantity: 2, maxQuantity: 2 });
    // El paso a paso ya no deja volver a subir.
    cart.setLineQuantity("p1:", 5);
    expect(stored()?.lines[0].quantity).toBe(2);
  });

  it("no sube una cantidad menor que el nuevo máximo", async () => {
    const cart = await loadCart();
    cart.addToCart(product(), null, 1);
    cart.limitLine("p1:", 3);
    expect(stored()?.lines[0]).toMatchObject({ quantity: 1, maxQuantity: 3 });
  });

  it("con 0 quita la línea", async () => {
    const cart = await loadCart();
    cart.addToCart(product(), null, 1);
    cart.limitLine("p1:", 0);
    expect(stored()?.lines).toEqual([]);
  });
});
