import type { MetadataRoute } from "next";

/**
 * `robots.txt`, generado por Next.
 *
 * La consola `/admin` está protegida por Cognito, pero eso no impide que un
 * buscador indexe la pantalla de login y la ofrezca como resultado para
 * "vapeupar". `/dev-ui` es la galería interna del sistema de diseño: en
 * producción responde 404 (`app/dev-ui/page.tsx`), pero tampoco tiene por qué
 * rastrearse.
 *
 * Sin `host` ni `sitemap`: los dos llevan la URL pública, y esa todavía va a
 * cambiar dos veces (IP, nombre temporal de No-IP, dominio definitivo). Un
 * `robots.txt` que apunte a otro dominio es peor que uno que no apunte a nada.
 * Cuando el dominio sea el definitivo, se añade aquí el `sitemap`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/dev-ui"],
    },
  };
}
