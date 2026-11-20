import type { CartLine } from "@/lib/cart";
import { formatPriceCOP } from "@/lib/utils";

/**
 * Mensaje de pedido que el carrito envía por WhatsApp.
 *
 * Es lo que la tienda recibe y con lo que prepara el pedido, así que se
 * escribe para quien lo lee en el teléfono: una línea por artículo con
 * cantidad, línea y sabor, el subtotal y lo que falta por confirmar. El
 * formato de WhatsApp (`*negrita*`) marca lo que hay que mirar primero.
 *
 * LA REFERENCIA (`VP-XXXXXX`) es lo que el comercio electrónico llama número de
 * pedido: permite que cliente y tienda hablen del mismo pedido aunque el
 * cliente mande dos seguidos o vuelva días después. Hay dos orígenes
 * (ADR-003, `lib/order-submit.ts`):
 *
 * - **Pedido registrado**: la genera el servidor al guardar el pedido y es la
 *   que la consola busca en `/admin/orders` y escribe en el lote de cada
 *   movimiento al confirmar. `registeredOrderMessage`.
 * - **Solo WhatsApp** (pedidos apagados o servidor caído): la genera el
 *   navegador con `orderReference()` y no se guarda en ningún sitio; es solo
 *   una etiqueta para la conversación. `orderMessage`, el de siempre.
 */

const KIND_LABEL = { flavor: "Sabor", color: "Color" } as const;

/** Alfabeto sin 0/O ni 1/I/L, que se confunden al dictarlo o leerlo. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function orderReference(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `VP-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

function itemLines(lines: CartLine[], withPrices: boolean): string[] {
  return lines.map((line) => {
    const variant =
      line.variantName && line.variantKind
        ? ` — ${KIND_LABEL[line.variantKind]}: ${line.variantName}`
        : "";
    const price = withPrices ? ` — ${formatPriceCOP(line.price * line.quantity)}` : "";
    return `• ${line.quantity} × *${line.name}*${variant}${price}`;
  });
}

const CLOSING = [
  "Pago contra entrega.",
  "¿Me confirman disponibilidad y el valor del domicilio en Valledupar?",
];

/** Mensaje del modo solo WhatsApp: referencia del navegador y precios vistos al añadir. */
export function orderMessage(lines: CartLine[], subtotal: number, reference: string): string {
  return [
    `Hola Vapeupar! Quiero hacer este pedido (*${reference}*):`,
    "",
    ...itemLines(lines, true),
    "",
    `*Subtotal: ${formatPriceCOP(subtotal)}*`,
    ...CLOSING,
  ].join("\n");
}

/**
 * Mensaje de un pedido ya registrado: referencia y subtotal **del servidor**,
 * que los toma del catálogo. Si un precio cambió desde que el cliente añadió
 * la línea, los importes del carrito ya no suman el subtotal y se omiten: un
 * mensaje con cuentas que no cuadran confunde más de lo que ayuda. No lleva
 * nombre, celular ni barrio: ya están en el pedido y el chat no los necesita.
 */
export function registeredOrderMessage(
  lines: CartLine[],
  order: { reference: string; subtotal: number },
): string {
  const cartSubtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  return [
    `Hola Vapeupar! Acabo de hacer el pedido *${order.reference}* en la web:`,
    "",
    ...itemLines(lines, cartSubtotal === order.subtotal),
    "",
    `*Subtotal: ${formatPriceCOP(order.subtotal)}*`,
    ...CLOSING,
  ].join("\n");
}
