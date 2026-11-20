/**
 * Datos del cliente que el carrito pide antes de registrar el pedido
 * (ADR-003 §4, Ley 1581 de 2012): nombre, celular colombiano y barrio, más la
 * autorización de tratamiento de datos.
 *
 * ESPEJO de `backend/src/schemas/order.schema.ts`. El backend es quien decide;
 * esto existe para decir al cliente qué campo corregir **antes** de enviar, sin
 * gastar una petición. `backend/src/schemas/order-parity.test.ts` compara las
 * dos validaciones y la versión de la política, y falla si divergen: cambia
 * los dos lados a la vez.
 *
 * Sin alias `@/` a propósito: el backend importa este archivo en su prueba de
 * paridad y no conoce el alias.
 *
 * NADA DE ESTO SE GUARDA EN EL NAVEGADOR. Los datos viven en el estado del
 * cajón mientras la página está abierta y viajan una vez al backend; no van a
 * `localStorage` (que sobrevive meses y lo lee cualquier script del origen).
 * El coste es volver a escribirlos tras recargar, que es aceptable para tres
 * campos.
 */

/**
 * Versión del texto de `/privacidad` que el cliente acepta. Igual que
 * `DATA_POLICY_VERSION` del backend, que rechaza cualquier otra. Mientras
 * empiece por «borrador», la página muestra el aviso de revisión legal.
 */
export const DATA_POLICY_VERSION = "borrador-2026-11-20";

/** Ruta pública de la política de tratamiento de datos. */
export const DATA_POLICY_PATH = "/privacidad";

export function isDraftPolicy(version: string = DATA_POLICY_VERSION): boolean {
  return version.startsWith("borrador");
}

export interface CustomerDraft {
  name: string;
  phone: string;
  neighborhood: string;
  /** La casilla de autorización. Nunca marcada por defecto. */
  consent: boolean;
}

export const EMPTY_CUSTOMER: CustomerDraft = { name: "", phone: "", neighborhood: "", consent: false };

export type CustomerField = keyof CustomerDraft;
export type CustomerErrors = Partial<Record<CustomerField, string>>;

/** Lo que viaja en `customer`, ya limpio. */
export interface CustomerValue {
  name: string;
  /** `+573XXXXXXXXX`. */
  phone: string;
  neighborhood: string;
}

const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const NEIGHBORHOOD = /^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'’#°º-]*$/u;

export const TEXT_MIN = 2;
export const TEXT_MAX = 80;

/** Espacios repetidos fuera, como hace el backend antes de validar. */
export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Móvil colombiano: 10 cifras que empiezan por 3, con o sin +57, con
 * espacios, guiones, puntos o paréntesis. Devuelve `+573XXXXXXXXX`.
 */
export function normalizeColombianMobile(input: string): string | undefined {
  if (input.length > 30) return undefined;
  const compact = input.replace(/[\s\-.()]/g, "");
  const match = /^(?:\+?57)?(3\d{9})$/.exec(compact);
  return match ? `+57${match[1]}` : undefined;
}

function checkText(value: string, pattern: RegExp, label: string, charset: string): string | undefined {
  if (value === "") return `Escribe tu ${label}`;
  if (value.length < TEXT_MIN) return `Mínimo ${TEXT_MIN} caracteres`;
  if (value.length > TEXT_MAX) return `Máximo ${TEXT_MAX} caracteres`;
  if (!pattern.test(value)) return charset;
  return undefined;
}

export const MESSAGES = {
  phone: "Escribe un celular colombiano de 10 cifras (3XX XXX XXXX)",
  consent: "Para registrar el pedido necesitamos tu autorización",
} as const;

/**
 * Valida el formulario. Sin errores, devuelve también el valor limpio que se
 * envía; con alguno, solo los errores por campo.
 */
export function validateCustomer(
  draft: CustomerDraft,
): { ok: true; value: CustomerValue } | { ok: false; errors: CustomerErrors } {
  const name = collapseSpaces(draft.name);
  const neighborhood = collapseSpaces(draft.neighborhood);
  const phone = normalizeColombianMobile(draft.phone);

  const errors: CustomerErrors = {};
  const nameError = checkText(
    name,
    NAME,
    "nombre",
    "El nombre solo admite letras, espacios, puntos, apóstrofos y guiones",
  );
  if (nameError) errors.name = nameError;
  if (!phone) errors.phone = draft.phone.trim() === "" ? "Escribe tu celular" : MESSAGES.phone;
  const neighborhoodError = checkText(
    neighborhood,
    NEIGHBORHOOD,
    "barrio",
    "El barrio solo admite letras, números y . , # -",
  );
  if (neighborhoodError) errors.neighborhood = neighborhoodError;
  if (!draft.consent) errors.consent = MESSAGES.consent;

  if (Object.keys(errors).length > 0 || !phone) return { ok: false, errors };
  return { ok: true, value: { name, phone, neighborhood } };
}

/** Orden de los campos en pantalla: el primero con error recibe el foco. */
export const CUSTOMER_FIELDS: CustomerField[] = ["name", "phone", "neighborhood", "consent"];

export function firstInvalidField(errors: CustomerErrors): CustomerField | undefined {
  return CUSTOMER_FIELDS.find((field) => errors[field]);
}
