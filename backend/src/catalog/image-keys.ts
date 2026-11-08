/**
 * Claves de imagen en el bucket del catálogo (ADR-002 §8). La base guarda la
 * clave, no la URL: la URL pública se compone con el dominio de CloudFront
 * (CDN_DOMAIN). La semilla y la subida desde la consola usan estas mismas
 * funciones para que el bucket quede ordenado como el inventario.
 */
/**
 * VERSIÓN EN LA CLAVE. Cada imagen subida desde la consola lleva un sufijo
 * (`mango-ice-m3k9x2ab.webp`) y la semilla no (`mango-ice.webp`).
 *
 * POR QUÉ: con la clave fija, reemplazar una imagen sobrescribía el objeto en
 * la misma URL, y entre el bucket y el visitante hay cachés que solo conocen
 * la URL. CloudFront se invalidaba, pero el optimizador de imágenes de Next
 * guarda cada URL 4 horas (`minimumCacheTTL`) y le dice al navegador que haga
 * lo mismo: la imagen nueva tardaba hasta 4 horas en verse en el sitio. Con
 * una URL nueva por carga, ninguna caché tiene nada viejo que servir y no hace
 * falta invalidar nada. Es la convención de cualquier CDN: si el contenido
 * cambia, cambia la URL.
 *
 * Lo que cuesta: la imagen anterior se queda en el bucket, huérfana. Ocupa
 * poco y no se sirve; si llega a importar, se limpian las claves que ninguna
 * fila referencia.
 */
function key(base: string, extension: string, version?: string): string {
  return `${base}${version ? `-${version}` : ''}${extension}`;
}

export const imageKeys = {
  brandLogo: (brandSlug: string, extension: string, version?: string) =>
    key(`marcas/${brandSlug}/logo`, extension, version),
  supplier: (supplierId: string, extension: string, version?: string) =>
    key(`proveedores/${supplierId}/logo`, extension, version),
  productLine: (productSlug: string, extension: string, version?: string) =>
    key(`productos/${productSlug}/linea`, extension, version),
  variant: (productSlug: string, variantSlug: string, extension: string, version?: string) =>
    key(`productos/${productSlug}/${variantSlug}`, extension, version),
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
