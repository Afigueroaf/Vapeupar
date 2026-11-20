import type { Product } from "@/types/product";

/**
 * Cliente del catálogo público para los componentes de servidor.
 *
 * Es el único sitio del sitio público que habla con la API: la portada y la
 * ficha de producto piden por aquí, y la URL base y el trato de errores no se
 * repiten en cada página. La consola tiene el suyo (`admin-api.ts`) porque va
 * con sesión y desde el navegador.
 */

/** Segundos que Next reutiliza una respuesta antes de volver a pedirla. */
const REVALIDATE_SECONDS = 60;

/**
 * Base absoluta de la API, o `null` si no la hay.
 *
 * En el servidor solo vale una URL absoluta. Al compilar para producción
 * `NEXT_PUBLIC_API_URL` es `/api` (relativa, para el navegador) y no hay
 * `API_URL`: un fetch relativo ahí no falla, se queda colgado hasta que Next
 * aborta el build a los 60 s. Sin URL absoluta, respaldo directo; en la
 * instancia `API_URL` apunta al backend por loopback.
 */
export function apiBase(): string | null {
  const url = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  return /^https?:\/\//.test(url) ? url : null;
}

async function getJson(path: string): Promise<{ status: number; body: unknown } | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      // `catalogo`: la etiqueta que invalidará la revalidación on-demand (A7.3).
      next: { revalidate: REVALIDATE_SECONDS, tags: ["catalogo"] },
      headers: { Accept: "application/json" },
    });
    return { status: res.status, body: res.ok ? await res.json() : null };
  } catch {
    // El backend está apagado o no se alcanza.
    return null;
  }
}

/**
 * Completa lo que una respuesta de una versión anterior del backend puede no
 * traer.
 *
 * `variants` entró en el contrato después que el resto, y hay dos caminos por
 * los que llega una respuesta sin él: un despliegue en el que el frontend se
 * actualiza antes que el backend, y la caché de datos de Next, que sigue
 * sirviendo la última respuesta buena mientras el backend no contesta. Sin
 * esto, cualquier `product.variants.length` tumba la página entera.
 */
function normalize(product: Product): Product {
  return Array.isArray(product.variants) ? product : { ...product, variants: [] };
}

function isEnvelope(body: unknown): body is { success: true; data: unknown } {
  return typeof body === "object" && body !== null && (body as { success?: unknown }).success === true;
}

/**
 * Lista de productos.
 *
 * Devuelve `null` cuando la petición falla y `[]` cuando la API responde bien
 * pero no hay nada que servir. La diferencia importa: «la vitrina está vacía
 * porque nadie ha elegido» no es lo mismo que «el backend no contesta», y solo
 * el segundo caso justifica tirar de los productos de respaldo.
 */
export async function fetchProducts(query = ""): Promise<Product[] | null> {
  const response = await getJson(`/products${query}`);
  if (!response || !isEnvelope(response.body) || !Array.isArray(response.body.data)) return null;
  return (response.body.data as Product[]).map(normalize);
}

/**
 * Resultado de pedir una ficha. Tres casos y no dos, por lo mismo que en
 * `fetchProducts`: un 404 es «esta línea no existe o no está publicada» y la
 * página tiene que responder 404; una caída es «no lo sé», y ahí la página
 * puede tirar del respaldo antes que negar un producto que quizá sí exista.
 */
export type ProductLookup =
  | { kind: "found"; product: Product }
  | { kind: "not-found" }
  | { kind: "unavailable" };

export async function fetchProductBySlug(slug: string): Promise<ProductLookup> {
  const response = await getJson(`/products/${encodeURIComponent(slug)}`);
  if (!response) return { kind: "unavailable" };
  // 400 es un slug con formato imposible: para el visitante, tampoco existe.
  if (response.status === 404 || response.status === 400) return { kind: "not-found" };
  if (!isEnvelope(response.body)) return { kind: "unavailable" };
  return { kind: "found", product: normalize(response.body.data as Product) };
}
