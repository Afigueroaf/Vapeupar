import os from "node:os";
import type { NextConfig } from "next";

/**
 * Direcciones IPv4 de esta máquina en la red local.
 *
 * POR QUÉ SE CALCULAN Y NO SE ESCRIBEN A MANO: la lista estaba fijada a
 * `192.168.1.46`, el router repartió otra dirección por DHCP y el resultado no
 * fue un error visible sino algo mucho peor de diagnosticar. Next rechaza el
 * handshake del websocket de HMR de un origen no autorizado, el runtime de
 * Turbopack no llega a arrancar y la página se queda como HTML estático: se ve
 * perfecta y no responde a nada. En el teléfono eso se manifiesta como botones
 * que no hacen nada y como una puerta +18 que no bloquea el scroll, porque el
 * efecto que lo bloquea nunca se ejecuta.
 *
 * Solo afecta a `next dev`: en producción no hay HMR ni esta comprobación.
 */
function localNetworkOrigins(): string[] {
  const addresses = new Set<string>();

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.add(entry.address);
      }
    }
  }

  return [...addresses];
}

const nextConfig: NextConfig = {
  // Permite acceder al servidor de desarrollo desde otros dispositivos de la
  // red Wi-Fi (ej. para probar el sitio en un teléfono). Si la IP cambia, basta
  // con reiniciar `next dev`: la lista se vuelve a calcular.
  allowedDevOrigins: localNetworkOrigins(),
  images: {
    // `next/image` **lanza error** con un host que no esté aquí, y al pintarse
    // la tarjeta en el servidor eso rompe la página entera, no solo la foto.
    // Las imágenes reales del catálogo vienen del CloudFront del entorno
    // (`CDN_DOMAIN` en el backend, el mismo valor aquí como público: es un
    // nombre de dominio, no un secreto). Sin la variable, el patrón no se
    // añade y solo se ven las de respaldo, que son locales.
    remotePatterns: [
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
