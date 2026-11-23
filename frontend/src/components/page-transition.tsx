"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";

/**
 * Fundido suave entre páginas (View Transitions de React 19.3).
 *
 * ENVUELVE LA PÁGINA ENTERA, no solo el `<main>`: React únicamente anima la
 * entrada o salida de un `<ViewTransition>` que esté por encima de cualquier
 * elemento HTML del bloque que se inserta o se retira. Metido dentro del
 * `<main>` —que es nuevo en cada página— no se animaba nunca (comprobado con
 * páginas de prueba). Lo que NO debe moverse —la barra y el botón de
 * WhatsApp— lleva su propio `view-transition-name` y su animación se anula en
 * `globals.css` (§TRANSICIONES DE PÁGINA), donde está también el fundido.
 *
 * La `key` por ruta asegura un par salida/entrada en cada navegación, también
 * de una ficha a otra (misma ruta, otro `slug`).
 *
 * En Next 16.4 no hace falta ninguna opción en `next.config.ts`: el flag
 * `experimental.viewTransition` se retiró en 16.3 y las transiciones vienen
 * activas. Un navegador sin View Transitions cambia de página al instante,
 * como antes.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <ViewTransition key={pathname} enter="vp-page-in" exit="vp-page-out" default="none">
      {children}
    </ViewTransition>
  );
}
