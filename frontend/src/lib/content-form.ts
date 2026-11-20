import { z } from "zod";
import {
  CONTENT_SCHEMAS,
  isLegalFaqQuestion,
  LEGAL_FAQ_INDEX,
  normalizeFaqForRead,
  PARTNER_BRANDS_TOKEN,
  stripLegalFaqItem,
  type ContentKey,
  type ContentValue,
} from "@/lib/content/schemas";

/**
 * Lógica pura del editor de contenido de la consola (`/admin/content`, A5.4).
 *
 * Todo se deriva del esquema espejo (`lib/content/schemas.ts`), que la prueba
 * de paridad mantiene igual al del backend: los máximos de los contadores, los
 * mínimos y máximos de las listas y la validación en vivo. Así la UI no deja
 * publicar nada que el backend fuera a rechazar, y un cambio de límite en el
 * esquema llega solo a la pantalla.
 */

/** Errores por campo, con la ruta del valor unida por puntos (`items.0.question`). `""` es el valor entero. */
export type FieldErrors = Record<string, string>;

export const CONTENT_KEY_INFO: Record<ContentKey, { label: string; description: string }> = {
  hero: { label: "Intro", description: "Etiqueta y reclamo de la portada, encima y debajo del logotipo." },
  "trust-band": { label: "Banda de confianza", description: "Las tres tarjetas del panel de información." },
  faq: { label: "Preguntas", description: "Título, entradilla y preguntas frecuentes de la portada." },
  seo: { label: "SEO", description: "Título, descripción y tarjetas para buscadores y redes sociales." },
  contact: { label: "Pie", description: "Texto de marca, ubicación, horario y servicio del pie de página." },
};

/**
 * Normalización de lectura, la misma que hacen el backend y el sitio: en la
 * FAQ quita la pregunta legal (fija en código) y recorta a 11 una fila antigua
 * más larga. Para cargar versiones publicadas y para la vista previa; **no**
 * para validar lo que se escribe, que tiene que casar campo a campo.
 */
export function normalizeForRead(key: ContentKey, value: unknown): unknown {
  return key === "faq" ? normalizeFaqForRead(value) : value;
}

/** Mensaje bajo una pregunta editable que repite la legal. */
export const LEGAL_DUPLICATE_MESSAGE = "Esta pregunta ya la añade el sitio (aviso legal fijo)";

/** Índices de las preguntas de un valor de FAQ que repiten la legal. */
function legalDuplicates(value: unknown): number[] {
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item, index) => {
    const question = (item as { question?: unknown } | null)?.question;
    return typeof question === "string" && isLegalFaqQuestion(question) ? [index] : [];
  });
}

type Issue = z.core.$ZodIssue;

/** Mensaje en español para la pantalla. Los de Zod salen en inglés. */
export function issueMessage(issue: Issue): string {
  if (issue.code === "too_big") {
    const max = Number(issue.maximum);
    if (issue.origin === "string") return `Máximo ${max} caracteres`;
    if (issue.origin === "array") return `Máximo ${max} elementos`;
  }
  if (issue.code === "too_small") {
    const min = Number(issue.minimum);
    if (issue.origin === "string") return min <= 1 ? "No puede quedar vacío" : `Mínimo ${min} caracteres`;
    if (issue.origin === "array") return min <= 1 ? "Hace falta al menos uno" : `Mínimo ${min} elementos`;
  }
  if (issue.code === "invalid_type") return "Falta este campo";
  if (issue.code === "unrecognized_keys") return "Campos que el esquema no admite";
  return issue.message;
}

/** Rutas de los textos que contienen el marcador de marcas aliadas. */
function tokenPaths(value: unknown, path: string[] = []): string[] {
  if (typeof value === "string") return value.includes(PARTNER_BRANDS_TOKEN) ? [path.join(".")] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => tokenPaths(item, [...path, String(index)]));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([field, item]) => tokenPaths(item, [...path, field]));
  }
  return [];
}

export interface Validation<K extends ContentKey> {
  /** El valor ya normalizado (recortado) si es publicable; `null` si hay errores. */
  value: ContentValue<K> | null;
  errors: FieldErrors;
}

/**
 * Validación en vivo: la misma que hará el backend al publicar. El primer
 * error de cada ruta gana, que es el que se muestra bajo el campo.
 *
 * Se valida el valor tal cual, sin quitar la pregunta legal: así los índices
 * de los errores casan con las tarjetas. Si una pregunta editable repite la
 * legal, se marca en su campo; el backend la quitaría en silencio.
 */
export function validateContent<K extends ContentKey>(key: K, value: unknown): Validation<K> {
  const parsed = CONTENT_SCHEMAS[key].schema.safeParse(value);
  const errors: FieldErrors = {};
  if (key === "faq") {
    for (const index of legalDuplicates(value)) errors[`items.${index}.question`] = LEGAL_DUPLICATE_MESSAGE;
  }
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      errors[path] ??= issueMessage(issue);
    }
    return { value: null, errors };
  }
  if (Object.keys(errors).length > 0) return { value: null, errors };
  // El sitio solo sustituye `{marcas}` en la FAQ: en otra clave saldría literal.
  if (key !== "faq") {
    for (const path of tokenPaths(parsed.data)) {
      errors[path] ??= `El marcador ${PARTNER_BRANDS_TOKEN} solo vale en la FAQ`;
    }
    if (Object.keys(errors).length > 0) return { value: null, errors };
  }
  return { value: parsed.data as ContentValue<K>, errors };
}

/**
 * Los campos de un 400 del backend (`value.items.0.question`) con la misma
 * ruta que usa el formulario (`items.0.question`).
 */
export function apiFieldErrors(fields: { field: string; message: string }[] | undefined): FieldErrors {
  const errors: FieldErrors = {};
  for (const { field, message } of fields ?? []) {
    if (field !== "value" && !field.startsWith("value.")) continue;
    errors[field === "value" ? "" : field.slice("value.".length)] ??= message;
  }
  return errors;
}

/**
 * Lo que el editor carga: la versión publicada si cumple el esquema vigente
 * (sin la pregunta legal), y si no —nunca se publicó, o es una fila antigua—
 * el texto por defecto, que es justo lo que está sirviendo el sitio.
 */
export function editableValue<K extends ContentKey>(
  key: K,
  published: unknown | undefined,
): { value: ContentValue<K>; source: "published" | "default" | "invalid" } {
  if (published === undefined) return { value: CONTENT_SCHEMAS[key].defaults as ContentValue<K>, source: "default" };
  const parsed = CONTENT_SCHEMAS[key].schema.safeParse(normalizeForRead(key, published));
  return parsed.success
    ? { value: parsed.data as ContentValue<K>, source: "published" }
    : { value: CONTENT_SCHEMAS[key].defaults as ContentValue<K>, source: "invalid" };
}

/**
 * `true` si el backend aceptaría restaurar esa versión: la valida como al
 * publicar, quitando la pregunta legal pero sin recortar.
 */
export function isRestorable(key: ContentKey, value: unknown): boolean {
  return validateContent(key, key === "faq" ? stripLegalFaqItem(value) : value).value !== null;
}

/** `true` si los dos valores publicarían lo mismo (tras recortar). */
export function sameContent(key: ContentKey, a: unknown, b: unknown): boolean {
  const left = validateContent(key, a).value ?? a;
  const right = validateContent(key, b).value ?? b;
  return JSON.stringify(left) === JSON.stringify(right);
}

// --- Límites, sacados del esquema ---

type JsonNode = {
  properties?: Record<string, JsonNode>;
  items?: JsonNode;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

const jsonSchemas = new Map<ContentKey, JsonNode>();

function nodeAt(key: ContentKey, path: readonly (string | number)[]): JsonNode | undefined {
  let node = jsonSchemas.get(key);
  if (!node) {
    node = z.toJSONSchema(CONTENT_SCHEMAS[key].schema) as JsonNode;
    jsonSchemas.set(key, node);
  }
  for (const segment of path) {
    node = typeof segment === "number" ? node?.items : node?.properties?.[segment];
  }
  return node;
}

/** Máximo de caracteres del texto en `path` (los índices de lista, como número). */
export function maxLengthAt(key: ContentKey, path: readonly (string | number)[]): number {
  const max = nodeAt(key, path)?.maxLength;
  if (max === undefined) throw new Error(`Sin máximo en ${key}.${path.join(".")}`);
  return max;
}

/** Mínimo y máximo de elementos de la lista en `path`. */
export function itemsRangeAt(key: ContentKey, path: readonly (string | number)[]): { min: number; max: number } {
  const node = nodeAt(key, path);
  if (node?.minItems === undefined || node.maxItems === undefined) {
    throw new Error(`Sin límites de lista en ${key}.${path.join(".")}`);
  }
  return { min: node.minItems, max: node.maxItems };
}

// --- Listas ---

/** Mueve el elemento `index` una posición (`delta` = -1 sube, 1 baja). Fuera de rango, no cambia nada. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function replaceItem<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((current, i) => (i === index ? item : current));
}

/**
 * Antes de qué pregunta editable va la legal en el sitio (`withLegalFaqItem`):
 * la consola la pinta bloqueada en ese mismo hueco. Igual a `length` si va al
 * final.
 */
export function legalFaqSlot(editableCount: number): number {
  return Math.min(LEGAL_FAQ_INDEX, editableCount);
}

// --- Vista previa y avisos ---

/** Recorta para la tarjeta de buscador: como el buscador, con «…» al final. */
export function truncateForPreview(text: string, max: number): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Confirmación tras publicar o restaurar, según si el sitio confirmó el refresco (A7.3). */
export function publishedMessage(revalidated: boolean, version: number, restoredFrom?: number): string {
  const what =
    restoredFrom === undefined
      ? `Versión ${version} publicada`
      : `Versión ${restoredFrom} restaurada como versión ${version}`;
  return revalidated
    ? `${what} y visible en el sitio.`
    : `${what}. Se verá en el sitio en ≤60 s.`;
}
