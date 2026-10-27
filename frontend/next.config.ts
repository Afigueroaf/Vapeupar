import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acceder al servidor de desarrollo desde otros dispositivos de la
  // red Wi-Fi (ej. para probar el sitio en un teléfono). Solo afecta a `next dev`;
  // no tiene efecto en producción (`next build` / `next start`).
  allowedDevOrigins: ["192.168.1.46"],
  images: {
    // `next/image` **lanza error** con un host que no esté aquí, y al pintarse
    // la tarjeta en el servidor eso rompe la página entera, no solo la foto.
    // Las imágenes reales del catálogo vienen del CloudFront del entorno
    // (`CDN_DOMAIN` en el backend, el mismo valor aquí como público: es un
    // nombre de dominio, no un secreto). Sin la variable, el patrón no se
    // añade y solo quedan las de respaldo.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(process.env.NEXT_PUBLIC_CDN_DOMAIN
        ? [
            {
              protocol: "https" as const,
              hostname: process.env.NEXT_PUBLIC_CDN_DOMAIN,
            },
          ]
        : []),
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
