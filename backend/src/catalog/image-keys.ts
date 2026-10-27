/**
 * Claves de imagen en el bucket del catálogo (ADR-002 §8). La base guarda la
 * clave, no la URL: la URL pública se compone con el dominio de CloudFront
 * (CDN_DOMAIN). La semilla y la subida desde la consola usan estas mismas
 * funciones para que el bucket quede ordenado como el inventario.
 */
export const imageKeys = {
  brandLogo: (brandSlug: string, extension: string) => `marcas/${brandSlug}/logo${extension}`,
  productLine: (productSlug: string, extension: string) => `productos/${productSlug}/linea${extension}`,
  variant: (productSlug: string, variantSlug: string, extension: string) =>
    `productos/${productSlug}/${variantSlug}${extension}`,
};

/** `WATERMELON-LEMON` o `Electric_Blue` -> `watermelon-lemon` / `electric-blue`. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `WATERMELON-LEMON` -> `Watermelon Lemon`; `LOVE-66` -> `Love 66`. */
export function humanize(value: string): string {
  return value
    .split(/[-_\s.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
