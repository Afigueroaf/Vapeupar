import type { MetadataRoute } from "next";
import { VP_BLACK } from "@/lib/brand";

/**
 * Manifiesto de aplicación web.
 *
 * Existe sobre todo por el icono **maskable**, que §4.3 del inventario de diseño
 * pedía y que solo tiene sentido declarado aquí: Android recorta el icono a la
 * forma del lanzador y únicamente respeta el 80 % central, así que el monograma
 * va con más aire en esa variante que en las demás.
 *
 * Un manifiesto es JSON y no puede leer un token de CSS, así que el color llega
 * de `lib/brand.ts`, que es donde vive el literal compartido con la etiqueta
 * `theme-color` del documento. Equivale a `--color-vp-black`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vapeupar | Vaporizadores en Valledupar",
    short_name: "Vapeupar",
    description:
      "Catálogo de vaporizadores desechables, pods recargables, sales de nicotina y accesorios en Valledupar.",
    start_url: "/",
    display: "standalone",
    background_color: VP_BLACK,
    theme_color: VP_BLACK,
    lang: "es-CO",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
