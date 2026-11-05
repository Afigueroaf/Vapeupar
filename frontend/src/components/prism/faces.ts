import type { Product } from "@/types/product";

/**
 * De productos del catálogo a caras del prisma.
 *
 * Sin `"use client"`: son funciones puras y las usan tanto el envoltorio de
 * cliente como, llegado el caso, un componente de servidor que quiera preparar
 * las caras antes de pasarlas.
 */

export interface PrismFace {
  /** URL de la imagen que se pinta en la cara. */
  image: string;
  /** Rótulo que aparece al señalar o centrar la cara. */
  title: string;
}

/** Ancho al que se pide la imagen. Tiene que estar en `images.deviceSizes`. */
const FACE_IMAGE_WIDTH = 640;

/** Calidad. Next 16 solo sirve las que figuran en `images.qualities` (por defecto, 75). */
const FACE_IMAGE_QUALITY = 75;

/**
 * Pasa la imagen por el optimizador de Next en lugar de pedirla a su origen.
 *
 * DOS MOTIVOS, y el primero es el que importa:
 *
 * 1. CORS. `TextureLoader` sube la imagen a una textura WebGL, y para eso el
 *    navegador exige que el origen la sirva con `Access-Control-Allow-Origin`.
 *    Las fotos del catálogo vienen de CloudFront; si deja
 *    de mandar esa cabecera, la cara se queda en negro y el fallo aparece en
 *    producción, no aquí. Por `/_next/image` la imagen es del mismo origen y
 *    el problema no existe.
 * 2. Peso. Llega ya reescalada a `FACE_IMAGE_WIDTH` y en WebP o AVIF, en lugar
 *    del original a tamaño completo.
 *
 * El host de origen tiene que estar en `images.remotePatterns` de
 * `next.config.ts` —si no, el optimizador devuelve 400—, que es la misma
 * condición que ya cumplen las fotos para `next/image`.
 */
export function optimizedImageUrl(src: string): string {
  // Ya son locales al documento: el optimizador no las acepta y no hace falta.
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;

  const params = new URLSearchParams({
    url: src,
    w: String(FACE_IMAGE_WIDTH),
    q: String(FACE_IMAGE_QUALITY),
  });
  return `/_next/image?${params.toString()}`;
}

/**
 * Elige los productos que van en el prisma y rellena las `sides` caras.
 *
 * MANDA `showcase`, que es la casilla que se marca en la pantalla «Vitrina» de
 * la consola. Si no hay ninguna marcada, cae al catálogo entero: más vale una
 * vitrina con lo que haya que un hueco negro en la portada recién desplegada,
 * cuando todavía nadie ha elegido nada.
 *
 * No se usa `featured`: ese marca merchandising del catálogo y llegó a decidir
 * la vitrina solo porque era el único campo que había. Son cosas distintas y
 * ahora tienen columnas distintas.
 *
 * Si salen menos productos que caras, se repiten en ciclo: es preferible un
 * prisma completo con alguna imagen repetida a uno con huecos en negro. Si
 * salen más, las que pasan de `sides` **no se ven**; de eso avisa la consola,
 * que es donde se puede hacer algo al respecto.
 *
 * Devuelve el array vacío cuando no hay ninguna imagen utilizable, y entonces
 * el componente no llega a montar el lienzo.
 */
export function facesFromProducts(products: Product[], sides: number): PrismFace[] {
  const withImage = products.filter((product) => Boolean(product.imageUrl));
  const chosen = withImage.filter((product) => product.showcase);
  const source = chosen.length > 0 ? chosen : withImage;

  if (source.length === 0) return [];

  return Array.from({ length: sides }, (_, index) => {
    const product = source[index % source.length];
    return {
      image: optimizedImageUrl(product.imageUrl),
      title: product.name,
    };
  });
}
