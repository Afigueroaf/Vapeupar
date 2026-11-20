import { TrustBandCards } from "@/components/trust-band-view";
import { SHOWCASE_TITLE_ID, TrustStage } from "@/components/trust-stage";
import { getContent } from "@/lib/content";
import type { Product } from "@/types/product";

/**
 * Banda de la vitrina: «Productos destacados», con la información de compra
 * en un panel que se desliza por encima (`TrustStage`).
 *
 * Las tarjetas son las señales de confianza que antes vivían dentro del hero
 * como "value props" con iconos, y que se sacaron para que el hero quedara con
 * un solo mensaje (`docs/design-reset-inventory.md` §5.7). Los iconos
 * decorativos se sustituyen por etiquetas pixel (§4.6).
 *
 * Sus textos salen de la clave `trust-band` del contenido (A7.4); sin API,
 * del valor por defecto en `lib/content/schemas.ts`. Las pinta
 * `TrustBandCards`, que la consola reutiliza para la vista previa (A5.4).
 */

interface TrustBandProps {
  /**
   * Productos de los que el prisma saca sus caras: los elegidos para la
   * vitrina desde la consola.
   *
   * La selección ya viene hecha de `app/page.tsx`, que es quien habla con la
   * API y quien decide el respaldo cuando no hay ninguno elegido. Aquí no se
   * filtra nada: la banda solo presta el hueco.
   */
  showcase: Product[];
}

export async function TrustBand({ showcase }: TrustBandProps) {
  const { items } = await getContent("trust-band");

  return (
    /* SIN `vp-glitch` EN LA SECCIÓN, Y LA RAZÓN ES EL LIENZO QUE LLEVA DENTRO.
       Un `filter` sobre este bloque obliga a rasterizarlo entero en una
       superficie aparte, y la vitrina 3D de dentro anima a 60 fps: cada
       fotograma invalidaba esa superficie y forzaba a rehacer el filtro. En un
       Moto G15 eso aparecía en la traza como medio segundo de GPU cada vez que
       una ráfaga coincidía con el scroll.

       La vitrina no pierde el glitch: lo hace ella, dentro de la escena y sobre
       una foto del instante en que saltó (`prism/ghost.ts`). El filtro CSS baja
       a las tres tarjetas, que es lo único de esta banda que lo necesitaba.
       Lo que deja de glitchear es el borde inferior de la sección: dos píxeles
       de línea sobre negro. */
    /* Alto de una pantalla menos la barra de navegación (`--vp-screen`):

       - en vertical, a cualquier ancho: cada sección de la portada ocupa
         exactamente lo que se ve debajo de la barra;
       - en escritorio, porque es lo que agranda el prisma: en un hueco
         apaisado su tamaño lo manda el alto.

       Es un mínimo y no un alto fijo: si algún contenido no cabe —las tres
       tarjetas apiladas en un teléfono muy bajo—, la banda crece antes que
       recortarlo. Ver la rejilla de `app/page.tsx`, que en los dos casos deja
       de igualarla con la intro. */
    <section
      aria-labelledby={SHOWCASE_TITLE_ID}
      className="grid border-b-2 border-line portrait:min-h-[var(--vp-screen)] lg:min-h-[var(--vp-screen)]"
    >
      {/* Las dos escenas —vitrina e información— y los tiradores que las
          cambian los lleva `TrustStage`, que es de cliente porque el cambio
          tiene estado.

          Las tres tarjetas comparten un campo de fondo continuo y reaccionan al
          puntero. Ver `.vp-card` en `globals.css` y `ui/card-field.tsx`. */}
      <TrustStage showcase={showcase}>
        <TrustBandCards items={items} />
      </TrustStage>
    </section>
  );
}
