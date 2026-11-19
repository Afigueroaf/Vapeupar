import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ¿La cabecera `Authorization` trae el secreto de revalidación? (plan A7.3)
 *
 * Función pura, aparte de la ruta, para poder probarla sin levantar Next
 * (la prueba vive en el backend, como la de paridad de esquemas).
 *
 * Se comparan los SHA-256 de ambos valores y no los valores: `timingSafeEqual`
 * exige longitudes iguales, y comparar primero la longitud filtraría cuánto
 * mide el secreto. Los hashes siempre miden 32 bytes.
 */
export function isRevalidateAuthorized(header: string | null | undefined, secret: string): boolean {
  if (!secret || !header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const given = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}
