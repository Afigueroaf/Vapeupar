import { HeroView } from "@/components/hero-view";
import { VAPORIZER_ANCHOR_ATTRIBUTE } from "@/components/vaporizer/anchor";
import { getContent } from "@/lib/content";

/**
 * Etiqueta y reclamo salen de la clave `hero` del contenido (A7.4). El texto
 * lo pinta `HeroView`, que la consola reutiliza para la vista previa (A5.4).
 */
export async function Hero() {
  const content = await getContent("hero");

  return (
    <section
      aria-label="Bienvenida y propuesta de valor"
      /*
        LA INTRO MIDE UNA PANTALLA MENOS LA BARRA (`--vp-screen`), en cualquier
        orientación: es lo que se ve al llegar, y nada de la banda de debajo
        asoma por el borde inferior.

        La sección es una columna flexible y la rejilla de dentro la llena
        (`flex-1`). En horizontal eso basta: la fila se estira hasta ese alto y
        `items-center` deja logotipo y vaporizador centrados en vertical, con el
        sobrante repartido arriba y abajo.

        En vertical, además, el contenido se reparte el alto: el texto se queda
        con lo suyo y el hueco del vaporizador con todo lo demás. Para eso:

        - la rejilla es SIEMPRE de una columna, también en una tableta en
          vertical de más de `lg`, donde el lado a lado dejaba el vaporizador
          encogido en media columna;
        - la fila del hueco es `minmax(0, 1fr)` y el hueco deja de ser
          `aspect-square` para estirarse en ella. El vaporizador no se deforma:
          el componente 3D mide su ancla con `min(ancho, alto)`
          (`vaporizer-point-cloud.tsx`), así que en un hueco más alto que
          ancho se ciñe al ancho y queda centrado.

        Es un mínimo y no un alto fijo, como en la banda. En un teléfono muy
        bajo el hueco tiene un suelo (`min-h-56`) y la intro crece antes que
        dejar el vaporizador en una rendija; en un teléfono girado, donde la
        pantalla útil son unos 310px, la intro apilada mide más que eso y el
        mínimo no actúa.
      */
      className="vp-glitch flex min-h-[var(--vp-screen)] flex-col border-b-2 border-line"
    >
      <div className="mx-auto grid w-full max-w-vp items-center gap-12 px-inline py-section sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 flex-1 portrait:grid-cols-1 portrait:grid-rows-[auto_minmax(0,1fr)] portrait:gap-8">
        {/* Columna de texto: la misma vista que la previa de /admin/content. */}
        <HeroView content={content} />

        {/*
          Hueco del render 3D (`docs/design-reset-inventory.md` §7.5).

          Aquí NO vive el lienzo. Desde que el marco violeta abarca la intro
          entera más la banda de confianza, el lienzo cubre todo ese bloque y
          se monta en `app/page.tsx`. Este elemento solo reserva el espacio en
          la rejilla y le dice al componente 3D dónde anclar el objeto, de modo
          que el vaporizador se queda en esta columna en lugar de irse al
          centro del marco. Al medirse en cada cambio de tamaño, el anclaje
          sigue a la maqueta también cuando la rejilla se apila en móvil.
        */}
        <div
          aria-hidden="true"
          {...{ [VAPORIZER_ANCHOR_ATTRIBUTE]: "" }}
          className="aspect-square w-full portrait:aspect-auto portrait:h-full portrait:min-h-56 portrait:self-stretch"
        />
      </div>
    </section>
  );
}
