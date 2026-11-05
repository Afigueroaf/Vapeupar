import { waLink } from "@/lib/contact";

/**
 * Glifo de WhatsApp.
 *
 * Va escrito a mano porque Lucide dejó de distribuir marcas comerciales y el
 * sistema no admite dependencias nuevas por un icono (`.claude/skills/frontend`).
 * El trazo es el oficial de la marca, en `currentColor` para que herede el
 * color del botón en vez de traer su verde, que está fuera de la paleta (§2.5).
 */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  );
}

/**
 * Botón flotante de WhatsApp.
 *
 * Sustituye al CTA que vivía en la cabecera: ahí competía con el logo, la
 * navegación, el carrito y el menú en una fila que en móvil ya iba apretada,
 * y se perdía en cuanto el visitante bajaba al catálogo. Flotando queda
 * disponible en todo momento sin ocupar sitio en el armazón.
 *
 * DÓNDE SE MONTA: fuera de `.vp-glitch` (ver `page.tsx`). Un `filter` en un
 * ancestro lo convierte en bloque contenedor de sus descendientes
 * `position: fixed`, y el botón dejaría de estar anclado al viewport para
 * anclarse al contenido filtrado.
 *
 * GLITCH: lo lleva igualmente, pero por `.vp-glitch-chip`, que aplica el
 * filtro al propio botón en vez de heredarlo de un ancestro. Un `filter` en el
 * elemento no cambia su propio posicionamiento, así que sigue fijo. Usa una
 * región de filtro más holgada que la de página porque en una caja de 56px la
 * de página recortaría la separación de canales (ver `globals.css`).
 *
 * TENSIÓN CON §11 (regla 2, un solo CTA primario por vista): el relleno lima
 * es el color de acción del sistema y el hero ya gasta su primario. Se acepta
 * aquí porque el botón es permanente y de 56px en una esquina, no un bloque en
 * el flujo que compita por la misma mirada; si llega a estorbar, la variante
 * sobria es `bg-surface` con borde y glifo lima.
 *
 * Sin `NEXT_PUBLIC_WHATSAPP_NUMBER` no se pinta nada: la regla del proyecto es
 * que no hay número por defecto (§6.9).
 */
export function WhatsappFab() {
  const href = waLink("Hola Vapeupar, quiero consultar sobre su catálogo");

  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribir a Vapeupar por WhatsApp"
      // `z-40` lo deja por debajo de la puerta +18 (`z-50`), que debe taparlo
      // por completo mientras el visitante no haya confirmado su edad.
      //
      // Los márgenes suman `env(safe-area-inset-*)`: en un iPhone sin botón de
      // inicio, 20px fijos lo dejarían pisando la barra gestual.
      className="vp-glitch-chip fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] z-40 flex size-14 items-center justify-center rounded-vp border-2 border-action bg-action text-action-ink shadow-[4px_4px_0_0_var(--color-accent)] transition-[translate,box-shadow] duration-150 ease-vp hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_var(--color-accent)] active:translate-x-0 active:translate-y-0 active:shadow-[2px_2px_0_0_var(--color-accent)]"
    >
      <WhatsAppGlyph className="size-7" />
    </a>
  );
}
