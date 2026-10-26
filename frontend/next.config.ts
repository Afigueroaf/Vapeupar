import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acceder al servidor de desarrollo desde otros dispositivos de la
  // red Wi-Fi (ej. para probar el sitio en un teléfono). Solo afecta a `next dev`;
  // no tiene efecto en producción (`next build` / `next start`).
  allowedDevOrigins: ["192.168.1.46"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
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
