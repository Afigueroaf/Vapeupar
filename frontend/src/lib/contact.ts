/**
 * Fuente única de los datos de contacto de la tienda.
 *
 * Regla del proyecto: NO hay números por defecto. Si la variable de entorno
 * falta, el enlace devuelve `null` y el componente omite el CTA en lugar de
 * apuntar a un número inventado. Ver `docs/design-reset-inventory.md` §6.9.
 */

const rawWhatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.trim();
const rawPhone = process.env.NEXT_PUBLIC_STORE_PHONE?.trim();

/** Número de WhatsApp en formato E.164 sin `+` (ej. `573001234567`), o `null`. */
export const whatsappNumber: string | null = rawWhatsapp || null;

/** Teléfono de contacto en formato E.164 (ej. `+573001234567`), o `null`. */
export const storePhone: string | null = rawPhone || null;

/**
 * Construye un enlace de WhatsApp con el mensaje ya codificado.
 * Devuelve `null` si no hay número configurado.
 */
export function waLink(message: string): string | null {
  if (!whatsappNumber) return null;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** Enlace `tel:` del teléfono de la tienda, o `null`. */
export function telLink(): string | null {
  if (!storePhone) return null;
  return `tel:${storePhone}`;
}

/**
 * Formatea un número colombiano E.164 para mostrarlo: `+57 300 123 4567`.
 * Si el formato no es el esperado, devuelve el valor tal cual.
 */
export function formatPhoneCO(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) {
    const national = digits.slice(2);
    return `+57 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }
  return phone;
}
