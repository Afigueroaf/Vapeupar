import {
  CONTENT_SCHEMAS,
  PARTNER_BRANDS_TOKEN,
  normalizeFaqForRead,
  type ContentKey,
  type ContentValue,
} from "@/lib/content/schemas";
import { apiBase } from "@/lib/api";
import { CATALOG_TAG, CONTENT_TAG } from "@/lib/cache-tags";

/**
 * Lectura del contenido editable del sitio (plan A7.2).
 *
 * Solo en Server Components. Cada lectura va etiquetada con `contenido`, para
 * que la revalidación on-demand (A7.3) la invalide sin esperar los 60 s,
 * y se valida con el esquema de su clave: si la API no responde, contesta con
 * error o devuelve algo que no encaja, se sirve el valor por defecto. La página
 * nunca se queda sin texto (ADR-002, invariante 6).
 */

// Las etiquetas viven en `lib/cache-tags.ts`; se reexportan para quien ya las
// importaba de aquí.
export { CATALOG_TAG, CONTENT_TAG };

/** Mismo plazo que el catálogo (`lib/api.ts`): la red de seguridad de A7.3. */
const REVALIDATE_SECONDS = 60;

const FETCH_TIMEOUT_MS = 3000;

async function fetchData(path: string, tags: string[]): Promise<unknown> {
  const base = apiBase();
  if (!base) return undefined;
  try {
    const res = await fetch(`${base}${path}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags },
      headers: { Accept: "application/json" },
      // Un backend que acepta la conexión y no contesta no puede colgar la
      // página: a los 3 s se sirve el valor por defecto.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { success?: unknown; data?: unknown };
    return body.success === true ? body.data : undefined;
  } catch {
    // Backend apagado o inalcanzable.
    return undefined;
  }
}

/** El contenido vigente de la clave, o su valor por defecto. Nunca lanza. */
export async function getContent<K extends ContentKey>(key: K): Promise<ContentValue<K>> {
  const { schema, defaults } = CONTENT_SCHEMAS[key];
  const data = await fetchData(`/content/${key}`, [CONTENT_TAG]);
  const value = (data as { value?: unknown } | undefined)?.value;
  // La API ya normaliza la FAQ; esto cubre un backend de antes de la regla.
  const parsed = schema.safeParse(key === "faq" ? normalizeFaqForRead(value) : value);
  return (parsed.success ? parsed.data : defaults) as ContentValue<K>;
}

/**
 * Nombres de las marcas aliadas activas (A7.4), o `null` si la API no
 * responde. Lleva también la etiqueta del catálogo: marcar una marca como no
 * aliada es un cambio de catálogo.
 */
export async function getPartnerBrands(): Promise<string[] | null> {
  const data = await fetchData("/brands/partners", [CONTENT_TAG, CATALOG_TAG]);
  if (!Array.isArray(data)) return null;
  return data
    .map((brand) => (brand as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
}

/** «A», «A y B», «A, B y C». */
export function formatBrandList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * Sustituye el marcador `{marcas}` por la enumeración de marcas aliadas.
 *
 * Sin lista —API caída o ninguna aliada marcada— el marcador se cambia por una
 * fórmula genérica en vez de por nombres escritos a mano: preferimos no nombrar
 * ninguna marca a nombrar una que ya no se vende (ADR-002 §5).
 */
export function withPartnerBrands(text: string, brands: string[] | null): string {
  if (!text.includes(PARTNER_BRANDS_TOKEN)) return text;
  const list = brands && brands.length > 0 ? formatBrandList(brands) : "nuestras marcas aliadas";
  return text.split(PARTNER_BRANDS_TOKEN).join(list);
}
