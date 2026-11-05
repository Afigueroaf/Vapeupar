/**
 * URL pública de una clave del bucket del catálogo.
 *
 * La base guarda la clave, no la URL: el dominio es el CloudFront del entorno
 * (`NEXT_PUBLIC_CDN_DOMAIN`, el mismo valor que `CDN_DOMAIN` en el backend; es
 * un nombre de dominio, no un secreto). Sin dominio o sin clave no hay URL, y
 * quien llama decide qué pintar en su lugar: `next/image` falla con `src=""`.
 */
export function cdnImageUrl(key: string | null | undefined): string | null {
  const domain = process.env.NEXT_PUBLIC_CDN_DOMAIN;
  if (!domain || !key) return null;
  return `https://${domain}/${key.replace(/^\/+/, "")}`;
}
