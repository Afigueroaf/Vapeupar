import type { AdminRole, Order, OrderLineIssue, OrderStatus, OrderTransition } from "@/types/admin";

/**
 * Lógica pura de la pantalla de pedidos de la consola (`/admin/orders`,
 * ADR-003): etiquetas, filtros de fecha, el cuerpo de «Confirmar», qué
 * acciones caben en cada estado y los mensajes tras cada una. Vive aquí, y no
 * en el componente, para poder probarla sin React.
 */

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recibido",
  confirmed: "Confirmado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export const STATUS_ORDER: OrderStatus[] = ["received", "confirmed", "delivered", "cancelled"];

/** Tope del backend para precios y domicilio: frena un cero de más. */
export const MAX_PESOS = 10_000_000;
export const MAX_DELIVERY_FEE = 1_000_000;
export const MAX_CANCEL_REASON = 300;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** La tienda está en Valledupar: Colombia es UTC-5 todo el año, sin horario de verano. */
const COLOMBIA_OFFSET = "-05:00";

/**
 * Un día del selector (`YYYY-MM-DD`) como instante ISO, **en hora de
 * Colombia** sea cual sea la zona del equipo: el principio del día para
 * «desde» y el último milisegundo para «hasta». El backend compara
 * `createdAt` con `gte`/`lte`, y mandar el día pelado lo leería como
 * medianoche UTC: «hasta hoy» dejaría fuera los pedidos de la tarde.
 */
export function dayBoundary(day: string, edge: "start" | "end"): string | undefined {
  const match = DAY.exec(day);
  if (!match) return undefined;
  const time = edge === "start" ? "00:00:00.000" : "23:59:59.999";
  const date = new Date(`${day}T${time}${COLOMBIA_OFFSET}`);
  // `new Date` acepta el 31 de febrero y lo pasa a marzo: se exige el mismo día.
  if (Number.isNaN(date.getTime())) return undefined;
  const local = new Date(date.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
  return local === day ? date.toISOString() : undefined;
}

/**
 * Pesos escritos a mano: «45000», «45.000» o «45 000». Devuelve el entero, o
 * `null` si no es un número de pesos válido (decimales, negativos, letras).
 */
export function parsePesos(text: string, max = MAX_PESOS): number | null {
  const compact = text.trim().replace(/[.\s]/g, "");
  if (!/^\d{1,9}$/.test(compact)) return null;
  const value = Number(compact);
  return value <= max ? value : null;
}

export interface ConfirmDraft {
  deliveryFee: string;
  /** Precio cobrado por variante, como texto del campo. */
  prices: Record<string, string>;
}

export function initialConfirmDraft(order: Order): ConfirmDraft {
  return {
    deliveryFee: "",
    prices: Object.fromEntries(order.lines.map((line) => [line.variantId, String(line.listPrice)])),
  };
}

export type ConfirmErrors = { deliveryFee?: string; prices?: Record<string, string> };

/**
 * Cuerpo de `POST /orders/:id/confirm`. Solo viajan las líneas cuyo precio
 * cambió: así un operator, que no puede cobrar otro precio que el de
 * catálogo, manda solo el domicilio, y el backend no ve descuentos que no
 * existen. Para un operator los precios del borrador se ignoran.
 */
export function buildConfirmInput(
  order: Order,
  draft: ConfirmDraft,
  role: AdminRole,
):
  | { ok: true; input: { deliveryFee: number; lines?: { variantId: string; unitPrice: number }[] } }
  | { ok: false; errors: ConfirmErrors } {
  const errors: ConfirmErrors = {};
  const deliveryFee = parsePesos(draft.deliveryFee, MAX_DELIVERY_FEE);
  if (draft.deliveryFee.trim() === "") errors.deliveryFee = "Escribe el domicilio (0 si no se cobra)";
  else if (deliveryFee === null) errors.deliveryFee = "Pesos enteros, sin decimales";

  const lines: { variantId: string; unitPrice: number }[] = [];
  if (role === "owner") {
    for (const line of order.lines) {
      const text = draft.prices[line.variantId] ?? String(line.listPrice);
      const price = parsePesos(text);
      if (price === null) {
        errors.prices = { ...errors.prices, [line.variantId]: "Pesos enteros, sin decimales" };
      } else if (price !== line.listPrice) {
        lines.push({ variantId: line.variantId, unitPrice: price });
      }
    }
  }

  if (errors.deliveryFee || errors.prices || deliveryFee === null) return { ok: false, errors };
  return { ok: true, input: lines.length > 0 ? { deliveryFee, lines } : { deliveryFee } };
}

/** Total que se cobrará con el borrador actual, para mostrarlo antes de confirmar. */
export function draftTotal(order: Order, draft: ConfirmDraft, role: AdminRole): number | null {
  const fee = draft.deliveryFee.trim() === "" ? 0 : parsePesos(draft.deliveryFee, MAX_DELIVERY_FEE);
  if (fee === null) return null;
  let sum = fee;
  for (const line of order.lines) {
    const price = role === "owner" ? parsePesos(draft.prices[line.variantId] ?? String(line.listPrice)) : line.listPrice;
    if (price === null) return null;
    sum += price * line.quantity;
  }
  return sum;
}

export interface OrderActions {
  confirm: boolean;
  deliver: boolean;
  cancel: boolean;
  /** Solo owner, solo cerrados y con datos que borrar. */
  anonymize: boolean;
}

export function orderActions(order: Order, role: AdminRole): OrderActions {
  const closed = order.status === "delivered" || order.status === "cancelled";
  return {
    confirm: order.status === "received",
    deliver: order.status === "confirmed",
    cancel: order.status === "received" || order.status === "confirmed",
    anonymize: role === "owner" && closed && order.anonymizedAt === null,
  };
}

export type OrderAction = "confirm" | "deliver" | "cancel" | "anonymize";

const DONE: Record<OrderAction, string> = {
  confirm: "confirmado: se descontó el stock",
  deliver: "entregado",
  cancel: "cancelado",
  anonymize: "anonimizado: se borraron nombre, celular y barrio",
};

/**
 * Mensaje tras una acción. Confirmar y cancelar un confirmado mueven stock:
 * si el aviso al sitio falló (`revalidated: false`), el disponible público
 * tarda hasta 60 s en reflejarlo, y se dice.
 */
export function transitionMessage(action: OrderAction, before: OrderStatus, result: OrderTransition): string {
  const ref = result.order.reference;
  if (result.replayed) return `El pedido ${ref} ya estaba ${STATUS_LABEL[result.order.status].toLowerCase()}: no se repitió nada.`;
  const what =
    action === "cancel" && before === "confirmed" ? "cancelado: se devolvió el stock" : DONE[action];
  const movesStock = action === "confirm" || (action === "cancel" && before === "confirmed");
  const tail = movesStock ? (result.revalidated ? " El sitio ya lo refleja." : " Se verá en el sitio en ≤60 s.") : "";
  return `Pedido ${ref} ${what}.${tail}`;
}

/** Las líneas de un `409` (sin stock o no disponibles), con nombre y lo que falta. */
export function describeIssues(order: Order, issues: OrderLineIssue[]): string[] {
  return issues.map((issue) => {
    const line = order.lines.find((l) => l.variantId === issue.variantId);
    const name = line ? `${line.productName} · ${line.variantName}` : "Variante desconocida";
    if (issue.reason === "insufficient_stock") {
      const available = issue.available ?? 0;
      return line
        ? `${name}: pide ${line.quantity}, hay ${available} disponible${available === 1 ? "" : "s"}`
        : `${name}: hay ${available} disponible${available === 1 ? "" : "s"}`;
    }
    return `${name}: ya no se puede vender`;
  });
}

/** Enlace a WhatsApp del cliente (`+573…` → `wa.me/573…`), o `null` sin datos. */
export function customerWhatsApp(order: Order): string | null {
  const digits = order.customer?.phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}
