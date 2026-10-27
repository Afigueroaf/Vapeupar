import type { MetadataRoute } from "next";

/**
 * Manifiesto de aplicación web.
 *
 * Existe sobre todo por el icono **maskable**, que §4.3 del inventario de diseño
 * pedía y que solo tiene sentido declarado aquí: Android recorta el icono a la
 * forma del lanzador y únicamente respeta el 80 % central, así que el monograma
 * va con más aire en esa variante que en las demás.
 *
 * Los colores son los únicos literales del frontend fuera de `globals.css`: un
 * manifiesto es JSON y no puede leer los tokens. Equivalen a `--color-vp-black`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vapeupar | Vaporizadores en Valledupar",
    short_name: "Vapeupar",
    description:
      "Catálogo de vaporizadores desechables, pods recargables, sales de nicotina y accesorios en Valledupar.",
    start_url: "/",
    display: "standalone",
    background_color: "#080808",
    theme_color: "#080808",
    lang: "es-CO",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
