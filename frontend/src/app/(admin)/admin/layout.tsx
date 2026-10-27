import type { Metadata } from "next";

/**
 * Área de la consola (plan A5). Grupo de rutas propio: sin navbar pública, sin
 * footer, sin verificación de edad y sin `.vp-glitch`. Comparte con el sitio el
 * layout raíz —tipografías y tokens VP— y nada más.
 */
export const metadata: Metadata = {
  title: "Consola | Vapeupar",
  // Es una herramienta interna: no se indexa ni se sigue, aunque la proteja el
  // backend. Un buscador no debería listar siquiera la pantalla de acceso.
  robots: { index: false, follow: false },
};

export default function AdminAreaLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col">{children}</div>;
}
