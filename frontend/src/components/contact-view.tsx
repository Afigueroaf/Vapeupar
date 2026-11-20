import Image from "next/image";
import Link from "next/link";
import { COLLECTIONS } from "@/lib/collections";
import { formatPhoneCO, storePhone, telLink } from "@/lib/contact";
import type { ContactContent } from "@/lib/content/schemas";

const COL_HEADING = "text-[0.9375rem] font-bold uppercase tracking-[0.06em]";
const COL_LIST = "mt-4 space-y-2 text-base text-muted";
const LINK = "transition-colors hover:text-action";

/**
 * Las cuatro columnas del pie: marca, ubicación y horario, atención y enlaces.
 *
 * Separadas de `Footer` (async, lee la API) para que la vista previa de
 * `/admin/content` (A5.4) use el mismo marcado. La advertencia legal +18 no
 * está aquí: no es contenido editable y se queda en `Footer`.
 */
export function ContactView({
  contact,
  preview = false,
}: {
  contact: ContactContent;
  /** Vista previa de la consola: sin el ancla `#nosotros` de la página. */
  preview?: boolean;
}) {
  const phoneHref = telLink();

  return (
    <div className="mx-auto mt-12 grid max-w-vp grid-cols-1 gap-block border-b-2 border-muted px-inline pb-10 md:grid-cols-4">
      {/* Col 1: marca. Era el destino de «Nosotros» hasta V8; el id se
          conserva para los enlaces `/#nosotros` ya compartidos. */}
      <div id={preview ? undefined : "nosotros"} className="scroll-mt-24">
        <Image
          src="/logo-detalle.svg"
          alt="Vapeupar"
          width={1319}
          height={786}
          className="h-9 w-auto"
        />

        <p className="mt-4 text-base leading-relaxed text-muted">
          {contact.about}
        </p>
      </div>

      {/* Col 2: Location & Hours */}
      <div>
        <h3 className={COL_HEADING}>Ubicación y cobertura</h3>
        <ul className={COL_LIST}>
          <li>{contact.location}</li>
          {contact.hours.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
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
          {contact.service.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </div>

      {/* Col 4: Quick Links */}
      <div>
        <h3 className={COL_HEADING}>Categorías rápidas</h3>
        <ul className={COL_LIST}>
          {COLLECTIONS.slice(0, 3).map((c) => (
            <li key={c.slug}><Link href={`/coleccion/${c.slug}`} className={LINK}>{c.label}</Link></li>
          ))}
          <li><Link href="/nosotros" className={LINK}>Nosotros</Link></li>
          {/* `/#faq` y no `#faq`: el pie sale también en la ficha, la colección y nosotros. */}
          <li><Link href="/#faq" className={LINK}>Preguntas frecuentes</Link></li>
        </ul>
      </div>
    </div>
  );
}
