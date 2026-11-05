import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { TrustStage } from "@/components/trust-stage";
import type { Product } from "@/types/product";

/**
 * Banda de señales de confianza.
 *
 * Contenido que antes vivía dentro del hero como "value props" con iconos.
 * Se extrae a su propia banda para que el hero quede con un solo mensaje
 * (`docs/design-reset-inventory.md` §5.7). Los iconos decorativos se
 * sustituyen por etiquetas pixel (§4.6).
 */
const ITEMS = [
  {
    label: "Envío",
    title: "Domicilio en Valledupar",
    detail: "Entrega rápida en tu puerta",
  },
  {
    label: "Original",
    title: "Productos 100% originales",
    detail: "Verificables con código QR",
  },
  {
    label: "Pago",
    title: "Pago contra entrega",
    detail: "Efectivo, Nequi y Daviplata",
  },
];

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

export function TrustBand({ showcase }: TrustBandProps) {
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
    <section aria-label="Garantías de compra" className="border-b-2 border-line">
      {/* La colocación la decide `TrustStage`, que es de cliente porque el
          cajón de móvil tiene estado: de `lg` para arriba, tarjetas al lado del
          prisma; por debajo, prisma a sangre y tarjetas en un cajón que entra
          desde el borde derecho.

          Las tres tarjetas comparten un campo de fondo continuo y reaccionan al
          puntero. Ver `.vp-card` en `globals.css` y `ui/card-field.tsx`. El
          campo mide sus tarjetas con un `querySelectorAll` recursivo, así que
          anidarlas en una columna —o en el cajón— no rompe la continuidad. */}
      <TrustStage showcase={showcase}>
        {ITEMS.map((item) => (
          /* Más apretadas por debajo de `lg` de lo que estaban: ahora las tres
             tienen que caber en el alto del escenario en vez de repartirse la
             banda entera. El escalón de `lg` deja intacto lo de escritorio. */
          /* `vp-glitch-card`: antes estas tarjetas no lo llevaban porque iban
             dentro de una franja filtrada, y anidar un filtro dentro de otro
             separaría los canales dos veces. Al quitarle el filtro a la
             sección, pasan a llevarlo ellas. */
          <Surface key={item.label} className="vp-card vp-glitch-card p-3 sm:p-4 lg:p-5">
            <PixelLabel variant="lime">{item.label}</PixelLabel>
            <h3 className="mt-2 text-base font-bold leading-tight sm:mt-3 sm:text-lg lg:mt-4 lg:text-xl">
              {item.title}
            </h3>
            <p className="mt-1 text-sm text-muted sm:text-base">{item.detail}</p>
          </Surface>
        ))}
      </TrustStage>
    </section>
  );
}
