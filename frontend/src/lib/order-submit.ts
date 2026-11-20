import type { CartLine } from "@/lib/cart";
import { DATA_POLICY_VERSION, type CustomerErrors, type CustomerValue } from "@/lib/order-form";

/**
 * Registro del pedido en el backend antes de abrir WhatsApp (ADR-003, parte 2).
 *
 * DOS MODOS, y el segundo es el de siempre:
 *
 * - **Registrado**: con `NEXT_PUBLIC_ORDERS_ENABLED=true`, el carrito pide
 *   nombre, celular, barrio y la autorización, hace `POST /api/orders` y abre
 *   WhatsApp con la referencia y el subtotal que devuelve el servidor.
 * - **Solo WhatsApp**: sin la variable (el valor por defecto), o si el servidor
 *   no contesta, el carrito hace exactamente lo de antes: referencia generada
 *   en el navegador, sin pedir datos, y WhatsApp.
 *
 * La variable pública y `ORDERS_ENABLED` del backend se encienden juntas: con
 * la pública encendida y el backend apagado, `POST /api/orders` es 404 y cada
 * pedido cae al modo solo WhatsApp tras pedir unos datos que no se guardan.
 *
 * Aquí solo hay lógica pura (cuerpo, respuesta, ajustes) y la llamada; el
 * cajón (`components/cart/cart-drawer.tsx`) decide qué pintar.
 */

/** `true` solo si la variable pública vale exactamente `true`. */
export function ordersEnabled(value: string | undefined = process.env.NEXT_PUBLIC_ORDERS_ENABLED): boolean {
  return value?.trim() === "true";
}

/** Igual que `MAX_LINES` del backend. */
export const MAX_ORDER_LINES = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Si el carrito se puede registrar. El backend pide una variante por línea:
 * una línea sin variante (los productos de respaldo, que se pintan cuando la
 * API no responde) o un carrito de más de 20 líneas no se pueden registrar, y
 * ese pedido va por el camino de siempre.
 */
export function canRegister(lines: CartLine[]): boolean {
  return (
    lines.length > 0 &&
    lines.length <= MAX_ORDER_LINES &&
    lines.every((line) => line.variantId !== null && UUID.test(line.variantId)) &&
    new Set(lines.map((line) => line.variantId)).size === lines.length
  );
}

export interface OrderBody {
  submissionKey: string;
  customer: CustomerValue;
  consent: { accepted: true; policyVersion: string };
  lines: { variantId: string; quantity: number }[];
}

/**
 * Cuerpo de `POST /api/orders`. **Sin precio**: lo pone el catálogo en el
 * servidor, y el esquema estricto rechaza un campo de más.
 */
export function buildOrderBody(lines: CartLine[], customer: CustomerValue, submissionKey: string): OrderBody {
  return {
    submissionKey,
    customer: { name: customer.name, phone: customer.phone, neighborhood: customer.neighborhood },
    consent: { accepted: true, policyVersion: DATA_POLICY_VERSION },
    lines: lines.map((line) => ({ variantId: line.variantId as string, quantity: line.quantity })),
  };
}

/**
 * Huella de lo que se envía, sin la clave. La `submissionKey` dura lo que
 * dure esta huella: el mismo envío repetido (doble toque, reintento tras un
 * corte) reutiliza la clave y el backend devuelve el mismo pedido; cambiar un
 * dato o una cantidad es otro envío y estrena clave, porque la misma clave con
 * otros datos es `409 CONFLICT`.
 */
export function bodyFingerprint(body: Omit<OrderBody, "submissionKey">): string {
  return JSON.stringify([body.customer, body.consent.policyVersion, body.lines]);
}

export interface SubmissionKeyState {
  key: string;
  fingerprint: string;
}

/** Devuelve la clave a usar para esta huella: la misma si no cambió, una nueva si sí. */
export function nextSubmissionKey(
  current: SubmissionKeyState | null,
  fingerprint: string,
  newKey: () => string = () => crypto.randomUUID(),
): SubmissionKeyState {
  return current && current.fingerprint === fingerprint ? current : { key: newKey(), fingerprint };
}

export interface LineIssue {
  variantId: string;
  reason: "unavailable" | "insufficient_stock";
  available?: number;
}

export type OrderOutcome =
  /** Registrado (o repetido con la misma clave): referencia y subtotal del servidor. */
  | { kind: "created"; reference: string; subtotal: number }
  /** Alguna línea no se puede pedir o no alcanza el disponible. Nada se creó. */
  | { kind: "unavailable"; lines: LineIssue[] }
  /** La clave ya se usó con otros datos: hay que estrenar una. */
  | { kind: "conflict" }
  /** Límite de pedidos de esta conexión. */
  | { kind: "rate-limited"; message: string }
  /** El backend rechazó un dato: errores por campo cuando se pueden señalar. */
  | { kind: "invalid"; fields: CustomerErrors; message: string; policyChanged: boolean }
  /** No hay registro posible (apagado, caído, sin red): se usa el camino de siempre. */
  | { kind: "fallback"; cause: "network" | "disabled" | "server" };

const FIELD_OF: Record<string, keyof CustomerErrors> = {
  "customer.name": "name",
  "customer.phone": "phone",
  "customer.neighborhood": "neighborhood",
  "consent.accepted": "consent",
  "consent.policyVersion": "consent",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseIssues(value: unknown): LineIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): LineIssue[] => {
    if (!isRecord(item) || typeof item.variantId !== "string") return [];
    const reason = item.reason === "insufficient_stock" ? "insufficient_stock" : "unavailable";
    const available =
      typeof item.available === "number" && Number.isInteger(item.available) && item.available >= 0
        ? item.available
        : undefined;
    return [{ variantId: item.variantId, reason, ...(available !== undefined && { available }) }];
  });
}

export const RATE_LIMIT_FALLBACK =
  "Demasiados pedidos seguidos desde esta conexión. Espera unos minutos o envíalo solo por WhatsApp.";

/**
 * Traduce la respuesta de `POST /api/orders`. `body` es el JSON ya leído, o
 * `null` si no venía en JSON (el 429 del limitador sí lo trae, un 502 del
 * proxy no).
 */
export function interpretOrderResponse(status: number, body: unknown): OrderOutcome {
  const envelope = isRecord(body) ? body : {};

  if (status === 200 || status === 201) {
    const data = isRecord(envelope.data) ? envelope.data : {};
    if (
      envelope.success === true &&
      typeof data.reference === "string" &&
      /^VP-[A-Z0-9]{6}$/.test(data.reference) &&
      typeof data.subtotal === "number" &&
      Number.isFinite(data.subtotal)
    ) {
      return { kind: "created", reference: data.reference, subtotal: data.subtotal };
    }
    // Un 200 que no es lo que esperamos (un proxy, una página de error) no prueba nada.
    return { kind: "fallback", cause: "server" };
  }

  if (status === 409 && envelope.code === "UNAVAILABLE") {
    const lines = parseIssues(envelope.lines);
    if (lines.length > 0) return { kind: "unavailable", lines };
  }
  if (status === 409 && envelope.code === "CONFLICT") return { kind: "conflict" };

  if (status === 429) {
    const message = typeof envelope.message === "string" && envelope.message ? envelope.message : RATE_LIMIT_FALLBACK;
    return { kind: "rate-limited", message };
  }

  if (status === 400) {
    const fields: CustomerErrors = {};
    let policyChanged = false;
    let other: string | undefined;
    for (const issue of Array.isArray(envelope.errors) ? envelope.errors : []) {
      if (!isRecord(issue) || typeof issue.field !== "string" || typeof issue.message !== "string") continue;
      if (issue.field === "consent.policyVersion") policyChanged = true;
      const field = FIELD_OF[issue.field];
      if (field && !fields[field]) fields[field] = issue.message;
      else if (!field && !other) other = issue.message;
    }
    const message = policyChanged
      ? "La política de datos cambió desde que abriste la página. Recárgala y vuelve a enviar."
      : (other ?? (typeof envelope.message === "string" ? envelope.message : "Revisa los datos del pedido."));
    return { kind: "invalid", fields, message, policyChanged };
  }

  // 404: la ruta no está montada (ORDERS_ENABLED apagado en el backend).
  if (status === 404) return { kind: "fallback", cause: "disabled" };
  return { kind: "fallback", cause: "server" };
}

/** Lo que espera el cajón antes de dar el servidor por caído. */
export const SUBMIT_TIMEOUT_MS = 8000;

/** Base de la API para el navegador: `/api` en producción, absoluta en local. */
export function ordersUrl(base: string = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"): string {
  return `${base.replace(/\/+$/, "")}/orders`;
}

/**
 * Envía el pedido. Nunca lanza: cualquier fallo de red o de tiempo es
 * `fallback`, y el cajón sigue por WhatsApp como siempre.
 */
export async function submitOrder(
  body: OrderBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; url?: string } = {},
): Promise<OrderOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? SUBMIT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(options.url ?? ordersUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Sin cookies: es una ruta pública y no hay sesión que mandar.
      credentials: "omit",
    });
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await response.text());
    } catch {
      parsed = null;
    }
    return interpretOrderResponse(response.status, parsed);
  } catch {
    return { kind: "fallback", cause: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export interface LineAdjustment {
  key: string;
  /** Nuevo máximo de la línea: el disponible que dio el servidor. 0 la quita. */
  max: number;
  /** Texto para la línea del cajón. */
  message: string;
}

/**
 * Qué hacer con cada línea señalada en un `409 UNAVAILABLE`: limitarla al
 * disponible o quitarla. Las líneas que el servidor no nombra no se tocan.
 */
export function adjustmentsFor(lines: CartLine[], issues: LineIssue[]): LineAdjustment[] {
  return issues.flatMap((issue): LineAdjustment[] => {
    const line = lines.find((l) => l.variantId === issue.variantId);
    if (!line) return [];
    if (issue.reason === "insufficient_stock" && issue.available !== undefined && issue.available > 0) {
      const units = issue.available === 1 ? "queda 1" : `quedan ${issue.available}`;
      return [{ key: line.key, max: issue.available, message: `Solo ${units}: ajustamos la cantidad.` }];
    }
    return [
      {
        key: line.key,
        max: 0,
        message:
          issue.reason === "insufficient_stock"
            ? "Se agotó: la quitamos del pedido."
            : "Ya no está disponible: la quitamos del pedido.",
      },
    ];
  });
}
