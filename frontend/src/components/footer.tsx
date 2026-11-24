import Link from "next/link";
import { ContactView } from "@/components/contact-view";
import { PixelLabel } from "@/components/ui/pixel-label";
import { getContent } from "@/lib/content";
import { ordersEnabled } from "@/lib/order-submit";

/**
 * Pie de página del sistema VP (fase V6).
 *
 * El **texto** de la advertencia legal de salud (Ley 1335 de 2009) es
 * requisito legal y va palabra por palabra: no se recorta ni se reformula
 * (`docs/design-reset-inventory.md` §9.4). Lo que se rehace es su
 * presentación, que estaba en una caja `amber-500/5` con un icono en
 * círculo, fuera de la paleta (§2.5) y del lenguaje de formas (§3.6).
 *
 * El bloque sigue abriendo el footer, como antes, pero su texto sube de 12px
 * a la escala del sistema: una advertencia legal en letra pequeña cumple de
 * forma dudosa.
 */

const COL_HEADING = "text-[0.9375rem] font-bold uppercase tracking-[0.06em]";

/**
 * Texto de marca, horario y servicio: clave `contact` del contenido (A7.4),
 * pintado por `ContactView`, que la consola reutiliza para la vista previa.
 */
export async function Footer() {
  const contact = await getContent("contact");
  const currentYear = new Date().getFullYear();

  return (
    <footer className="reveal-footer vp-glitch border-t-2 border-line pb-10 pt-12">
      {/* Obligatory health and legal warning for nicotine products */}
      <div className="mx-auto max-w-vp px-inline">
        <div className="scroll-reveal reveal-scale border-2 border-accent bg-surface p-5 rounded-vp sm:p-6">
          <PixelLabel variant="violet">[ +18 ]</PixelLabel>

          <h3 className={`mt-4 ${COL_HEADING}`}>Advertencia legal y de salud</h3>

          <p className="mt-3 max-w-4xl text-base leading-relaxed">
            La venta de vaporizadores, cigarrillos electrónicos y líquidos con o sin nicotina está estrictamente prohibida para menores de 18 años (Ley 1335 de 2009). La nicotina es una sustancia altamente adictiva. No recomendado para mujeres embarazadas ni personas con afecciones cardiovasculares. Exige tu documento de identidad físico en la entrega.
          </p>
        </div>
      </div>

      {/* Marca, horario, atención y enlaces: la misma vista que la previa de /admin/content. */}
      <ContactView contact={contact} />

      <div className="scroll-reveal reveal-scale mx-auto mt-6 flex max-w-vp flex-col items-center justify-between gap-3 px-inline text-sm text-muted sm:flex-row">
        <p>© {currentYear} Vapeupar. Todos los derechos reservados. Valledupar, Colombia.</p>
        <p>Solo para mayores de 18 años (+18). Consume con responsabilidad.</p>
        {/* Solo cuando el carrito puede pedir datos: antes, la política no aplica a nada. */}
        {ordersEnabled() && (
          <Link
            href="/privacidad"
            className="inline-flex min-h-[44px] items-center underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Política de datos
          </Link>
        )}
      </div>
    </footer>
  );
}
