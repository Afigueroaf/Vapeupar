import Image from "next/image";
import { PixelLabel } from "@/components/ui/pixel-label";
import { formatPhoneCO, storePhone, telLink } from "@/lib/contact";

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
const COL_LIST = "mt-4 space-y-2 text-base text-muted";
const LINK = "transition-colors hover:text-action";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const phoneHref = telLink();

  return (
    <footer className="vp-glitch border-t-2 border-line pb-10 pt-12">
      {/* Obligatory health and legal warning for nicotine products */}
      <div className="mx-auto max-w-vp px-4 sm:px-6 xl:px-10">
        <div className="border-2 border-accent bg-surface p-5 rounded-vp sm:p-6">
          <PixelLabel variant="violet">[ +18 ]</PixelLabel>

          <h3 className={`mt-4 ${COL_HEADING}`}>Advertencia legal y de salud</h3>

          <p className="mt-3 max-w-4xl text-base leading-relaxed">
            La venta de vaporizadores, cigarrillos electrónicos y líquidos con o sin nicotina está estrictamente prohibida para menores de 18 años (Ley 1335 de 2009). La nicotina es una sustancia altamente adictiva. No recomendado para mujeres embarazadas ni personas con afecciones cardiovasculares. Exige tu documento de identidad físico en la entrega.
          </p>
        </div>
      </div>

      <div className="mx-auto mt-12 grid max-w-vp grid-cols-1 gap-10 border-b-2 border-muted px-4 pb-10 sm:px-6 md:grid-cols-4 xl:px-10">
        {/* Col 1: Brand Info — destino del enlace "Nosotros" del navbar */}
        <div id="nosotros" className="scroll-mt-24">
          <Image
            src="/logo-detalle.svg"
            alt="Vapeupar"
            width={1319}
            height={786}
            className="h-9 w-auto"
          />

          <p className="mt-4 text-base leading-relaxed text-muted">
            Tu tienda especializada en Valledupar para vaporizadores desechables, pods recargables, e-líquidos premium y accesorios originales.
          </p>
        </div>

        {/* Col 2: Location & Hours */}
        <div>
          <h3 className={COL_HEADING}>Ubicación y cobertura</h3>
          <ul className={COL_LIST}>
            <li>Valledupar, Cesar, Colombia</li>
            <li>Lunes a Sábado: 10:00 AM - 10:00 PM</li>
            <li>Domingos: 12:00 PM - 8:00 PM</li>
          </ul>
        </div>

        {/* Col 3: Customer Care & Ordering */}
        <div>
          <h3 className={COL_HEADING}>Atención al cliente</h3>
          <ul className={COL_LIST}>
            {/* Sin teléfono configurado, la fila no se inventa (decisión V0.3) */}
            {phoneHref && storePhone && (
              <li>
                <a href={phoneHref} className={`${LINK} underline decoration-2 underline-offset-4`}>
                  Llamadas: {formatPhoneCO(storePhone)}
                </a>
              </li>
            )}
            <li>Envíos locales express en moto</li>
            <li>Envíos a todo el departamento del Cesar</li>
            <li>Métodos: Nequi, Daviplata, Contra Entrega</li>
          </ul>
        </div>

        {/* Col 4: Quick Links */}
        <div>
          <h3 className={COL_HEADING}>Categorías rápidas</h3>
          <ul className={COL_LIST}>
            <li><a href="#desechables" className={LINK}>Desechables 10k Puffs</a></li>
            <li><a href="#pods" className={LINK}>Pods Recargables</a></li>
            <li><a href="#liquidos" className={LINK}>Sales de Nicotina</a></li>
            <li><a href="#faq" className={LINK}>Preguntas Frecuentes</a></li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-6 flex max-w-vp flex-col items-center justify-between gap-3 px-4 text-sm text-muted sm:flex-row sm:px-6 xl:px-10">
        <p>© {currentYear} Vapeupar. Todos los derechos reservados. Valledupar, Colombia.</p>
        <p>Solo para mayores de 18 años (+18). Consume con responsabilidad.</p>
      </div>
    </footer>
  );
}
