import type { ReactNode } from "react";
import { AgeVerificationModal } from "@/components/age-verification-modal";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { TouchCursor } from "@/components/touch-cursor";
import { WhatsappFab } from "@/components/whatsapp-fab";

/**
 * Armazón de las páginas públicas interiores (ficha, colección, nosotros).
 *
 * La puerta +18, el botón de WhatsApp y el cursor táctil van FUERA de todo
 * bloque `.vp-glitch`: son `position: fixed`, y un `filter` en un ancestro los
 * anclaría al contenido en vez de a la pantalla. La puerta va en cada página
 * porque se puede entrar directo desde un enlace compartido.
 *
 * La portada no lo usa: monta además la nube 3D y su propia rejilla.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AgeVerificationModal />
      <WhatsappFab />
      <TouchCursor />

      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
