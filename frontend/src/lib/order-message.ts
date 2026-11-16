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
 * cliente mande dos seguidos o vuelva días después. No se guarda en ningún
 * sitio; es solo una etiqueta para la conversación.
 */

const KIND_LABEL = { flavor: "Sabor", color: "Color" } as const;

/** Alfabeto sin 0/O ni 1/I/L, que se confunden al dictarlo o leerlo. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function orderReference(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `VP-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

export function orderMessage(lines: CartLine[], subtotal: number, reference: string): string {
  const items = lines.map((line) => {
    const variant =
      line.variantName && line.variantKind
        ? ` — ${KIND_LABEL[line.variantKind]}: ${line.variantName}`
        : "";
    return `• ${line.quantity} × *${line.name}*${variant} — ${formatPriceCOP(line.price * line.quantity)}`;
  });

  return [
    `Hola Vapeupar! Quiero hacer este pedido (*${reference}*):`,
    "",
    ...items,
    "",
    `*Subtotal: ${formatPriceCOP(subtotal)}*`,
    "Pago contra entrega.",
    "¿Me confirman disponibilidad y el valor del domicilio en Valledupar?",
  ].join("\n");
}
